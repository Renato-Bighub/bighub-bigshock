import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { z, type ZodType } from "zod";
import { licenseBody, licenseListQuery } from "@bigstock/contracts";
import { SessionGuard } from "../auth/auth.guard.js";
import { OrgGuard, type OrgRequest, RequirePermission } from "../organizations/org.guard.js";
import { LicensingService } from "./licensing.service.js";

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new BadRequestException({ code: "validation_error", message: r.error.issues[0]?.message ?? "Invalid input" });
  return r.data;
}

@Controller("v1")
export class LicensingController {
  constructor(private readonly licensing: LicensingService) {}

  @Get("license-terms/current")
  @UseGuards(SessionGuard)
  async terms(@Req() req: OrgRequest) {
    const t = await this.licensing.currentTerms();
    return { data: { version: t.version, title: t.title, summary: t.summary }, request_id: String(req.id) };
  }

  @Post("organizations/:orgId/licenses")
  @UseGuards(SessionGuard, OrgGuard)
  @RequirePermission("licenses:create")
  async license(
    @Body() body: unknown,
    @Headers("idempotency-key") idemKey: string | undefined,
    @Req() req: OrgRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Operação paga/concessiva: Idempotency-Key obrigatória (CLAUDE.md §5).
    if (!idemKey || idemKey.length < 8 || idemKey.length > 128) {
      throw new BadRequestException({ code: "idempotency_key_required", message: "Idempotency-Key header (8-128 chars) is required" });
    }
    const { assetId } = parse(licenseBody, body);
    const { grant, created } = await this.licensing.license(req.org.id, req.user.id, assetId, idemKey, String(req.id));
    res.status(created ? 201 : 200);
    return { data: { id: grant.id, asset_id: grant.assetId, created_at: grant.createdAt.toISOString() }, request_id: String(req.id) };
  }

  @Get("organizations/:orgId/licenses")
  @UseGuards(SessionGuard, OrgGuard)
  @RequirePermission("licenses:read")
  async list(@Query() query: Record<string, string>, @Req() req: OrgRequest) {
    const q = parse(licenseListQuery, query);
    const r = await this.licensing.list(req.org.id, q.limit, q.cursor);
    return { data: r.data, pagination: { next_cursor: r.next_cursor, has_more: r.has_more }, request_id: String(req.id) };
  }

  @Post("organizations/:orgId/licenses/:grantId/download")
  @HttpCode(200)
  @UseGuards(SessionGuard, OrgGuard)
  @RequirePermission("licenses:create")
  async download(@Param("grantId") grantId: string, @Req() req: OrgRequest) {
    const data = await this.licensing.issueDownload(req.org.id, req.user.id, parse(z.uuid(), grantId));
    return { data, request_id: String(req.id) };
  }

  /** URL assinado: a assinatura e a validade substituem a sessão (permite abrir diretamente no browser). */
  @Get("downloads/:token")
  async redeem(@Param("token") token: string, @Req() req: OrgRequest, @Res() res: Response) {
    const f = await this.licensing.redeem(token, String(req.id));
    res.setHeader("Content-Disposition", `attachment; filename="${f.filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.type(f.contentType).send(f.body);
  }
}
