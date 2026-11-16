import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { eq, users, type Database } from "@bigstock/database";
import { Inject } from "@nestjs/common";
import { DB } from "../database.module.js";
import type { AuthedRequest } from "../auth/auth.guard.js";

export interface PlatformRequest extends AuthedRequest {
  platformRole: "editor" | "admin";
}

/** Acesso à área editorial: apenas utilizadores com papel de plataforma (editor/admin). Usar após SessionGuard. */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Database) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<PlatformRequest>();
    const [u] = await this.db.select({ role: users.platformRole }).from(users).where(eq(users.id, req.user.id));
    if (!u?.role) throw new ForbiddenException({ code: "forbidden", message: "Platform role required" });
    req.platformRole = u.role;
    return true;
  }
}
