import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { z, type ZodType } from "zod";
import { aiJobBody, aiRequestBody } from "@bigstock/contracts";
import { SessionGuard } from "../auth/auth.guard.js";
import { OrgGuard, type OrgRequest, RequirePermission } from "../organizations/org.guard.js";
import { AiService, toJobDto } from "./ai.service.js";

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new BadRequestException({ code: "validation_error", message: r.error.issues[0]?.message ?? "Invalid input" });
  return r.data;
}
const listQuery = z.object({ cursor: z.string().max(500).optional(), limit: z.coerce.number().int().min(1).max(100).default(24) });

@Controller("v1/organizations/:orgId/ai")
@UseGuards(SessionGuard, OrgGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get("pricing")
  @RequirePermission("ai:read")
  pricing(@Req() req: OrgRequest) {
    return { data: this.ai.pricing(), request_id: String(req.id) };
  }

  @Post("estimate")
  @RequirePermission("ai:generate")
  async estimate(@Body() body: unknown, @Req() req: OrgRequest) {
    return { data: await this.ai.estimate(req.org.id, parse(aiRequestBody, body)), request_id: String(req.id) };
  }

  @Post("jobs")
  @RequirePermission("ai:generate")
  async create(@Body() body: unknown, @Headers("idempotency-key") key: string | undefined, @Req() req: OrgRequest, @Res({ passthrough: true }) res: Response) {
    if (!key || key.length < 8 || key.length > 128) {
      throw new BadRequestException({ code: "idempotency_key_required", message: "Idempotency-Key header (8-128 chars) is required" });
    }
    const { job, created } = await this.ai.create(req.org.id, req.user.id, parse(aiJobBody, body), key, String(req.id));
    res.status(created ? 202 : 200);
    return { data: job, request_id: String(req.id) };
  }

  @Get("jobs")
  @RequirePermission("ai:read")
  async list(@Query() query: Record<string, string>, @Req() req: OrgRequest) {
    const q = parse(listQuery, query);
    const r = await this.ai.list(req.org.id, q.limit, q.cursor);
    return { data: r.data, pagination: { next_cursor: r.next_cursor, has_more: r.has_more }, request_id: String(req.id) };
  }

  @Get("jobs/:jobId")
  @RequirePermission("ai:read")
  async get(@Param("jobId") jobId: string, @Req() req: OrgRequest) {
    return { data: toJobDto(await this.ai.get(req.org.id, parse(z.uuid(), jobId)), req.org.id), request_id: String(req.id) };
  }

  @Get("jobs/:jobId/output")
  @RequirePermission("ai:read")
  async output(@Param("jobId") jobId: string, @Query("download") download: string | undefined, @Req() req: OrgRequest, @Res() res: Response) {
    const { body, contentType } = await this.ai.output(req.org.id, parse(z.uuid(), jobId));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="bigstock-ia-${jobId.slice(0, 8)}.png"`);
    res.type(contentType).send(body);
  }
}
