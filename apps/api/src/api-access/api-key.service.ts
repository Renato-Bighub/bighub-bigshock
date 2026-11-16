import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  and,
  apiKeys,
  apiUsageMinutes,
  apiUsageMonthly,
  auditEvents,
  desc,
  eq,
  gte,
  sql,
  withApiKeyPrefix,
  withTenant,
  type Database,
} from "@bigstock/database";
import type { ApiScope, CreateApiKeyBody } from "@bigstock/contracts";
import { EntitlementsService } from "../billing/entitlements.service.js";
import { DB } from "../database.module.js";

const KEY_RE = /^bk_(live|test)_([a-f0-9]{8})_([A-Za-z0-9_-]{43})$/;
const CACHE_TTL_MS = 15_000;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export interface AuthenticatedKey {
  id: string;
  organizationId: string;
  prefix: string;
  scopes: ApiScope[];
  actorUserId: string;
  perMinute: number;
  monthly: number;
}

interface Cached {
  key: AuthenticatedKey;
  hash: string;
  expiresAt: Date | null;
  revoked: boolean;
  lastUsedAt: Date | null;
  at: number;
}

export interface RateInfo {
  limit: number;
  remaining: number;
  resetEpochSeconds: number;
}

/**
 * Chaves de API: criação, autenticação, limite de taxa e medição de uso.
 * O limite por minuto e a quota mensal usam contadores em PostgreSQL (atómicos), por isso valem
 * entre instâncias serverless sem Redis. A mesma lógica de negócio serve web e API (CLAUDE.md §1).
 */
