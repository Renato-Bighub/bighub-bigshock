import { BadRequestException, Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { createHash } from "node:crypto";
import type { Request } from "express";
import type { ZodType } from "zod";
import { changePasswordBody, forgotPasswordBody, resetPasswordBody, verifyEmailBody } from "@bigstock/contracts";
import { AccountService } from "./account.service.js";
import { type AuthedRequest, readSessionToken, SessionGuard } from "./auth.guard.js";

function parse<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: "validation_error", message: r.error.issues[0]?.message ?? "Invalid body" });
  return r.data;
}

@Controller("v1/auth")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Post("verify-email/send")
  @HttpCode(202)
  @UseGuards(SessionGuard)
  async resend(@Req() req: AuthedRequest) {
    await this.account.sendVerification(req.user.id);
    return { request_id: String(req.id) };
  }

  @Post("verify-email")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async verify(@Body() body: unknown, @Req() req: Request) {
    await this.account.verifyEmail(parse(verifyEmailBody, body).token);
    return { verified: true, request_id: String(req.id) };
  }

  /** Responde sempre 202, exista ou não a conta. */
  @Post("forgot-password")
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  async forgot(@Body() body: unknown, @Req() req: Request) {
    await this.account.forgotPassword(parse(forgotPasswordBody, body).email);
    return { request_id: String(req.id) };
  }

  @Post("reset-password")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async reset(@Body() body: unknown, @Req() req: Request) {
    const b = parse(resetPasswordBody, body);
    await this.account.resetPassword(b.token, b.password, String(req.id));
    return { reset: true, request_id: String(req.id) };
  }

  @Post("change-password")
  @HttpCode(200)
  @UseGuards(SessionGuard, ThrottlerGuard)
  async change(@Body() body: unknown, @Req() req: AuthedRequest) {
    const b = parse(changePasswordBody, body);
    const token = readSessionToken(req);
    await this.account.changePassword(req.user.id, token ? createHash("sha256").update(token).digest("hex") : null, b.currentPassword, b.newPassword, String(req.id));
    return { changed: true, request_id: String(req.id) };
  }
}
