import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { z, type ZodType } from "zod";
import { collectionBody, collectionPatchBody, libraryListQuery } from "@bigstock/contracts";
import { SessionGuard } from "../auth/auth.guard.js";
import { OrgGuard, type OrgRequest, RequirePermission } from "../organizations/org.guard.js";
import { LibraryService } from "./library.service.js";

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new BadRequestException({ code: "validation_error", message: r.error.issues[0]?.message ?? "Invalid input" });
  return r.data;
}
const uuid = (v: string) => parse(z.uuid(), v);

/** Favoritos e coleções: só sessão web (sem @ApiKeyOrgRoute, as chaves de API não acedem). */
@Controller("v1/organizations/:orgId")
@UseGuards(SessionGuard, OrgGuard)
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get("favorites")
  @RequirePermission("library:read")
  async favorites(@Query() query: Record<string, string>, @Req() req: OrgRequest) {
    const q = parse(libraryListQuery, query);
    const r = await this.library.listFavorites(req.org.id, req.user.id, q.limit, q.cursor);
    return { data: r.data, pagination: { next_cursor: r.next_cursor, has_more: r.has_more }, request_id: String(req.id) };
  }

  @Get("favorites/ids")
  @RequirePermission("library:read")
  async favoriteIds(@Req() req: OrgRequest) {
    return { data: await this.library.favoriteIds(req.org.id, req.user.id), request_id: String(req.id) };
  }

  @Put("favorites/:assetId")
  @RequirePermission("library:write")
  async addFavorite(@Param("assetId") assetId: string, @Req() req: OrgRequest) {
    await this.library.addFavorite(req.org.id, req.user.id, uuid(assetId));
    return { data: { asset_id: assetId, favorited: true }, request_id: String(req.id) };
  }

  @Delete("favorites/:assetId")
  @HttpCode(204)
  @RequirePermission("library:write")
  async removeFavorite(@Param("assetId") assetId: string, @Req() req: OrgRequest) {
    await this.library.removeFavorite(req.org.id, req.user.id, uuid(assetId));
  }

  @Get("collections")
  @RequirePermission("library:read")
  async collections(@Req() req: OrgRequest) {
    return { data: await this.library.listCollections(req.org.id), request_id: String(req.id) };
  }

  @Post("collections")
  @RequirePermission("library:write")
  async createCollection(@Body() body: unknown, @Req() req: OrgRequest) {
    return { data: await this.library.createCollection(req.org.id, req.user.id, parse(collectionBody, body)), request_id: String(req.id) };
  }

  @Get("collections/:collectionId")
  @RequirePermission("library:read")
  async collection(@Param("collectionId") id: string, @Req() req: OrgRequest) {
    return { data: await this.library.getCollection(req.org.id, uuid(id)), request_id: String(req.id) };
  }

  @Patch("collections/:collectionId")
  @RequirePermission("library:write")
  async updateCollection(@Param("collectionId") id: string, @Body() body: unknown, @Req() req: OrgRequest) {
    return { data: await this.library.updateCollection(req.org.id, req.user.id, req.org.role, uuid(id), parse(collectionPatchBody, body)), request_id: String(req.id) };
  }

  @Delete("collections/:collectionId")
  @HttpCode(204)
  @RequirePermission("library:write")
  async deleteCollection(@Param("collectionId") id: string, @Req() req: OrgRequest) {
    await this.library.deleteCollection(req.org.id, req.user.id, req.org.role, uuid(id));
  }

  @Get("collections/:collectionId/items")
  @RequirePermission("library:read")
  async items(@Param("collectionId") id: string, @Query() query: Record<string, string>, @Req() req: OrgRequest) {
    const q = parse(libraryListQuery, query);
    const r = await this.library.listItems(req.org.id, uuid(id), q.limit, q.cursor);
    return { data: r.data, pagination: { next_cursor: r.next_cursor, has_more: r.has_more }, request_id: String(req.id) };
  }

  @Put("collections/:collectionId/items/:assetId")
  @RequirePermission("library:write")
  async addItem(@Param("collectionId") id: string, @Param("assetId") assetId: string, @Req() req: OrgRequest) {
    await this.library.addItem(req.org.id, req.user.id, uuid(id), uuid(assetId));
    return { data: { collection_id: id, asset_id: assetId, added: true }, request_id: String(req.id) };
  }

  @Delete("collections/:collectionId/items/:assetId")
  @HttpCode(204)
  @RequirePermission("library:write")
  async removeItem(@Param("collectionId") id: string, @Param("assetId") assetId: string, @Req() req: OrgRequest) {
    await this.library.removeItem(req.org.id, uuid(id), uuid(assetId));
  }
}
