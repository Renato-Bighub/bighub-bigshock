import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z, type ZodType } from "zod";
import { acceptInviteBody, changeRoleBody, inviteBody } from "@bigstock/contracts";
import { ApiKeyOrgRoute } from "../api-access/api-key.decorators.js";
import { type AuthedRequest, SessionGuard } from "../auth/auth.guard.js";
import { OrgGuard, type OrgRequest, RequirePermission } from "./org.guard.js";
import { OrganizationsService } from "./organizations.service.js";

function parse<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: "validation_error", message: r.error.issues[0]?.message ?? "Invalid body" });
  return r.data;
}
const uuidParam = (v: string) => parse(z.uuid(), v);

@Controller("v1")
@UseGuards(SessionGuard)
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get("organizations/:orgId/members")
  @UseGuards(OrgGuard)
  @RequirePermission("members:read")
  async members(@Req() req: OrgRequest) {
    return { data: await this.orgs.listMembers(req.org.id), request_id: String(req.id) };
  }

  @Get("organizations/:orgId/credits")
  @ApiKeyOrgRoute()
  @UseGuards(OrgGuard)
  @RequirePermission("credits:read")
  async credits(@Req() req: OrgRequest) {
    return { data: { available: await this.orgs.creditBalance(req.org.id) }, request_id: String(req.id) };
  }

  @Post("organizations/:orgId/invitations")
  @UseGuards(OrgGuard)
  @RequirePermission("members:invite")
  async invite(@Body() body: unknown, @Req() req: OrgRequest) {
    const data = await this.orgs.invite(req.org.id, { id: req.user.id, role: req.org.role }, parse(inviteBody, body), String(req.id));
    return { data, request_id: String(req.id) };
  }

  @Get("organizations/:orgId/invitations")
  @UseGuards(OrgGuard)
  @RequirePermission("members:invite")
  async invitations(@Req() req: OrgRequest) {
    return { data: await this.orgs.listInvitations(req.org.id), request_id: String(req.id) };
  }

  @Delete("organizations/:orgId/invitations/:invitationId")
  @HttpCode(204)
  @UseGuards(OrgGuard)
  @RequirePermission("members:invite")
  async revoke(@Param("invitationId") invitationId: string, @Req() req: OrgRequest) {
    await this.orgs.revokeInvitation(req.org.id, { id: req.user.id, role: req.org.role }, uuidParam(invitationId), String(req.id));
  }

  @Patch("organizations/:orgId/members/:userId")
  @UseGuards(OrgGuard)
  @RequirePermission("members:change_role")
  async changeRole(@Param("userId") userId: string, @Body() body: unknown, @Req() req: OrgRequest) {
    await this.orgs.changeRole(req.org.id, { id: req.user.id, role: req.org.role }, uuidParam(userId), parse(changeRoleBody, body).role, String(req.id));
    return { request_id: String(req.id) };
  }

  @Delete("organizations/:orgId/members/:userId")
  @HttpCode(204)
  @UseGuards(OrgGuard)
  @RequirePermission("members:remove")
  async remove(@Param("userId") userId: string, @Req() req: OrgRequest) {
    await this.orgs.removeMember(req.org.id, { id: req.user.id, role: req.org.role }, uuidParam(userId), String(req.id));
  }

  @Post("invitations/accept")
  @HttpCode(200)
  async accept(@Body() body: unknown, @Req() req: Request & AuthedRequest) {
    const data = await this.orgs.acceptInvitation(req.user, parse(acceptInviteBody, body).token, String(req.id));
    return { data, request_id: String(req.id) };
  }
}
