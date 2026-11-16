import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AuthenticatedKey } from "../api-access/api-key.service.js";
import { API_KEY_ORG, API_KEY_SCOPE } from "../api-access/api-key.decorators.js";
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
  /** Presente quando o pedido veio por chave de API (autenticada pelo middleware). */
  apiKey?: AuthenticatedKey;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (req.apiKey) {
      // Negação por omissão: chaves só acedem a rotas explicitamente marcadas.
      const targets = [ctx.getHandler(), ctx.getClass()];
      const scope = this.reflector.getAllAndOverride<string | undefined>(API_KEY_SCOPE, targets);
      const orgRoute = this.reflector.getAllAndOverride<boolean | undefined>(API_KEY_ORG, targets);
      if (scope) {
        if (!(req.apiKey.scopes as string[]).includes(scope)) throw new ForbiddenException({ code: "insufficient_scope", message: `API key lacks scope ${scope}` });
      } else if (!orgRoute) {
        throw new ForbiddenException({ code: "api_key_not_allowed", message: "This endpoint is not available to API keys" });
      }
      req.user = { id: req.apiKey.actorUserId, email: `api-key:${req.apiKey.prefix}`, displayName: null };
      return true;
    }
    const token = readSessionToken(req);
    const user = token ? await this.auth.authenticate(token) : null;
    if (!user) throw new UnauthorizedException({ code: "unauthenticated", message: "Authentication required" });
    req.user = user;
    return true;
  }
}
