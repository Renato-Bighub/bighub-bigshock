import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  assets,
  auditEvents,
  categories,
  eq,
  rightsRecords,
  sql,
  type Database,
} from "@bigstock/database";
import type { AssetDto, AssetListQuery, CreateAssetBody, RightsBody } from "@bigstock/contracts";
import { DB } from "../database.module.js";
import { decodeCursor, encodeCursor } from "./cursor.js";
import { EXT, sniffImage } from "./image-type.js";
import { StorageService } from "./storage.service.js";

type AssetRow = typeof assets.$inferSelect;

const toDto = (a: AssetRow): AssetDto => ({
  id: a.id,
  title: a.title,
  description: a.description,
  kind: a.kind,
  category: a.categorySlug,
  tags: a.tags,
  width: a.width,
  height: a.height,
  allows_ai_transform: a.allowsAiTransform,
  preview_url: `/v1/assets/${a.id}/preview`,
  published_at: a.publishedAt?.toISOString() ?? null,
});

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  listCategories() {
    return this.db.select().from(categories);
  }

  /**
   * Pesquisa pública: só ativos publicados. Com `q`, FTS em português e inglês
   * ordenado por relevância; sem `q`, mais recentes primeiro. Paginação por cursor (keyset).
   */
  async search(query: AssetListQuery): Promise<{ data: AssetDto[]; next_cursor: string | null; has_more: boolean }> {
    const limit = query.limit;
    const conds = [sql`a.status = 'published'`];
    if (query.category) conds.push(sql`a.category_slug = ${query.category}`);
    if (query.kind) conds.push(sql`a.kind = ${query.kind}`);
    const q = query.q?.trim();

    let rankExpr = sql`0::real`;
    if (q) {
      conds.push(sql`(a.search_pt @@ websearch_to_tsquery('portuguese', ${q}) OR a.search_en @@ websearch_to_tsquery('english', ${q}))`);
      rankExpr = sql`GREATEST(ts_rank(a.search_pt, websearch_to_tsquery('portuguese', ${q})), ts_rank(a.search_en, websearch_to_tsquery('english', ${q})))`;
    }
    const cur = decodeCursor<{ r: number; t: string; id: string }>(query.cursor);
    if (query.cursor && !cur) throw new BadRequestException({ code: "invalid_cursor", message: "Invalid cursor" });
    if (cur) {
      conds.push(
        q
          ? sql`(${rankExpr}, a.id) < (${cur.r}::real, ${cur.id}::uuid)`
          : sql`(a.published_at, a.id) < (${cur.t}::timestamptz, ${cur.id}::uuid)`,
      );
    }
    const order = q ? sql`rank DESC, a.id DESC` : sql`a.published_at DESC, a.id DESC`;
    const rows = await this.db.execute<{ id: string; rank: number; pub: string }>(
      sql`SELECT a.id, ${rankExpr} AS rank, a.published_at::text AS pub FROM assets a WHERE ${sql.join(conds, sql` AND `)} ORDER BY ${order} LIMIT ${limit + 1}`,
    );
    const page = rows.rows.slice(0, limit);
    const ids = page.map((r) => r.id);
    const full = ids.length
      ? await this.db.select().from(assets).where(sql`${assets.id} IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`)
      : [];
    const byId = new Map(full.map((a) => [a.id, a]));
    const data = ids.map((i) => toDto(byId.get(i)!));
    const hasMore = rows.rows.length > limit;
    const last = page.at(-1);
    return {
      data,
      has_more: hasMore,
      next_cursor: hasMore && last ? encodeCursor({ r: last.rank, t: last.pub, id: last.id }) : null,
    };
  }

  async getPublished(id: string) {
    const [a] = await this.db.select().from(assets).where(eq(assets.id, id));
    if (!a || a.status !== "published") throw new NotFoundException({ code: "not_found", message: "Asset not found" });
    return a;
  }

  async preview(id: string) {
    const a = await this.getPublished(id);
    if (!a.previewKey || !a.previewContentType) throw new NotFoundException({ code: "not_found", message: "Preview not found" });
    return { body: await this.storage.get(a.previewKey), contentType: a.previewContentType };
  }

  detail(a: AssetRow) {
    return toDto(a);
  }

  // ---- Editorial (equipa da plataforma) ----

  async listAll(status?: string) {
    const rows = status
      ? await this.db.select().from(assets).where(sql`${assets.status} = ${status}`)
      : await this.db.select().from(assets);
    return rows.map(toDto);
  }

  async create(actorId: string, body: CreateAssetBody, requestId: string) {
    const [cat] = await this.db.select().from(categories).where(eq(categories.slug, body.category));
    if (!cat) throw new BadRequestException({ code: "unknown_category", message: "Unknown category" });
    const [a] = await this.db
      .insert(assets)
      .values({
        title: body.title,
        description: body.description ?? null,
        kind: body.kind,
        categorySlug: body.category,
        tags: body.tags,
        width: body.width,
        height: body.height,
        allowsAiTransform: body.allowsAiTransform,
        createdBy: actorId,
      })
      .returning();
    await this.audit(actorId, "asset.create", a!.id, requestId);
    return toDto(a!);
  }

  async setPreview(actorId: string, id: string, data: Buffer, requestId: string) {
    const a = await this.requireAsset(id);
    const type = sniffImage(data);
    if (!type) throw new BadRequestException({ code: "invalid_image", message: "Preview must be JPEG, PNG or WebP" });
    const key = `previews/${a.id}-${randomUUID()}.${EXT[type]}`;
    await this.storage.put(key, data);
    await this.db.update(assets).set({ previewKey: key, previewContentType: type }).where(eq(assets.id, id));
    await this.audit(actorId, "asset.preview", id, requestId);
  }

  async setRights(actor: { id: string; platformRole: "editor" | "admin" }, id: string, body: RightsBody, requestId: string) {
    await this.requireAsset(id);
    if (body.verified && actor.platformRole !== "admin") {
      throw new BadRequestException({ code: "forbidden_verification", message: "Only platform admins can verify rights" });
    }
    const values = {
      assetId: id,
      rightsHolder: body.rightsHolder,
      licenseBasis: body.licenseBasis,
      modelRelease: body.modelRelease,
      propertyRelease: body.propertyRelease,
      notes: body.notes ?? null,
      verifiedAt: body.verified ? new Date() : null,
      verifiedBy: body.verified ? actor.id : null,
    };
    await this.db.insert(rightsRecords).values(values).onConflictDoUpdate({ target: rightsRecords.assetId, set: values });
    await this.audit(actor.id, body.verified ? "rights.verify" : "rights.update", id, requestId);
    // Direitos deixam de estar verificados → o ativo sai de publicação.
    if (!body.verified) {
      await this.db.update(assets).set({ status: "unpublished" }).where(sql`${assets.id} = ${id} AND ${assets.status} = 'published'`);
    }
  }

  async publish(actorId: string, id: string, requestId: string) {
    const a = await this.requireAsset(id);
    if (!a.previewKey) throw new ConflictException({ code: "preview_missing", message: "Asset has no preview" });
    const [rights] = await this.db.select().from(rightsRecords).where(eq(rightsRecords.assetId, id));
    if (!rights?.verifiedAt) {
      throw new ConflictException({ code: "rights_not_verified", message: "Asset rights are not verified" });
    }
    await this.db.update(assets).set({ status: "published", publishedAt: new Date() }).where(eq(assets.id, id));
    await this.audit(actorId, "asset.publish", id, requestId);
  }

  async unpublish(actorId: string, id: string, requestId: string) {
    await this.requireAsset(id);
    await this.db.update(assets).set({ status: "unpublished" }).where(eq(assets.id, id));
    await this.audit(actorId, "asset.unpublish", id, requestId);
  }

  private async requireAsset(id: string) {
    const [a] = await this.db.select().from(assets).where(eq(assets.id, id));
    if (!a) throw new NotFoundException({ code: "not_found", message: "Asset not found" });
    return a;
  }

  private audit(actorId: string, action: string, assetId: string, requestId: string) {
    return this.db.insert(auditEvents).values({ actorUserId: actorId, action, resourceType: "asset", resourceId: assetId, requestId });
  }
}
