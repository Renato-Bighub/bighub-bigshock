import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { z, type ZodType } from "zod";
import { assetListQuery, createAssetBody, rightsBody, type AssetListResponse } from "@bigstock/contracts";
import { SessionGuard } from "../auth/auth.guard.js";
import { CatalogService } from "./catalog.service.js";
import { PlatformGuard, type PlatformRequest } from "./platform.guard.js";

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new BadRequestException({ code: "validation_error", message: r.error.issues[0]?.message ?? "Invalid input" });
  return r.data;
}
const uuid = (v: string) => parse(z.uuid(), v);

@Controller("v1")
@UseGuards(SessionGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("categories")
  async categories(@Req() req: PlatformRequest) {
    return { data: await this.catalog.listCategories(), request_id: String(req.id) };
  }

  @Get("assets")
  async list(@Query() query: Record<string, string>, @Req() req: PlatformRequest): Promise<AssetListResponse> {
    const r = await this.catalog.search(parse(assetListQuery, query));
    return { data: r.data, pagination: { next_cursor: r.next_cursor, has_more: r.has_more }, request_id: String(req.id) };
  }

  @Get("assets/:id")
  async detail(@Param("id") id: string, @Req() req: PlatformRequest) {
    return { data: this.catalog.detail(await this.catalog.getPublished(uuid(id))), request_id: String(req.id) };
  }

  @Get("assets/:id/preview")
  @Header("Cache-Control", "private, max-age=3600")
  async preview(@Param("id") id: string, @Res() res: Response) {
    const { body, contentType } = await this.catalog.preview(uuid(id));
    res.type(contentType).send(body);
  }
}

@Controller("v1/admin/assets")
@UseGuards(SessionGuard, PlatformGuard)
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  async list(@Query("status") status: string | undefined, @Req() req: PlatformRequest) {
    return { data: await this.catalog.listAll(status), request_id: String(req.id) };
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: PlatformRequest) {
    return { data: await this.catalog.create(req.user.id, parse(createAssetBody, body), String(req.id)), request_id: String(req.id) };
  }

  @Put(":id/preview")
  @HttpCode(204)
  async preview(@Param("id") id: string, @Body() body: unknown, @Req() req: PlatformRequest) {
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException({ code: "invalid_image", message: "Send the image as the raw request body (image/jpeg, image/png or image/webp)" });
    }
    await this.catalog.setPreview(req.user.id, uuid(id), body, String(req.id));
  }

  @Put(":id/rights")
  @HttpCode(204)
  async rights(@Param("id") id: string, @Body() body: unknown, @Req() req: PlatformRequest) {
    await this.catalog.setRights({ id: req.user.id, platformRole: req.platformRole }, uuid(id), parse(rightsBody, body), String(req.id));
  }

  @Post(":id/publish")
  @HttpCode(204)
  async publish(@Param("id") id: string, @Req() req: PlatformRequest) {
    await this.catalog.publish(req.user.id, uuid(id), String(req.id));
  }

  @Post(":id/unpublish")
  @HttpCode(204)
  async unpublish(@Param("id") id: string, @Req() req: PlatformRequest) {
    await this.catalog.unpublish(req.user.id, uuid(id), String(req.id));
  }
}
