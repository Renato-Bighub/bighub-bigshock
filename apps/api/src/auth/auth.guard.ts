import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service.js";

export const SESSION_COOKIE = "bs_session";

export function readSessionToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

export interface AuthedRequest extends Request {
  user: { id: string; email: string; displayName: string | null };
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = readSessionToken(req);
    const user = token ? await this.auth.authenticate(token) : null;
    if (!user) throw new UnauthorizedException({ code: "unauthenticated", message: "Authentication required" });
    req.user = user;
    return true;
  }
}
