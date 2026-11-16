import { Inject, Injectable, Logger } from "@nestjs/common";
import { aiJobs, assets, auditEvents, eq, withTenant, type Database } from "@bigstock/database";
import { CreditsService } from "../billing/credits.service.js";
import { StorageService } from "../catalog/storage.service.js";
import { DB } from "../database.module.js";
import { IMAGE_PROVIDER, ProviderError, type ImageProvider } from "./image-provider.js";
import type { LogoBrief } from "@bigstock/contracts";
import { buildLogoPrompt } from "./logo-prompt.js";
import { buildProvenance, embedAiProvenance } from "./png-provenance.js";

export class RetryableError extends Error {}

/**
 * Executa um trabalho de IA. Idempotente: reexecutar um trabalho já concluído ou falhado só
 * reconcilia os créditos (consume/release são idempotentes). Regra de ouro (CLAUDE.md §6):
 * sucesso → consume; falha sem entrega → release.
 */
@Injectable()
export class AiRunnerService {
  private readonly log = new Logger(AiRunnerService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(IMAGE_PROVIDER) private readonly provider: ImageProvider,
    private readonly credits: CreditsService,
    private readonly storage: StorageService,
  ) {}

  async run(orgId: string, jobId: string, attemptsLeft: number): Promise<void> {
    const job = await withTenant(this.db, orgId, async (tx) => (await tx.select().from(aiJobs).where(eq(aiJobs.id, jobId)))[0]);
    if (!job) return;
    if (job.status === "succeeded") {
      await this.credits.consume(orgId, job.reservationId);
      return;
    }
    if (job.status === "failed") {
      await this.credits.release(orgId, job.reservationId);
      return;
    }

    await withTenant(this.db, orgId, (tx) =>
      tx.update(aiJobs).set({ status: "running", attempts: job.attempts + 1, startedAt: job.startedAt ?? new Date() }).where(eq(aiJobs.id, jobId)),
    );

    try {
      let reference: { bytes: Buffer; contentType: string } | undefined;
      if (job.referenceAssetId) {
        const [a] = await this.db.select().from(assets).where(eq(assets.id, job.referenceAssetId));
        // Defesa em profundidade: revalida na execução.
        if (!a?.originalKey || !a.originalContentType || !a.allowsAiTransform) throw new ProviderError("permanent", "reference asset not usable");
        reference = { bytes: await this.storage.get(a.originalKey), contentType: a.originalContentType };
      }
      const out = await this.provider.generate({ prompt: job.kind === "logo" && job.brief ? buildLogoPrompt(job.brief as LogoBrief, job.prompt === (job.brief as LogoBrief).brandName ? undefined : job.prompt) : job.prompt, size: job.size as never, quality: job.quality as never, reference });
      const provenance = buildProvenance({ provider: this.provider.name, model: this.provider.model, jobId, providerRequestId: out.providerRequestId });
      const bytes = out.contentType === "image/png" ? embedAiProvenance(out.bytes, provenance) : out.bytes;
      const key = `ai/${orgId}/${jobId}.${out.contentType === "image/png" ? "png" : "bin"}`;
      await this.storage.put(key, bytes, out.contentType);
      await withTenant(this.db, orgId, async (tx) => {
        await tx
          .update(aiJobs)
          .set({
            status: "succeeded", provider: this.provider.name, model: this.provider.model, outputKey: key, outputContentType: out.contentType,
            width: out.width, height: out.height, provenance, finishedAt: new Date(), errorCode: null,
          })
          .where(eq(aiJobs.id, jobId));
        await tx.insert(auditEvents).values({ organizationId: orgId, actorUserId: job.userId, action: "ai.job.succeeded", resourceType: "ai_job", resourceId: jobId, metadata: { provider: this.provider.name, model: this.provider.model } });
      });
      await this.credits.consume(orgId, job.reservationId);
    } catch (e) {
      const transient = !(e instanceof ProviderError) || e.kind === "transient";
      if (transient && attemptsLeft > 0) {
        await withTenant(this.db, orgId, (tx) => tx.update(aiJobs).set({ status: "queued" }).where(eq(aiJobs.id, jobId)));
        throw new RetryableError((e as Error).message);
      }
      const code = e instanceof ProviderError ? (e.kind === "content_rejected" ? "content_rejected" : e.kind === "transient" ? "provider_unavailable" : "generation_failed") : "generation_failed";
      this.log.warn({ msg: "ai job failed", jobId, code, error: (e as Error).message });
      await withTenant(this.db, orgId, async (tx) => {
        await tx.update(aiJobs).set({ status: "failed", errorCode: code, finishedAt: new Date(), provider: this.provider.name, model: this.provider.model }).where(eq(aiJobs.id, jobId));
        await tx.insert(auditEvents).values({ organizationId: orgId, actorUserId: job.userId, action: "ai.job.failed", resourceType: "ai_job", resourceId: jobId, metadata: { code } });
      });
      // Falha sem entrega: devolve os créditos reservados.
      await this.credits.release(orgId, job.reservationId);
    }
  }
}
