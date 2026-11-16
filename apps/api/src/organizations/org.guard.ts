import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { can, scopeForPermission, type Permission, type Role } from "@bigstock/contracts";
import { z } from "zod";
import type { AuthedRequest } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";

const PERMISSION_KEY = "required_permission";
export const RequirePermission = (p: Permission) => SetMetadata(PERMISSION_KEY, p);

export interface OrgRequest extends AuthedRequest {
  org: { id: string; role: Role };
}

/** Resolve a pertença do utilizador à organização do URL e aplica a permissão exigida. Usar após SessionGuard. */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<OrgRequest>();
    const orgId = z.uuid().safeParse(req.params?.orgId);
    // 404 (não 403) para não revelar a existência de organizações alheias.
    if (!orgId.success) throw new NotFoundException({ code: "not_found", message: "Organization not found" });
    const required = this.reflector.get<Permission | undefined>(PERMISSION_KEY, ctx.getHandler());
    if (req.apiKey) {
      // Uma chave só atua na sua própria organização e só dentro dos seus escopos.
      if (req.apiKey.organizationId !== orgId.data) throw new NotFoundException({ code: "not_found", message: "Organization not found" });
      const scope = required ? scopeForPermission(required) : undefined;
      if (!scope) throw new ForbiddenException({ code: "api_key_not_allowed", message: "This endpoint is not available to API keys" });
      if (!(req.apiKey.scopes as string[]).includes(scope)) throw new ForbiddenException({ code: "insufficient_scope", message: `API key lacks scope ${scope}` });
      req.org = { id: orgId.data, role: "member" };
      return true;
    }
    const membership = (await this.auth.memberships(req.user.id)).find((m) => m.id === orgId.data);
    if (!membership) throw new NotFoundException({ code: "not_found", message: "Organization not found" });
    if (required && !can(membership.role, required)) {
      throw new ForbiddenException({ code: "forbidden", message: `Missing permission: ${required}` });
    }
    req.org = { id: membership.id, role: membership.role };
    return true;
  }
}
