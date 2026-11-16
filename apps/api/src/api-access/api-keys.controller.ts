import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { z, type ZodType } from "zod";
import { createApiKeyBody } from "@bigstock/contracts";
import { SessionGuard } from "../auth/auth.guard.js";
import { OrgGuard, type OrgRequest, RequirePermission } from "../organizations/org.guard.js";
import { ApiKeyOrgRoute } from "./api-key.decorators.js";
import { ApiKeyService } from "./api-key.service.js";

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new BadRequestException({ code: "validation_error", message: r.error.issues[0]?.message ?? "Invalid input" });
  return r.data;
}

/** Gestão de chaves: só por sessão de utilizador (chaves nunca criam nem revogam chaves). */
@Controller("v1/organizations/:orgId")
@UseGuards(SessionGuard, OrgGuard)
export class ApiKeysController {
  constructor(private readonly keys: ApiKeyService) {}

  @Post("api-keys")
  @RequirePermission("api_keys:manage")
  async create(@Body() body: unknown, @Req() req: OrgRequest) {
    const r = await this.keys.create(req.org.id, req.user.id, parse(createApiKeyBody, body), String(req.id));
    return { data: { ...r.record, key: r.key }, request_id: String(req.id) };
  }

  @Get("api-keys")
  @RequirePermission("api_keys:manage")
  async list(@Req() req: OrgRequest) {
    return { data: await this.keys.list(req.org.id), request_id: String(req.id) };
  }

  @Delete("api-keys/:keyId")
  @HttpCode(204)
  @RequirePermission("api_keys:manage")
  async revoke(@Param("keyId") keyId: string, @Req() req: OrgRequest) {
    await this.keys.revoke(req.org.id, req.user.id, parse(z.uuid(), keyId), String(req.id));
  }

  @Get("usage")
  @ApiKeyOrgRoute()
  @RequirePermission("usage:read")
  async usage(@Req() req: OrgRequest) {
    return { data: await this.keys.usage(req.org.id), request_id: String(req.id) };
  }
}