@Injectable()
export class ApiKeyService {
  private readonly cache = new Map<string, Cached>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly entitlements: EntitlementsService,
  ) {}

  // ---- Gestão (sessão de utilizador) ----

  async create(orgId: string, actorId: string, body: CreateApiKeyBody, requestId: string) {
    const limits = await this.limitsFor(orgId);
    if (limits.perMinute <= 0) throw new ForbiddenException({ code: "api_access_not_in_plan", message: "Your plan does not include API access" });
    for (let attempt = 0; attempt < 3; attempt++) {
      const prefix = randomBytes(4).toString("hex");
      const secret = randomBytes(32).toString("base64url");
      const key = `bk_live_${prefix}_${secret}`;
      try {
        const [row] = await withTenant(this.db, orgId, async (tx) => {
          const rows = await tx
            .insert(apiKeys)
            .values({
              organizationId: orgId, name: body.name, keyPrefix: prefix, keyHash: sha256(secret), scopes: body.scopes, createdBy: actorId,
              expiresAt: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000) : null,
            })
            .returning();
          await tx.insert(auditEvents).values({ organizationId: orgId, actorUserId: actorId, action: "api_key.create", resourceType: "api_key", resourceId: rows[0]!.id, requestId, metadata: { name: body.name, scopes: body.scopes } });
          return rows;
        });
        // O segredo só é devolvido agora; depois nunca mais (CLAUDE.md §5).
        return { key, record: this.dto(row!) };
      } catch (e) {
        if ((e as { cause?: { code?: string } })?.cause?.code === "23505") continue; // colisão de prefixo
        throw e;
      }
    }
    throw new ConflictException({ code: "key_generation_failed", message: "Could not generate a unique key" });
  }

  private dto(r: typeof apiKeys.$inferSelect) {
    return {
      id: r.id, name: r.name, prefix: `bk_live_${r.keyPrefix}`, scopes: r.scopes,
      created_at: r.createdAt.toISOString(), last_used_at: r.lastUsedAt?.toISOString() ?? null,
      expires_at: r.expiresAt?.toISOString() ?? null, revoked_at: r.revokedAt?.toISOString() ?? null,
    };
  }

  list(orgId: string) {
    return withTenant(this.db, orgId, async (tx) => (await tx.select().from(apiKeys).where(eq(apiKeys.organizationId, orgId)).orderBy(desc(apiKeys.createdAt))).map((r) => this.dto(r)));
  }

  async revoke(orgId: string, actorId: string, keyId: string, requestId: string) {
    const prefix = await withTenant(this.db, orgId, async (tx) => {
      const rows = await tx
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, orgId)))
        .returning({ prefix: apiKeys.keyPrefix });
      if (rows.length === 0) throw new NotFoundException({ code: "not_found", message: "API key not found" });
      await tx.insert(auditEvents).values({ organizationId: orgId, actorUserId: actorId, action: "api_key.revoke", resourceType: "api_key", resourceId: keyId, requestId });
      return rows[0]!.prefix;
    });
    this.cache.delete(prefix);
  }

  // ---- Autenticação e medição (cada pedido com chave) ----

  private async limitsFor(orgId: string) {
    const ent = await withTenant(this.db, orgId, (tx) => this.entitlements.forOrganization(tx, orgId));
    return { perMinute: ent.apiRequestsPerMinute, monthly: ent.apiMonthlyRequests };
  }

  async authenticate(raw: string): Promise<AuthenticatedKey> {
    const m = KEY_RE.exec(raw);
    const invalid = () => new UnauthorizedException({ code: "invalid_api_key", message: "Invalid API key" });
    if (!m) throw invalid();
    const [, , prefix, secret] = m as unknown as [string, string, string, string];

    let c = this.cache.get(prefix);
    if (!c || Date.now() - c.at > CACHE_TTL_MS) {
      const row = await withApiKeyPrefix(this.db, prefix, async (tx) => (await tx.select().from(apiKeys).where(eq(apiKeys.keyPrefix, prefix)))[0]);
      if (!row) {
        this.cache.delete(prefix);
        throw invalid();
      }
      const limits = await this.limitsFor(row.organizationId);
      c = {
        key: { id: row.id, organizationId: row.organizationId, prefix, scopes: row.scopes as ApiScope[], actorUserId: row.createdBy, perMinute: limits.perMinute, monthly: limits.monthly },
        hash: row.keyHash, expiresAt: row.expiresAt, revoked: row.revokedAt !== null, lastUsedAt: row.lastUsedAt, at: Date.now(),
      };
      this.cache.set(prefix, c);
    }
    const a = Buffer.from(sha256(secret));
    const b = Buffer.from(c.hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw invalid();
    if (c.revoked || (c.expiresAt && c.expiresAt <= new Date())) throw new UnauthorizedException({ code: "api_key_revoked_or_expired", message: "API key is revoked or expired" });
    if (c.key.perMinute <= 0) throw new ForbiddenException({ code: "api_access_not_in_plan", message: "Your plan does not include API access" });
    return c.key;
  }

  /** Conta o pedido; lança 429 (por minuto) ou 402 (quota mensal). Pedidos recusados por taxa não consomem quota. */
  async meter(key: AuthenticatedKey, now = new Date()): Promise<RateInfo> {
    const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const reset = Math.floor(minute.getTime() / 1000) + 60;
    const touch = this.cache.get(key.prefix);
    const stale = touch && (!touch.lastUsedAt || now.getTime() - touch.lastUsedAt.getTime() > 60_000);

    const { perMin, perMonth } = await withTenant(this.db, key.organizationId, async (tx) => {
      const [m] = await tx
        .insert(apiUsageMinutes)
        .values({ organizationId: key.organizationId, keyId: key.id, minuteStart: minute, requests: 1 })
        .onConflictDoUpdate({ target: [apiUsageMinutes.keyId, apiUsageMinutes.minuteStart], set: { requests: sql`${apiUsageMinutes.requests} + 1` } })
        .returning({ n: apiUsageMinutes.requests });
      const perMin = m?.n ?? 1;
      if (perMin > key.perMinute) return { perMin, perMonth: 0 };
      const [mo] = await tx
        .insert(apiUsageMonthly)
        .values({ organizationId: key.organizationId, month, requests: 1 })
        .onConflictDoUpdate({ target: [apiUsageMonthly.organizationId, apiUsageMonthly.month], set: { requests: sql`${apiUsageMonthly.requests} + 1` } })
        .returning({ n: apiUsageMonthly.requests });
      if (stale) {
        await tx.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, key.id));
        if (touch) touch.lastUsedAt = now;
      }
      return { perMin, perMonth: mo?.n ?? 1 };
    });

    if (perMin > key.perMinute) {
      throw new HttpException({ code: "rate_limited", message: `Rate limit of ${key.perMinute} requests per minute exceeded`, retryAfter: Math.max(1, reset - Math.floor(now.getTime() / 1000)) }, 429);
    }
    if (perMonth > key.monthly) {
      throw new HttpException({ code: "api_quota_exceeded", message: `Monthly quota of ${key.monthly} requests exceeded` }, 402);
    }
    return { limit: key.perMinute, remaining: Math.max(0, key.perMinute - perMin), resetEpochSeconds: reset };
  }

  async usage(orgId: string, now = new Date()) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const since = new Date(now.getTime() - 60 * 60_000);
    const limits = await this.limitsFor(orgId);
    return withTenant(this.db, orgId, async (tx) => {
      const [mo] = await tx.select().from(apiUsageMonthly).where(and(eq(apiUsageMonthly.organizationId, orgId), eq(apiUsageMonthly.month, month)));
      const last = await tx
        .select({ n: sql<number>`coalesce(sum(${apiUsageMinutes.requests}), 0)::int` })
        .from(apiUsageMinutes)
        .where(and(eq(apiUsageMinutes.organizationId, orgId), gte(apiUsageMinutes.minuteStart, since)));
      return {
        limits: { requests_per_minute: limits.perMinute, requests_per_month: limits.monthly },
        month: { start: month.toISOString(), requests: mo?.requests ?? 0 },
        last_hour_requests: last[0]?.n ?? 0,
      };
    });
  }
}
