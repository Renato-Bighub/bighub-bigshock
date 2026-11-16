import { ConflictException, HttpException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  and,
  auditEvents,
  authAttempts,
  count,
  eq,
  gt,
  isNull,
  organizationMembers,
  organizations,
  sessions,
  users,
  withTenant,
  withUser,
  type Database,
} from "@bigstock/database";
import type { LoginBody, RegisterBody } from "@bigstock/contracts";
import { DB } from "../database.module.js";
import { AccountService } from "./account.service.js";
import { hashPassword, verifyPassword } from "./password.js";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Falhas por e-mail/IP na janela antes de travar. Valores generosos para o IP (NAT, proxies). */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_EMAIL = 10;
const MAX_FAILS_PER_IP = 50;

const isUniqueViolation = (e: unknown) =>
  (e as { cause?: { code?: string }; code?: string })?.cause?.code === "23505" ||
  (e as { code?: string })?.code === "23505";

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly account: AccountService,
  ) {}

  async register(body: RegisterBody, requestId: string) {
    const passwordHash = await hashPassword(body.password);
    let userId: string;
    try {
      const [u] = await this.db
        .insert(users)
        .values({ email: body.email, displayName: body.displayName ?? null, passwordHash })
        .returning({ id: users.id });
      userId = u!.id;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException({ code: "email_taken", message: "Email already registered" });
      throw e;
    }
    const orgId = randomUUID();
    await withTenant(this.db, orgId, async (tx) => {
      await tx.insert(organizations).values({ id: orgId, name: body.organizationName });
      await tx.insert(organizationMembers).values({ organizationId: orgId, userId, role: "owner" });
      await tx.insert(auditEvents).values({
        organizationId: orgId,
        actorUserId: userId,
        action: "auth.register",
        requestId,
      });
    });
    // Verificação de e-mail: melhor esforço (não falha o registo se o envio falhar).
    await this.account.sendVerification(userId, true).catch(() => undefined);
    return { userId, token: await this.createSession(userId) };
  }

  /** Trava força bruta (por e-mail e por IP) com contadores em BD: vale entre instâncias serverless. */
  private async assertNotLocked(emailHash: string, ip: string | null) {
    const since = new Date(Date.now() - ATTEMPT_WINDOW_MS);
    const [byEmail] = await this.db.select({ n: count() }).from(authAttempts).where(and(eq(authAttempts.emailHash, emailHash), eq(authAttempts.success, false), gt(authAttempts.createdAt, since)));
    const [byIp] = ip
      ? await this.db.select({ n: count() }).from(authAttempts).where(and(eq(authAttempts.ip, ip), eq(authAttempts.success, false), gt(authAttempts.createdAt, since)))
      : [{ n: 0 }];
    if ((byEmail?.n ?? 0) >= MAX_FAILS_PER_EMAIL || (byIp?.n ?? 0) >= MAX_FAILS_PER_IP) {
      throw new HttpException({ code: "too_many_attempts", message: "Too many failed sign-in attempts. Try again later.", retryAfter: ATTEMPT_WINDOW_MS / 1000 }, 429);
    }
  }

  async login(body: LoginBody, requestId: string, ip: string | null = null) {
    const emailHash = sha256(body.email);
    await this.assertNotLocked(emailHash, ip);
    const [user] = await this.db.select().from(users).where(eq(users.email, body.email));
    const ok = await verifyPassword(user?.passwordHash ?? null, body.password);
    await this.db.insert(authAttempts).values({ emailHash, ip, success: Boolean(user && ok) });
    if (!user || !ok) throw new UnauthorizedException({ code: "invalid_credentials", message: "Invalid email or password" });
    const memberships = await this.memberships(user.id);
    const first = memberships[0];
    if (first) {
      await withTenant(this.db, first.id, (tx) =>
        tx.insert(auditEvents).values({ organizationId: first.id, actorUserId: user.id, action: "auth.login", requestId }),
      );
    }
    return { userId: user.id, token: await this.createSession(user.id) };
  }

  private async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.db.insert(sessions).values({
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    return token;
  }

  async authenticate(token: string) {
    const [row] = await this.db
      .select({ id: users.id, email: users.email, displayName: users.displayName, emailVerifiedAt: users.emailVerifiedAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
    return row ?? null;
  }

  async logout(token: string) {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)));
  }

  memberships(userId: string) {
    return withUser(this.db, userId, (tx) =>
      tx
        .select({ id: organizations.id, name: organizations.name, role: organizationMembers.role })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
        .where(eq(organizationMembers.userId, userId)),
    );
  }
}
