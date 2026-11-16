import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  and,
  billingAccounts,
  creditPacks,
  desc,
  eq,
  invoices,
  organizations,
  plans,
  subscriptions,
  withTenant,
  type Database,
} from "@bigstock/database";
import { DB } from "../database.module.js";
import { CreditsService } from "./credits.service.js";
import { EntitlementsService } from "./entitlements.service.js";
import { BILLING_PROVIDER, type BillingProvider } from "./provider.js";

const webUrl = () => (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/$/, "");

@Injectable()
export class BillingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    private readonly credits: CreditsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async catalog() {
    const [p, packs] = await Promise.all([
      this.db.select().from(plans).orderBy(plans.sortOrder),
      this.db.select().from(creditPacks).orderBy(creditPacks.credits),
    ]);
    return {
      plans: p.map((x) => ({
        code: x.code, name: x.name, monthly_price_cents: x.monthlyPriceCents, annual_price_cents: x.annualPriceCents,
        included_credits: x.includedCredits, download_quota: x.downloadQuota,
      })),
      credit_packs: packs.map((x) => ({ code: x.code, name: x.name, credits: x.credits, price_cents: x.priceCents, validity_months: x.validityMonths })),
      currency: "eur",
    };
  }

  async summary(orgId: string) {
    const credits = await this.credits.balance(orgId);
    return withTenant(this.db, orgId, async (tx) => {
      const ent = await this.entitlements.forOrganization(tx, orgId);
      const used = await this.entitlements.downloadsUsed(tx, orgId, ent);
      const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId));
      const [account] = await tx.select().from(billingAccounts).where(eq(billingAccounts.organizationId, orgId));
      return {
        plan_code: ent.planCode,
        plan_name: ent.planName,
        subscription: sub
          ? {
              status: sub.status,
              interval: sub.interval,
              current_period_end: sub.currentPeriodEnd.toISOString(),
              cancel_at_period_end: sub.cancelAtPeriodEnd,
              pending_plan_code: sub.pendingPlanCode,
            }
          : null,
        downloads: { used, quota: ent.downloadQuota, window_end: ent.windowEnd.toISOString() },
        credits: { available: credits, included_per_period: ent.includedCredits },
        has_billing_account: Boolean(account),
      };
    });
  }

  private async customerFor(orgId: string, email: string | null): Promise<string> {
    const { name, existing } = await withTenant(this.db, orgId, async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
      const [acc] = await tx.select().from(billingAccounts).where(eq(billingAccounts.organizationId, orgId));
      return { name: org?.name ?? "Organization", existing: acc?.stripeCustomerId ?? null };
    });
    const customerId = await this.provider.ensureCustomer({ organizationId: orgId, name, email, existingId: existing });
    if (!existing) {
      await withTenant(this.db, orgId, (tx) =>
        tx.insert(billingAccounts).values({ organizationId: orgId, stripeCustomerId: customerId }).onConflictDoNothing(),
      );
    }
    return customerId;
  }

  async checkout(
    orgId: string,
    userEmail: string,
    body: { type: "subscription"; plan: string; interval: "month" | "year" } | { type: "credit_pack"; pack: string },
    idempotencyKey: string,
  ) {
    const successUrl = `${webUrl()}/planos?checkout=success`;
    const cancelUrl = `${webUrl()}/planos?checkout=cancelled`;
    if (body.type === "subscription") {
      const [plan] = await this.db.select().from(plans).where(eq(plans.code, body.plan));
      if (!plan || plan.code === "free") throw new BadRequestException({ code: "unknown_plan", message: "Unknown plan" });
      const sub = await withTenant(this.db, orgId, async (tx) => (await tx.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId)))[0]);
      if (sub && (sub.status === "active" || sub.status === "past_due")) {
        throw new ConflictException({ code: "subscription_exists", message: "Organization already has a subscription; change plan instead" });
      }
      const customerId = await this.customerFor(orgId, userEmail);
      const amountCents = body.interval === "year" ? plan.annualPriceCents : plan.monthlyPriceCents; // preço decidido no backend
      return this.provider.createCheckout({
        type: "subscription", organizationId: orgId, customerId, successUrl, cancelUrl, idempotencyKey,
        plan: { code: plan.code, name: plan.name, interval: body.interval, amountCents },
      });
    }
    const [pack] = await this.db.select().from(creditPacks).where(eq(creditPacks.code, body.pack));
    if (!pack) throw new BadRequestException({ code: "unknown_pack", message: "Unknown credit pack" });
    const customerId = await this.customerFor(orgId, userEmail);
    return this.provider.createCheckout({
      type: "credit_pack", organizationId: orgId, customerId, successUrl, cancelUrl, idempotencyKey,
      pack: { code: pack.code, name: pack.name, credits: pack.credits, amountCents: pack.priceCents },
    });
  }

  async portal(orgId: string) {
    const acc = await withTenant(this.db, orgId, async (tx) => (await tx.select().from(billingAccounts).where(eq(billingAccounts.organizationId, orgId)))[0]);
    if (!acc?.stripeCustomerId) throw new ConflictException({ code: "no_billing_account", message: "No billing account yet" });
    return this.provider.createPortalSession(acc.stripeCustomerId, `${webUrl()}/planos`);
  }

  /**
   * Upgrade: imediato e proporcional. Downgrade: só no próximo ciclo (nunca penaliza o período corrente).
   * O estado local da assinatura é atualizado pelos webhooks; aqui só guardamos o downgrade agendado.
   */
  async changePlan(orgId: string, body: { plan: string; interval: "month" | "year" }) {
    const [target] = await this.db.select().from(plans).where(eq(plans.code, body.plan));
    if (!target || target.code === "free") throw new BadRequestException({ code: "unknown_plan", message: "Unknown plan" });
    return withTenant(this.db, orgId, async (tx) => {
      const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId));
      if (!sub?.stripeSubscriptionId || sub.status !== "active") {
        throw new ConflictException({ code: "no_active_subscription", message: "No active subscription" });
      }
      const [current] = await tx.select().from(plans).where(eq(plans.code, sub.planCode));
      if (target.code === sub.planCode) {
        throw new BadRequestException({ code: "use_portal", message: "Billing interval changes are done in the billing portal" });
      }
      const price = { code: target.code, name: target.name, interval: body.interval, amountCents: body.interval === "year" ? target.annualPriceCents : target.monthlyPriceCents };
      if (target.sortOrder > (current?.sortOrder ?? 0)) {
        await this.provider.upgradeSubscription({ subscriptionId: sub.stripeSubscriptionId, organizationId: orgId, plan: price });
        return { mode: "upgrade" as const, effective: "immediately" as const };
      }
      await this.provider.scheduleDowngrade({ subscriptionId: sub.stripeSubscriptionId, organizationId: orgId, plan: price });
      await tx.update(subscriptions).set({ pendingPlanCode: target.code, updatedAt: new Date() }).where(eq(subscriptions.organizationId, orgId));
      return { mode: "downgrade" as const, effective: "next_period" as const, effective_at: sub.currentPeriodEnd.toISOString() };
    });
  }

  invoices(orgId: string) {
    return withTenant(this.db, orgId, async (tx) => {
      const rows = await tx.select().from(invoices).where(and(eq(invoices.organizationId, orgId))).orderBy(desc(invoices.issuedAt)).limit(100);
      return rows.map((r) => ({
        id: r.id, number: r.number, amount_cents: r.amountCents, tax_cents: r.taxCents, currency: r.currency,
        hosted_url: r.hostedUrl, pdf_url: r.pdfUrl, issued_at: r.issuedAt.toISOString(),
      }));
    });
  }

  requireOrg(orgId: string | undefined) {
    if (!orgId) throw new NotFoundException({ code: "not_found", message: "Organization not found" });
    return orgId;
  }
}
