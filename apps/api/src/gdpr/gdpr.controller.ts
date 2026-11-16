import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { z } from "zod";
import { type AuthedRequest, SESSION_COOKIE, SessionGuard } from "../auth/auth.guard.js";
import { GdprService } from "./gdpr.service.js";

const eraseBody = z.object({ password: z.string().min(1).max(128), confirm: z.literal("ELIMINAR") });

@Controller("v1")
export class GdprController {
  constructor(private readonly gdpr: GdprService) {}

  /** Exportação dos dados do próprio utilizador (sessão; chaves de API não têm acesso). */
  @Get("me/export")
  @UseGuards(SessionGuard)
  @Header("Cache-Control", "private, no-store")
  async export(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Content-Disposition", 'attachment; filename="bigstock-os-meus-dados.json"');
    return this.gdpr.export(req.user.id, String(req.id));
  }

  @Post("me/erase")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async erase(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const r = eraseBody.safeParse(body);
    if (!r.success) throw new BadRequestException({ code: "validation_error", message: 'Send { password, confirm: "ELIMINAR" }' });
    const result = await this.gdpr.erase(req.user.id, r.data.password, String(req.id));
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { data: result, request_id: String(req.id) };
  }

  /** Job de retenção (Vercel Cron envia `Authorization: Bearer $CRON_SECRET`). */
  @Get("internal/retention")
  async retention(@Headers("authorization") auth: string | undefined) {
    const secret = process.env.CRON_SECRET;
    const given = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
      throw new UnauthorizedException({ code: "unauthorized", message: "Unauthorized" });
    }
    return { data: await this.gdpr.retention() };
  }
}
