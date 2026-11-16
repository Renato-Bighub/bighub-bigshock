import { ConflictException, HttpException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  aiJobs,
  and,
  assets,
  auditEvents,
  desc,
  eq,
  inArray,
  licenseGrants,
  sql,
  withTenant,
  type Database,
} from "@bigstock/database";
import { aiPricingTable, estimateAiCost } from "@bigstock/billing";
import type { AiJobBody, AiJobDto, AiRequestBody } from "@bigstock/contracts";
import { CreditsService } from "../billing/credits.service.js";
import { decodeCursor, encodeCursor } from "../catalog/cursor.js";
import { StorageService } from "../catalog/storage.service.js";
import { DB } from "../database.module.js";
import { IMAGE_PROVIDER, type ImageProvider } from "./image-provider.js";
import { JOB_QUEUE, type JobQueue } from "./job-queue.js";

/** Trabalhos simultâneos por organização (queued + running). Acima disto: 429 com Retry-After. */
export const MAX_ACTIVE_JOBS_PER_ORG = 5;

type JobRow = typeof aiJobs.$inferSelect;

/** UUID determinístico por (organização, Idempotency-Key): a reserva de créditos é idempotente. */
export function reservationIdFor(orgId: string, idemKey: string): string {
  const h = createHash("sha256").update(`${orgId}:${idemKey}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

export const toJobDto = (j: JobRow, orgId: string): AiJobDto => ({
  id: j.id,
  kind: j.kind,
  prompt: j.prompt,
  size: j.size,
  quality: j.quality,
  status: j.status,
  cost_credits: j.costCredits,
  error_code: j.errorCode,
  ai_generated: true,
  provider: j.provider,
  model: j.model,
  output_url: j.status === "succeeded" ? `/v1/organizations/${orgId}/ai/jobs/${j.id}/output` : null,
  created_at: j.createdAt.toISOString(),
  finished_at: j.finishedAt?.toISOString() ?? null,
});

@Injectable()
export class AiService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(IMAGE_PROVIDER) private readonly provider: ImageProvider,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly credits: CreditsService,
    private readonly storage: StorageService,
  ) {}

  private assertAvailable() {
    if (!this.provider.enabled || !this.queue.enabled) {
      throw new HttpException({ code: "ai_unavailable", message: "AI generation is not configured in this environment" }, 503);
    }
  }

  pricing() {
    return aiPricingTable();
  }

  /** Mostrado ANTES de confirmar. O valor é indicativo: a criação do job recalcula sempre. */
  async estimate(orgId: string, body: AiRequestBody) {
    const kind = body.referenceAssetId ? "edit" : "generate";
    const cost = estimateAiCost({ kind, size: body.size, quality: body.quality });
    const available = await this.credits.balance(orgId);
    return { cost_credits: cost, available_credits: available, can_afford: available >= cost, kind };
  }

  async create(orgId: string, userId: string, body: AiJobBody, idemKey: string, requestId: string): Promise<{ job: AiJobDto; created: boolean }> {
    this.assertAvailable();
    const kind = body.referenceAssetId ? "edit" : "generate";
    const cost = estimateAiCost({ kind, size: body.size, quality: body.quality });
    // Nunca confiar no custo do cliente: se divergir, o utilizador volta a confirmar.
    if (body.expectedCostCredits !== cost) {
      throw new ConflictException({ code: "cost_changed", message: `Cost is now ${cost} credits`, cost_credits: cost });
    }

    const existing = await this.findByKey(orgId, idemKey);
    if (existing) {
      if (existing.prompt !== body.prompt) throw new ConflictException({ code: "idempotency_conflict", message: "Idempotency-Key was used for a different request" });
      return { job: toJobDto(existing, orgId), created: false };
    }

    if (body.referenceAssetId) await this.assertReferenceAllowed(orgId, body.referenceAssetId);

    const active = await withTenant(this.db, orgId, async (tx) => {
      const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(aiJobs).where(and(eq(aiJobs.organizationId, orgId), inArray(aiJobs.status, ["queued", "running"])));
      return r?.n ?? 0;
    });
    if (active >= MAX_ACTIVE_JOBS_PER_ORG) {
      throw new HttpException({ code: "rate_limited", message: "Too many active generations; wait for one to finish", retryAfter: 10 }, 429);
    }

    // 1) Reserva (falha com 402 insufficient_credits ANTES de qualquer job ser enfileirado).
    const reservationId = reservationIdFor(orgId, idemKey);
    await this.credits.reserve(orgId, reservationId, cost);

    // 2) Registo do job (idempotente pela chave única).
    let row: JobRow | undefined;
    try {
      row = await withTenant(this.db, orgId, async (tx) => {
        const rows = await tx
          .insert(aiJobs)
          .values({
            organizationId: orgId, userId, kind, prompt: body.prompt, size: body.size, quality: body.quality,
            referenceAssetId: body.referenceAssetId ?? null, costCredits: cost, reservationId, idempotencyKey: idemKey,
          })
          .onConflictDoNothing()
          .returning();
        if (rows[0]) {
          await tx.insert(auditEvents).values({ organizationId: orgId, actorUserId: userId, action: "ai.job.create", resourceType: "ai_job", resourceId: rows[0].id, requestId, metadata: { kind, cost } });
        }
        return rows[0];
      });
    } catch (e) {
      await this.credits.release(orgId, reservationId);
      throw e;
    }
    if (!row) {
      // Pedido concorrente com a mesma chave ganhou a corrida: devolve o dele (reserva é a mesma).
      const winner = await this.findByKey(orgId, idemKey);
      return { job: toJobDto(winner!, orgId), created: false };
    }

    // 3) Fila. Se falhar, devolve os créditos e marca o job como falhado.
    try {
      await this.queue.enqueue({ organizationId: orgId, aiJobId: row.id, reservationId });
    } catch {
      await this.fail(orgId, row.id, "enqueue_failed");
      await this.credits.release(orgId, reservationId);
      throw new HttpException({ code: "ai_unavailable", message: "Could not queue the generation; credits were not charged" }, 503);
    }
    return { job: toJobDto(row, orgId), created: true };
  }

  private async fail(orgId: string, jobId: string, code: string) {
    await withTenant(this.db, orgId, (tx) =>
      tx.update(aiJobs).set({ status: "failed", errorCode: code, finishedAt: new Date() }).where(eq(aiJobs.id, jobId)),
    );
  }

  /** Só se pode editar a partir de ativos licenciados pela organização que permitam transformação por IA. */
  private async assertReferenceAllowed(orgId: string, assetId: string) {
    const ok = await withTenant(this.db, orgId, async (tx) => {
      const [r] = await tx
        .select({ allows: assets.allowsAiTransform })
        .from(licenseGrants)
        .innerJoin(assets, eq(assets.id, licenseGrants.assetId))
        .where(and(eq(licenseGrants.organizationId, orgId), eq(licenseGrants.assetId, assetId)));
      return r;
    });
    if (!ok) throw new NotFoundException({ code: "not_found", message: "Reference asset not found among your licenses" });
    if (!ok.allows) throw new UnprocessableEntityException({ code: "ai_transform_not_allowed", message: "This asset does not allow AI transformation" });
  }

  private findByKey(orgId: string, key: string) {
    return withTenant(this.db, orgId, async (tx) => (await tx.select().from(aiJobs).where(and(eq(aiJobs.organizationId, orgId), eq(aiJobs.idempotencyKey, key))))[0]);
  }

  async get(orgId: string, id: string): Promise<JobRow> {
    const [j] = await withTenant(this.db, orgId, (tx) => tx.select().from(aiJobs).where(and(eq(aiJobs.organizationId, orgId), eq(aiJobs.id, id))));
    if (!j) throw new NotFoundException({ code: "not_found", message: "Job not found" });
    return j;
  }

  async list(orgId: string, limit: number, cursor?: string) {
    const cur = decodeCursor<{ t: string; id: string }>(cursor);
    const rows = await withTenant(this.db, orgId, (tx) =>
      tx
        .select({ job: aiJobs, created: sql<string>`${aiJobs.createdAt}::text` })
        .from(aiJobs)
        .where(and(eq(aiJobs.organizationId, orgId), cur ? sql`(${aiJobs.createdAt}, ${aiJobs.id}) < (${cur.t}::timestamptz, ${cur.id}::uuid)` : undefined))
        .orderBy(desc(aiJobs.createdAt), desc(aiJobs.id))
        .limit(limit + 1),
    );
    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const last = page.at(-1);
    return {
      data: page.map((r) => toJobDto(r.job, orgId)),
      has_more: hasMore,
      next_cursor: hasMore && last ? encodeCursor({ t: last.created, id: last.job.id }) : null,
    };
  }

  /** Saída privada da organização, servida só a membros (nunca por URL público nem catálogo). */
  async output(orgId: string, id: string) {
    const j = await this.get(orgId, id);
    if (j.status !== "succeeded" || !j.outputKey || !j.outputContentType) throw new NotFoundException({ code: "not_found", message: "Output not available" });
    return { body: await this.storage.get(j.outputKey), contentType: j.outputContentType };
  }
}
