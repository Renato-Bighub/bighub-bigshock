import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  and,
  aiJobs,
  apiKeys,
  assets,
  auditEvents,
  downloadEvents,
  eq,
  invitations,
  isNull,
  licenseGrants,
  collections,
  collectionItems,
  favorites,
  organizationMembers,
  organizations,
  sessions,
  sql,
  subscriptions,
  users,
  withTenant,
  type Database,
} from "@bigstock/database";
import { AuthService } from "../auth/auth.service.js";
import { verifyPassword } from "../auth/password.js";
import { BILLING_PROVIDER, type BillingProvider } from "../billing/provider.js";
import { StorageService } from "../catalog/storage.service.js";
import { DB } from "../database.module.js";

const ERASED_PROMPT = "[removido a pedido do titular]";

/**
 * Direitos do titular (RGPD arts. 15, 17 e 20): exportação e eliminação.
 * Registos financeiros e de auditoria são append-only e retidos por obrigação legal; ficam
 * pseudonimizados (a referência ao utilizador passa a apontar para uma conta anonimizada).
 */
@Injectable()
export class GdprService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    private readonly auth: AuthService,
    private readonly storage: StorageService,
  ) {}

  /** Cópia estruturada e legível por máquina dos dados do utilizador (art. 15 e 20). Sem segredos nem dados de terceiros. */
  async export(userId: string, requestId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    const memberships = await this.auth.memberships(userId);
    const userSessions = await this.db
      .select({ createdAt: sessions.createdAt, expiresAt: sessions.expiresAt, revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.userId, userId));

    const perOrg = [];
    for (const m of memberships) {
      const data = await withTenant(this.db, m.id, async (tx) => ({
        api_keys_created: (await tx.select({ name: apiKeys.name, prefix: apiKeys.keyPrefix, scopes: apiKeys.scopes, created_at: apiKeys.createdAt, revoked_at: apiKeys.revokedAt }).from(apiKeys).where(eq(apiKeys.createdBy, userId))),
        // E-mails dos convidados são dados de terceiros: exportamos só papel e datas.
        invitations_sent: await tx.select({ role: invitations.role, created_at: invitations.createdAt, accepted_at: invitations.acceptedAt, revoked_at: invitations.revokedAt }).from(invitations).where(eq(invitations.invitedBy, userId)),
        licenses: await tx
          .select({ asset_title: assets.title, license_type: licenseGrants.licenseType, created_at: licenseGrants.createdAt })
          .from(licenseGrants)
          .innerJoin(assets, eq(assets.id, licenseGrants.assetId))
          .where(eq(licenseGrants.userId, userId)),
        favorites: await tx.select({ asset_title: assets.title, created_at: favorites.createdAt }).from(favorites).innerJoin(assets, eq(assets.id, favorites.assetId)).where(eq(favorites.userId, userId)),
        collections_created: await tx.select({ name: collections.name, description: collections.description, created_at: collections.createdAt }).from(collections).where(eq(collections.createdBy, userId)),
        downloads: await tx.select({ created_at: downloadEvents.createdAt }).from(downloadEvents).where(eq(downloadEvents.userId, userId)),
        ai_jobs: await tx.select({ kind: aiJobs.kind, prompt: aiJobs.prompt, size: aiJobs.size, quality: aiJobs.quality, status: aiJobs.status, cost_credits: aiJobs.costCredits, provider: aiJobs.provider, model: aiJobs.model, created_at: aiJobs.createdAt }).from(aiJobs).where(eq(aiJobs.userId, userId)),
        audit_events: await tx.select({ action: auditEvents.action, resource_type: auditEvents.resourceType, created_at: auditEvents.createdAt }).from(auditEvents).where(eq(auditEvents.actorUserId, userId)),
      }));
      perOrg.push({ organization: { id: m.id, name: m.name, role: m.role }, ...data });
    }
    await this.db.insert(auditEvents).values({ actorUserId: userId, action: "gdpr.export", resourceType: "user", resourceId: userId, requestId });
    return {
      generated_at: new Date().toISOString(),
      format_version: 1,
      subject: user ? { id: user.id, email: user.email, display_name: user.displayName, created_at: user.createdAt, email_verified_at: user.emailVerifiedAt } : null,
      sessions: userSessions,
      organizations: perOrg,
      notes: [
        "Os registos financeiros e de auditoria da sua organização são retidos por obrigação legal e não fazem parte desta exportação, exceto as suas próprias ações.",
        "Não incluímos segredos (senha, tokens) nem dados pessoais de terceiros.",
      ],
    };
  }

  /** Eliminação/anonimização (art. 17). Encerra organizações onde o utilizador é o único membro. */
  async erase(userId: string, password: string, requestId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user || user.deletedAt || !(await verifyPassword(user.passwordHash, password))) {
      throw new UnauthorizedException({ code: "invalid_credentials", message: "Invalid password" });
    }
    const memberships = await this.auth.memberships(userId);

    const toClose: { id: string; stripeSubscriptionId: string | null }[] = [];
    const toLeave: string[] = [];
    const blockers: string[] = [];
    for (const m of memberships) {
      const others = await withTenant(this.db, m.id, async (tx) => (await tx.select().from(organizationMembers).where(eq(organizationMembers.organizationId, m.id))).filter((x) => x.userId !== userId));
      if (others.length === 0) {
        const sub = await withTenant(this.db, m.id, async (tx) => (await tx.select().from(subscriptions).where(eq(subscriptions.organizationId, m.id)))[0]);
        toClose.push({ id: m.id, stripeSubscriptionId: sub && (sub.status === "active" || sub.status === "past_due") ? sub.stripeSubscriptionId : null });
      } else if (m.role === "owner" && !others.some((o) => o.role === "owner")) {
        blockers.push(m.name);
      } else {
        toLeave.push(m.id);
      }
    }
    if (blockers.length > 0) {
      throw new ConflictException({ code: "sole_owner", message: `Transfer ownership before deleting your account (organizations: ${blockers.join(", ")})` });
    }

    // Chamadas externas primeiro: se falharem, nada é alterado.
    for (const org of toClose) {
      if (org.stripeSubscriptionId) await this.provider.cancelSubscription(org.stripeSubscriptionId);
    }

    const outputKeys: string[] = [];
    for (const org of toClose) {
      await withTenant(this.db, org.id, async (tx) => {
        const jobs = await tx.select({ key: aiJobs.outputKey }).from(aiJobs).where(eq(aiJobs.organizationId, org.id));
        for (const j of jobs) if (j.key) outputKeys.push(j.key);
        await tx.update(aiJobs).set({ prompt: ERASED_PROMPT, outputKey: null }).where(eq(aiJobs.organizationId, org.id));
        await tx.delete(favorites).where(eq(favorites.organizationId, org.id));
        await tx.delete(collectionItems).where(eq(collectionItems.organizationId, org.id));
        await tx.delete(collections).where(eq(collections.organizationId, org.id));
        await tx.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.organizationId, org.id), isNull(apiKeys.revokedAt)));
        await tx.update(invitations).set({ revokedAt: new Date() }).where(and(eq(invitations.organizationId, org.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
        await tx.update(subscriptions).set({ status: "cancelled", cancelAtPeriodEnd: false, pendingPlanCode: null, updatedAt: new Date() }).where(eq(subscriptions.organizationId, org.id));
        await tx.delete(organizationMembers).where(eq(organizationMembers.organizationId, org.id));
        await tx.update(organizations).set({ name: "Organização encerrada", vatId: null, closedAt: new Date() }).where(eq(organizations.id, org.id));
        await tx.insert(auditEvents).values({ organizationId: org.id, actorUserId: userId, action: "org.closed", resourceType: "organization", resourceId: org.id, requestId, metadata: { reason: "gdpr_erasure" } });
      });
    }
    for (const orgId of toLeave) {
      await withTenant(this.db, orgId, async (tx) => {
        await tx.delete(favorites).where(and(eq(favorites.organizationId, orgId), eq(favorites.userId, userId)));
        await tx.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.organizationId, orgId), eq(apiKeys.createdBy, userId), isNull(apiKeys.revokedAt)));
        await tx.update(invitations).set({ revokedAt: new Date() }).where(and(eq(invitations.organizationId, orgId), eq(invitations.invitedBy, userId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
        await tx.delete(organizationMembers).where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)));
        await tx.insert(auditEvents).values({ organizationId: orgId, actorUserId: userId, action: "member.left", resourceType: "user", resourceId: userId, requestId, metadata: { reason: "gdpr_erasure" } });
      });
    }

    await this.db
      .update(users)
      .set({ email: `deleted-${userId}@anonymized.invalid`, displayName: null, passwordHash: null, emailVerifiedAt: null, platformRole: null, deletedAt: new Date() })
      .where(eq(users.id, userId));
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    await this.db.insert(auditEvents).values({ actorUserId: userId, action: "gdpr.erase", resourceType: "user", resourceId: userId, requestId, metadata: { closed_organizations: toClose.length } });

    // Apaga ficheiros gerados (melhor esforço: o registo já não os referencia).
    for (const key of outputKeys) await this.storage.delete(key).catch(() => undefined);
    return { closed_organizations: toClose.length, left_organizations: toLeave.length };
  }

  /** Limitação da conservação: apaga dados operacionais antigos. Chamado pelo cron da Vercel. */
  async retention() {
    const r = await this.db.execute(sql`
      WITH s AS (DELETE FROM sessions WHERE coalesce(revoked_at, expires_at) < now() - interval '30 days' RETURNING 1),
           a AS (DELETE FROM auth_attempts WHERE created_at < now() - interval '30 days' RETURNING 1),
           u AS (DELETE FROM api_usage_minutes WHERE minute_start < now() - interval '90 days' RETURNING 1)
      SELECT (SELECT count(*) FROM s)::int AS sessions, (SELECT count(*) FROM a)::int AS auth_attempts, (SELECT count(*) FROM u)::int AS api_usage_minutes`);
    return r.rows[0] as { sessions: number; auth_attempts: number; api_usage_minutes: number };
  }

}
