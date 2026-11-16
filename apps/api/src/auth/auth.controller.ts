import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Response } from "express";
import type { ZodType } from "zod";
import { loginBody, registerBody, type MeResponse } from "@bigstock/contracts";
import { AuthService, SESSION_TTL_MS } from "./auth.service.js";
import { type AuthedRequest, readSessionToken, SessionGuard, SESSION_COOKIE } from "./auth.guard.js";
import type { Request } from "express";

function parse<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: "validation_error", message: r.error.issues[0]?.message ?? "Invalid body" });
  return r.data;
}

const setSession = (res: Response, token: string) =>
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });

@Controller("v1/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @UseGuards(ThrottlerGuard)
  async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { userId, token } = await this.auth.register(parse(registerBody, body), String(req.id));
    setSession(res, token);
    res.status(201);
    return { user_id: userId, request_id: String(req.id) };
  }

  @Post("login")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { userId, token } = await this.auth.login(parse(loginBody, body), String(req.id), req.ip ?? null);
    setSession(res, token);
    return { user_id: userId, request_id: String(req.id) };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readSessionToken(req);
    if (token) await this.auth.logout(token);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  @Get("me")
  @UseGuards(SessionGuard)
  async me(@Req() req: AuthedRequest): Promise<MeResponse> {
    const orgs = await this.auth.memberships(req.user.id);
    return {
      user: { id: req.user.id, email: req.user.email, display_name: req.user.displayName },
      organizations: orgs,
      request_id: String(req.id),
    };
  }
}
