import { BadRequestException, HttpException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { and, auditEvents, desc, emailTokens, eq, gt, isNull, sessions, sql, users, type Database } from "@bigstock/database";
import { DB } from "../database.module.js";
import { EmailService } from "../mail/email.service.js";
import { hashPassword, verifyPassword } from "./password.js";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 3600_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_RESETS_PER_HOUR = 5;

type Kind = "verify_email" | "password_reset";

/** Verificação de e-mail e senhas (recuperação e alteração). Tokens de uso único; só o hash é guardado. */
@Injectable()
export class AccountService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly email: EmailService,
  ) {}

  /** Cria um token novo e invalida os anteriores do mesmo tipo (só o último link funciona). */
  private async issue(userId: string, kind: Kind, ttlMs: number): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.db.update(emailTokens).set({ usedAt: new Date() }).where(and(eq(emailTokens.userId, userId), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt)));
    await this.db.insert(emailTokens).values({ userId, kind, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
    return token;
  }

  private async lastIssued(userId: string, kind: Kind) {
    const [r] = await this.db.select({ at: emailTokens.createdAt }).from(emailTokens).where(and(eq(emailTokens.userId, userId), eq(emailTokens.kind, kind))).orderBy(desc(emailTokens.createdAt)).limit(1);
    return r?.at ?? null;
  }

  private async consume(token: string, kind: Kind) {
    const [row] = await this.db
      .update(emailTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(emailTokens.tokenHash, sha256(token)), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date())))
      .returning({ userId: emailTokens.userId });
    if (!row) throw new BadRequestException({ code: "invalid_token", message: "This link is invalid, expired or already used" });
    return row.userId;
  }

  /** Envio do e-mail de verificação (registo e reenvio). `force` ignora o intervalo mínimo (registo). */
  async sendVerification(userId: string, force = false): Promise<void> {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u || u.deletedAt || u.emailVerifiedAt) return;
    if (!force) {
      const last = await this.lastIssued(userId, "verify_email");
      if (last && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) {
        throw new HttpException({ code: "too_soon", message: "Wait a minute before requesting another e-mail", retryAfter: 60 }, 429);
      }
    }
    const token = await this.issue(userId, "verify_email", VERIFY_TTL_MS);
    await this.email.sendVerification(u.email, u.displayName, token);
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.consume(token, "verify_email");
    await this.db.update(users).set({ emailVerifiedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.deletedAt)));
  }

  /** Resposta idêntica exista ou não a conta (sem enumeração). Limites por conta: 1/min e 5/hora. */
  async forgotPassword(emailAddr: string): Promise<void> {
    const [u] = await this.db.select().from(users).where(eq(users.email, emailAddr));
    if (!u || u.deletedAt) return;
    const last = await this.lastIssued(u.id, "password_reset");
    if (last && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) return;
    const [{ n } = { n: 0 }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(emailTokens)
      .where(and(eq(emailTokens.userId, u.id), eq(emailTokens.kind, "password_reset"), gt(emailTokens.createdAt, new Date(Date.now() - 3600_000))));
    if (n >= MAX_RESETS_PER_HOUR) return;
    const token = await this.issue(u.id, "password_reset", RESET_TTL_MS);
    await this.email.sendPasswordReset(u.email, u.displayName, token);
  }

  async resetPassword(token: string, newPassword: string, requestId: string): Promise<void> {
    const userId = await this.consume(token, "password_reset");
    const hash = await hashPassword(newPassword);
    // Receber o link prova a posse do e-mail; todas as sessões terminam.
    const [u] = await this.db
      .update(users)
      .set({ passwordHash: hash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning();
    if (!u) throw new BadRequestException({ code: "invalid_token", message: "This link is invalid, expired or already used" });
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    await this.db.insert(auditEvents).values({ actorUserId: userId, action: "auth.password_reset", resourceType: "user", resourceId: userId, requestId });
    await this.email.sendPasswordChanged(u.email, u.displayName);
  }

  /** Alteração com a senha atual. Termina as outras sessões e mantém a atual. */
  async changePassword(userId: string, currentSessionTokenHash: string | null, current: string, next: string, requestId: string): Promise<void> {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u || !(await verifyPassword(u.passwordHash, current))) {
      throw new UnauthorizedException({ code: "invalid_credentials", message: "Current password is incorrect" });
    }
    await this.db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), currentSessionTokenHash ? sql`${sessions.tokenHash} <> ${currentSessionTokenHash}` : undefined));
    await this.db.insert(auditEvents).values({ actorUserId: userId, action: "auth.password_changed", resourceType: "user", resourceId: userId, requestId });
    await this.email.sendPasswordChanged(u.email, u.displayName);
  }
}
