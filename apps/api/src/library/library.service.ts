import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, assets, collectionItems, collections, count, desc, eq, favorites, sql, withTenant, type Database } from "@bigstock/database";
import { LIBRARY_LIMITS, type CollectionDto, type CollectionPatchBody, type LibraryAssetDto, type Role } from "@bigstock/contracts";
import { decodeCursor, encodeCursor } from "../catalog/cursor.js";
import { DB } from "../database.module.js";

const previewUrl = (id: string) => `/v1/assets/${id}/preview`;
const assetDto = (a: typeof assets.$inferSelect): LibraryAssetDto => ({ id: a.id, title: a.title, kind: a.kind, width: a.width, height: a.height, preview_url: previewUrl(a.id) });
const isUnique = (e: unknown) => (e as { cause?: { code?: string } })?.cause?.code === "23505";

/** Biblioteca (favoritos e coleções). Sempre dentro de withTenant: o RLS isola organizações. */
@Injectable()
export class LibraryService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async assertPublished(tx: Parameters<Parameters<typeof withTenant>[2]>[0], assetId: string) {
    const [a] = await tx.select({ status: assets.status }).from(assets).where(eq(assets.id, assetId)).limit(1);
    if (!a || a.status !== "published") throw new NotFoundException({ code: "not_found", message: "Asset not found" });
  }

  // ---- Favoritos (por utilizador) -------------------------------------------------

  async listFavorites(orgId: string, userId: string, limit: number, cursor?: string) {
    const cur = decodeCursor<{ t: string; id: string }>(cursor);
    if (cursor && !cur) throw new BadRequestException({ code: "invalid_cursor", message: "Invalid cursor" });
    const rows = await withTenant(this.db, orgId, (tx) =>
      tx
        .select({ id: favorites.id, created: sql<string>`${favorites.createdAt}::text`, asset: assets })
        .from(favorites)
        .innerJoin(assets, eq(assets.id, favorites.assetId))
        .where(and(eq(favorites.userId, userId), eq(assets.status, "published"), cur ? sql`(${favorites.createdAt}, ${favorites.id}) < (${cur.t}::timestamptz, ${cur.id}::uuid)` : undefined))
        .orderBy(desc(favorites.createdAt), desc(favorites.id))
        .limit(limit + 1),
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const hasMore = rows.length > limit;
    return { data: page.map((r) => assetDto(r.asset)), has_more: hasMore, next_cursor: hasMore && last ? encodeCursor({ t: last.created, id: last.id }) : null };
  }

  /** Ids favoritados pelo utilizador, para marcar os corações no Explorar. */
  async favoriteIds(orgId: string, userId: string): Promise<string[]> {
    const rows = await withTenant(this.db, orgId, (tx) =>
      tx.select({ assetId: favorites.assetId }).from(favorites).where(eq(favorites.userId, userId)).orderBy(desc(favorites.createdAt)).limit(LIBRARY_LIMITS.favoritesPerUser),
    );
    return rows.map((r) => r.assetId);
  }

  async addFavorite(orgId: string, userId: string, assetId: string): Promise<void> {
    await withTenant(this.db, orgId, async (tx) => {
      await this.assertPublished(tx, assetId);
      const [c] = await tx.select({ n: count() }).from(favorites).where(eq(favorites.userId, userId));
      if ((c?.n ?? 0) >= LIBRARY_LIMITS.favoritesPerUser) throw new ConflictException({ code: "limit_reached", message: "Favorites limit reached" });
      await tx.insert(favorites).values({ organizationId: orgId, userId, assetId }).onConflictDoNothing();
    });
  }

  async removeFavorite(orgId: string, userId: string, assetId: string): Promise<void> {
    await withTenant(this.db, orgId, (tx) => tx.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.assetId, assetId))));
  }

  // ---- Coleções (partilhadas pela organização) --------------------------------------

  private collectionSelect() {
    // Conta/capa só consideram ativos ainda publicados.
    const colId = sql.raw('"collections"."id"');
    const published = sql`ci.asset_id IN (SELECT id FROM assets WHERE status = 'published')`;
    return {
      id: collections.id,
      name: collections.name,
      description: collections.description,
      createdBy: collections.createdBy,
      createdAt: collections.createdAt,
      updatedAt: collections.updatedAt,
      itemCount: sql<number>`(SELECT count(*)::int FROM collection_items ci WHERE ci.collection_id = ${colId} AND ${published})`,
      cover: sql<string | null>`(SELECT ci.asset_id::text FROM collection_items ci WHERE ci.collection_id = ${colId} AND ${published} ORDER BY ci.created_at DESC, ci.id DESC LIMIT 1)`,
    };
  }

  private toCollectionDto(r: { id: string; name: string; description: string | null; createdBy: string; createdAt: Date; updatedAt: Date; itemCount: number; cover: string | null }): CollectionDto {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      item_count: r.itemCount,
      cover_preview_url: r.cover ? previewUrl(r.cover) : null,
      created_by: r.createdBy,
      created_at: r.createdAt.toISOString(),
      updated_at: r.updatedAt.toISOString(),
    };
  }

  async listCollections(orgId: string): Promise<CollectionDto[]> {
    const rows = await withTenant(this.db, orgId, (tx) =>
      tx.select(this.collectionSelect()).from(collections).orderBy(desc(collections.updatedAt), desc(collections.id)).limit(LIBRARY_LIMITS.collectionsPerOrg),
    );
    return rows.map((r) => this.toCollectionDto(r));
  }

  async getCollection(orgId: string, collectionId: string): Promise<CollectionDto> {
    const [r] = await withTenant(this.db, orgId, (tx) => tx.select(this.collectionSelect()).from(collections).where(eq(collections.id, collectionId)).limit(1));
    if (!r) throw new NotFoundException({ code: "not_found", message: "Collection not found" });
    return this.toCollectionDto(r);
  }

  async createCollection(orgId: string, userId: string, body: { name: string; description?: string }): Promise<CollectionDto> {
    const id = await withTenant(this.db, orgId, async (tx) => {
      const [c] = await tx.select({ n: count() }).from(collections);
      if ((c?.n ?? 0) >= LIBRARY_LIMITS.collectionsPerOrg) throw new ConflictException({ code: "limit_reached", message: "Collections limit reached" });
      const [row] = await tx.insert(collections).values({ organizationId: orgId, name: body.name, description: body.description ?? null, createdBy: userId }).returning({ id: collections.id });
      return row!.id;
    });
    return this.getCollection(orgId, id);
  }

  /** Só quem criou a coleção, ou admin/owner, a altera ou apaga. */
  private async assertCanManage(tx: Parameters<Parameters<typeof withTenant>[2]>[0], collectionId: string, userId: string, role: Role) {
    const [c] = await tx.select({ createdBy: collections.createdBy }).from(collections).where(eq(collections.id, collectionId)).limit(1);
    if (!c) throw new NotFoundException({ code: "not_found", message: "Collection not found" });
    if (c.createdBy !== userId && role !== "owner" && role !== "admin") throw new ForbiddenException({ code: "forbidden", message: "Only the creator or an admin can change this collection" });
  }

  async updateCollection(orgId: string, userId: string, role: Role, collectionId: string, body: CollectionPatchBody): Promise<CollectionDto> {
    await withTenant(this.db, orgId, async (tx) => {
      await this.assertCanManage(tx, collectionId, userId, role);
      await tx
        .update(collections)
        .set({ ...(body.name !== undefined ? { name: body.name } : {}), ...(body.description !== undefined ? { description: body.description } : {}), updatedAt: new Date() })
        .where(eq(collections.id, collectionId));
    });
    return this.getCollection(orgId, collectionId);
  }

  async deleteCollection(orgId: string, userId: string, role: Role, collectionId: string): Promise<void> {
    await withTenant(this.db, orgId, async (tx) => {
      await this.assertCanManage(tx, collectionId, userId, role);
      await tx.delete(collectionItems).where(eq(collectionItems.collectionId, collectionId));
      await tx.delete(collections).where(eq(collections.id, collectionId));
    });
  }

  async listItems(orgId: string, collectionId: string, limit: number, cursor?: string) {
    const cur = decodeCursor<{ t: string; id: string }>(cursor);
    if (cursor && !cur) throw new BadRequestException({ code: "invalid_cursor", message: "Invalid cursor" });
    const rows = await withTenant(this.db, orgId, async (tx) => {
      const [c] = await tx.select({ id: collections.id }).from(collections).where(eq(collections.id, collectionId)).limit(1);
      if (!c) throw new NotFoundException({ code: "not_found", message: "Collection not found" });
      return tx
        .select({ id: collectionItems.id, created: sql<string>`${collectionItems.createdAt}::text`, asset: assets })
        .from(collectionItems)
        .innerJoin(assets, eq(assets.id, collectionItems.assetId))
        .where(and(eq(collectionItems.collectionId, collectionId), eq(assets.status, "published"), cur ? sql`(${collectionItems.createdAt}, ${collectionItems.id}) < (${cur.t}::timestamptz, ${cur.id}::uuid)` : undefined))
        .orderBy(desc(collectionItems.createdAt), desc(collectionItems.id))
        .limit(limit + 1);
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const hasMore = rows.length > limit;
    return { data: page.map((r) => assetDto(r.asset)), has_more: hasMore, next_cursor: hasMore && last ? encodeCursor({ t: last.created, id: last.id }) : null };
  }

  async addItem(orgId: string, userId: string, collectionId: string, assetId: string): Promise<void> {
    await withTenant(this.db, orgId, async (tx) => {
      const [c] = await tx.select({ id: collections.id }).from(collections).where(eq(collections.id, collectionId)).limit(1);
      if (!c) throw new NotFoundException({ code: "not_found", message: "Collection not found" });
      await this.assertPublished(tx, assetId);
      const [n] = await tx.select({ n: count() }).from(collectionItems).where(eq(collectionItems.collectionId, collectionId));
      if ((n?.n ?? 0) >= LIBRARY_LIMITS.itemsPerCollection) throw new ConflictException({ code: "limit_reached", message: "Collection is full" });
      try {
        await tx.insert(collectionItems).values({ organizationId: orgId, collectionId, assetId, addedBy: userId }).onConflictDoNothing();
      } catch (e) {
        if (!isUnique(e)) throw e;
      }
      await tx.update(collections).set({ updatedAt: new Date() }).where(eq(collections.id, collectionId));
    });
  }

  async removeItem(orgId: string, collectionId: string, assetId: string): Promise<void> {
    await withTenant(this.db, orgId, async (tx) => {
      const [c] = await tx.select({ id: collections.id }).from(collections).where(eq(collections.id, collectionId)).limit(1);
      if (!c) throw new NotFoundException({ code: "not_found", message: "Collection not found" });
      await tx.delete(collectionItems).where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.assetId, assetId)));
      await tx.update(collections).set({ updatedAt: new Date() }).where(eq(collections.id, collectionId));
    });
  }
}
