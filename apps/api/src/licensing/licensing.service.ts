import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  and,
  assets,
  auditEvents,
  desc,
  downloadEvents,
  eq,
  licenseGrants,
  licenseTermsVersions,
  sql,
  withTenant,
  type Database,
} from "@bigstock/database";
import type { LicenseDto } from "@bigstock/contracts";
import { EntitlementsService } from "../billing/entitlements.service.js";
import { DB } from "../database.module.js";
import { decodeCursor, encodeCursor } from "../catalog/cursor.js";
import { StorageService } from "../catalog/storage.service.js";
import { signDownload, verifyDownload } from "./download-token.js";

const isUnique = (e: unknown) => (e as { cause?: { code?: string } })?.cause?.code === "23505";

/** Elegibilidade do ativo; a quota do plano é verificada por EntitlementsService (sempre no backend, CLAUDE.md §5). */
function assertEligible(_org: string, asset: { status: string }) {
  if (asset.status !== "published") throw new NotFoundException({ code: "not_found", message: "Asset not found" });
}

@Injectable()
export class LicensingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async currentTerms() {
    const [t] = await this.db.select().from(licenseTermsVersions).orderBy(desc(licenseTermsVersions.effectiveFrom)).limit(1);
    if (!t) throw new Error("no license terms configured");
    return t;
  }

  /** Idempotente por (organização, Idempotency-Key). Licenciar duas vezes o mesmo ativo devolve a licença existente. */
  async license(orgId: string, userId: string, assetId: string, idemKey: string, requestId: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await withTenant(this.db, orgId, async (tx) => {
          const [byKey] = await tx
            .select()
            .from(licenseGrants)
            .where(and(eq(licenseGrants.organizationId, orgId), eq(licenseGrants.idempotencyKey, idemKey)));
          if (byKey) {
            if (byKey.assetId !== assetId) {
              throw new ConflictException({ code: "idempotency_conflict", message: "Idempotency-Key was used for a different asset" });
            }
            return { grant: byKey, created: false };
          }
          const [byAsset] = await tx
            .select()
            .from(licenseGrants)
            .where(and(eq(licenseGrants.organizationId, orgId), eq(licenseGrants.assetId, assetId)));
          if (byAsset) return { grant: byAsset, created: false };

          const [asset] = await tx.select().from(assets).where(eq(assets.id, assetId));
          if (!asset) throw new NotFoundException({ code: "not_found", message: "Asset not found" });
          assertEligible(orgId, asset);
          // Serializa por organização para a quota não ser ultrapassada por pedidos concorrentes.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${orgId}, 0))`);
          await this.entitlements.assertCanLicense(tx, orgId);
          const terms = await this.currentTerms();
          const [grant] = await tx
            .insert(licenseGrants)
            .values({ organizationId: orgId, assetId, userId, termsVersionId: terms.id, idempotencyKey: idemKey })
            .returning();
          await tx.insert(auditEvents).values({
            organizationId: orgId, actorUserId: userId, action: "license.grant",
            resourceType: "asset", resourceId: assetId, requestId, metadata: { terms: terms.version },
          });
          return { grant: grant!, created: true };
        });
      } catch (e) {
        if (isUnique(e) && attempt === 0) continue; // pedido concorrente com a mesma chave/ativo: reler
        throw e;
      }
    }
    throw new Error("unreachable");
  }

  async list(orgId: string, limit: number, cursor?: string) {
    const cur = decodeCursor<{ t: string; id: string }>(cursor);
    if (cursor && !cur) throw new BadRequestException({ code: "invalid_cursor", message: "Invalid cursor" });
    const rows = await withTenant(this.db, orgId, (tx) =>
      tx
        .select({
          id: licenseGrants.id,
          created: sql<string>`${licenseGrants.createdAt}::text`,
          createdAt: licenseGrants.createdAt,
          licenseType: licenseGrants.licenseType,
          terms: licenseTermsVersions.version,
          asset: assets,
        })
        .from(licenseGrants)
        .innerJoin(assets, eq(assets.id, licenseGrants.assetId))
        .innerJoin(licenseTermsVersions, eq(licenseTermsVersions.id, licenseGrants.termsVersionId))
        .where(cur ? sql`(${licenseGrants.createdAt}, ${licenseGrants.id}) < (${cur.t}::timestamptz, ${cur.id}::uuid)` : undefined)
        .orderBy(desc(licenseGrants.createdAt), desc(licenseGrants.id))
        .limit(limit + 1),
    );
    const page = rows.slice(0, limit);
    const data: LicenseDto[] = page.map((r) => ({
      id: r.id,
      created_at: r.createdAt.toISOString(),
      license_type: r.licenseType,
      terms_version: r.terms,
      asset: { id: r.asset.id, title: r.asset.title, kind: r.asset.kind, width: r.asset.width, height: r.asset.height, preview_url: `/v1/assets/${r.asset.id}/preview` },
    }));
    const last = page.at(-1);
    const hasMore = rows.length > limit;
    return { data, has_more: hasMore, next_cursor: hasMore && last ? encodeCursor({ t: last.created, id: last.id }) : null };
  }

  /** Licenças já concedidas continuam descarregáveis mesmo que o ativo seja despublicado depois. */
  async issueDownload(orgId: string, userId: string, grantId: string) {
    const [g] = await withTenant(this.db, orgId, (tx) => tx.select().from(licenseGrants).where(eq(licenseGrants.id, grantId)));
    if (!g) throw new NotFoundException({ code: "not_found", message: "License not found" });
    const { token, expiresAt } = signDownload({ g: g.id, o: orgId, u: userId });
    return { url: `/v1/downloads/${token}`, expires_at: expiresAt.toISOString() };
  }

  async redeem(
    token: string,
    requestId: string,
  ): Promise<{ redirectUrl: string } | { body: Buffer; contentType: string; filename: string }> {
    const claims = verifyDownload(token);
    if (!claims) throw new NotFoundException({ code: "invalid_download_link", message: "Download link is invalid or expired" });
    const row = await withTenant(this.db, claims.o, async (tx) => {
      const [r] = await tx
        .select({ grant: licenseGrants, asset: assets })
        .from(licenseGrants)
        .innerJoin(assets, eq(assets.id, licenseGrants.assetId))
        .where(eq(licenseGrants.id, claims.g));
      if (!r?.asset.originalKey || !r.asset.originalContentType) return null;
      await tx.insert(downloadEvents).values({ organizationId: claims.o, grantId: claims.g, userId: claims.u });
      await tx.insert(auditEvents).values({
        organizationId: claims.o, actorUserId: claims.u, action: "license.download",
        resourceType: "asset", resourceId: r.asset.id, requestId,
      });
      return r.asset;
    });
    if (!row?.originalKey || !row.originalContentType) throw new NotFoundException({ code: "not_found", message: "File not found" });
    const ext = row.originalContentType === "image/png" ? "png" : row.originalContentType === "image/webp" ? "webp" : "jpg";
    const slug = row.title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "imagem";
    const filename = `${slug}.${ext}`;
    // Com S3/R2: redireciona para um URL assinado de 60 s (funciona com ficheiros grandes em serverless).
    const redirectUrl = await this.storage.signedDownloadUrl(row.originalKey, { filename, contentType: row.originalContentType });
    if (redirectUrl) return { redirectUrl };
    return { body: await this.storage.get(row.originalKey), contentType: row.originalContentType, filename };
  }
}
