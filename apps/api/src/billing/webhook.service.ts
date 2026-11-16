import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  billingAccounts,
  creditPacks,
  eq,
  invoices,
  payments,
  plans,
  providerEvents,
  subscriptions,
  withTenant,
  type Database,
} from "@bigstock/database";
import { DB } from "../database.module.js";
import { CreditsService } from "./credits.service.js";
import type { ProviderEvent } from "./provider.js";

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const secs = (v: unknown): Date | null => (typeof v === "number" ? new Date(v * 1000) : null);
const orgOf = (o: Obj): string | null =>
  o.metadata?.organization_id ?? o.subscription_details?.metadata?.organization_id ?? o.parent?.subscription_details?.metadata?.organization_id ?? null;

const STATUS: Record<string, "active" | "past_due" | "cancelled" | "incomplete"> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "cancelled",
  incomplete: "incomplete",
  incomplete_expired: "cancelled",
  paused: "past_due",
};

/**
 * Processa webhooks do fornecedor. Cada evento é processado uma só vez (provider_events) e
 * cada passo é idempotente por chave própria, para que reentregas e crashes a meio sejam seguros.
 * O estado da assinatura é sempre derivado do fornecedor; nunca de parâmetros do cliente.
 */
@Injectable()
export class WebhookService {
  private readonly log = new Logger(WebhookService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly credits: CreditsService,
  ) {}

  async handle(event: ProviderEvent): Promise<{ duplicate: boolean }> {
    const seen = await this.db.select().from(providerEvents).where(eq(providerEvents.id, event.id));
    if (seen.length > 0) return { duplicate: true };
    const obj = event.data.object as Obj;
    switch (event.type) {
      case "checkout.session.completed":
        await this.onCheckoutCompleted(obj);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await this.onSubscription(event.id, obj);
        break;
      case "customer.subscription.deleted":
        await this.onSubscriptionDeleted(obj);
        break;
      case "invoice.paid":
        await this.onInvoicePaid(obj);
        break;
      case "invoice.payment_failed":
        await this.onInvoiceFailed(obj);
        break;
      default:
        this.log.debug({ msg: "unhandled provider event", type: event.type });
    }
    await this.db.insert(providerEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
    return { duplicate: false };
  }

  private async onCheckoutCompleted(s: Obj) {
    const orgId = orgOf(s);
    if (!orgId) return;
    if (typeof s.customer === "string") {
      await withTenant(this.db, orgId, (tx) =>
        tx.insert(billingAccounts).values({ organizationId: orgId, stripeCustomerId: s.customer }).onConflictDoNothing(),
      );
    }
    const packCode = s.metadata?.pack_code;
    if (s.mode === "payment" && s.payment_status === "paid" && packCode) {
      const [pack] = await this.db.select().from(creditPacks).where(eq(creditPacks.code, packCode));
      if (!pack) return;
      const expiresAt = new Date();
      expiresAt.setUTCMonth(expiresAt.getUTCMonth() + pack.validityMonths);
      await this.credits.grant(orgId, { balanceType: "purchased", amount: pack.credits, expiresAt, idempotencyKey: `pack:${s.id}` });
      await withTenant(this.db, orgId, (tx) =>
        tx.insert(payments).values({ organizationId: orgId, kind: "credit_pack", status: "succeeded", amountCents: s.amount_total ?? pack.priceCents, currency: s.currency ?? "eur", providerRef: `cs:${s.id}` }).onConflictDoNothing(),
      );
    }
  }

  private async onSubscription(eventId: string, s: Obj) {
    const orgId = orgOf(s);
    if (!orgId) return;
    const item = s.items?.data?.[0];
    const start = secs(s.current_period_start ?? item?.current_period_start);
    const end = secs(s.current_period_end ?? item?.current_period_end);
    if (!start || !end) return;
    const status = STATUS[s.status as string] ?? "incomplete";
    const interval: "month" | "year" = (item?.price?.recurring?.interval ?? s.metadata?.interval) === "year" ? "year" : "month";
    const newPlanCode: string | undefined = s.metadata?.plan_code;
    const pending: string | null = s.metadata?.pending_plan_code || null;

    let upgradeGrant = 0;
    await withTenant(this.db, orgId, async (tx) => {
      const [prev] = await tx.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId));
      const planCode = newPlanCode ?? prev?.planCode;
      if (!planCode) return;
      // Upgrade a meio do período: o benefício do novo plano é libertado de imediato.
      if (prev && prev.stripeSubscriptionId === s.id && (prev.status === "active" || prev.status === "past_due") && prev.planCode !== planCode) {
        const [oldPlan] = await tx.select().from(plans).where(eq(plans.code, prev.planCode));
        const [newPlan] = await tx.select().from(plans).where(eq(plans.code, planCode));
        if (oldPlan && newPlan && newPlan.includedCredits > oldPlan.includedCredits) upgradeGrant = newPlan.includedCredits - oldPlan.includedCredits;
      }
      const values = {
        organizationId: orgId, planCode, status, interval, currentPeriodStart: start, currentPeriodEnd: end,
        cancelAtPeriodEnd: Boolean(s.cancel_at_period_end || s.cancel_at),
        pendingPlanCode: pending && pending !== planCode ? pending : null,
        stripeSubscriptionId: s.id as string, updatedAt: new Date(),
      };
      await tx.insert(subscriptions).values(values).onConflictDoUpdate({ target: subscriptions.organizationId, set: values });
    });
    if (upgradeGrant > 0) {
      await this.credits.grant(orgId, { balanceType: "subscription", amount: upgradeGrant, expiresAt: end, idempotencyKey: `upgrade:${eventId}` });
    }
  }

  private async onSubscriptionDeleted(s: Obj) {
    const orgId = orgOf(s);
    if (!orgId) return;
    await withTenant(this.db, orgId, (tx) =>
      tx.update(subscriptions).set({ status: "cancelled", cancelAtPeriodEnd: false, pendingPlanCode: null, updatedAt: new Date() }).where(eq(subscriptions.organizationId, orgId)),
    );
  }

  private async onInvoicePaid(inv: Obj) {
    const orgId = orgOf(inv);
    if (!orgId) return;
    await withTenant(this.db, orgId, async (tx) => {
      await tx.insert(invoices).values({
        organizationId: orgId, stripeInvoiceId: inv.id, number: inv.number ?? null,
        amountCents: inv.total ?? inv.amount_paid ?? 0,
        taxCents: (inv.total_taxes ?? inv.total_tax_amounts ?? []).reduce((a: number, t: Obj) => a + (t.amount ?? 0), 0),
        currency: inv.currency ?? "eur", hostedUrl: inv.hosted_invoice_url ?? null, pdfUrl: inv.invoice_pdf ?? null,
        issuedAt: secs(inv.created) ?? new Date(),
      }).onConflictDoNothing();
      await tx.insert(payments).values({
        organizationId: orgId, kind: inv.metadata?.pack_code ? "credit_pack" : "subscription", status: "succeeded",
        amountCents: inv.amount_paid ?? 0, currency: inv.currency ?? "eur", providerRef: `inv:${inv.id}`,
      }).onConflictDoNothing();
    });
    // Créditos incluídos só na criação e na renovação (não em ajustes proporcionais, tratados no upgrade).
    if (inv.billing_reason === "subscription_create" || inv.billing_reason === "subscription_cycle") {
      const planCode: string | undefined = inv.subscription_details?.metadata?.plan_code ?? inv.parent?.subscription_details?.metadata?.plan_code ?? inv.metadata?.plan_code;
      if (!planCode) return;
      const [plan] = await this.db.select().from(plans).where(eq(plans.code, planCode));
      const periodEnd = secs(inv.lines?.data?.[0]?.period?.end);
      if (plan && plan.includedCredits > 0 && periodEnd) {
        // Não acumulam: expiram no fim do período.
        await this.credits.grant(orgId, { balanceType: "subscription", amount: plan.includedCredits, expiresAt: periodEnd, idempotencyKey: `sub:${inv.id}` });
      }
    }
  }

  private async onInvoiceFailed(inv: Obj) {
    const orgId = orgOf(inv);
    if (!orgId) return;
    await withTenant(this.db, orgId, async (tx) => {
      await tx.insert(payments).values({
        organizationId: orgId, kind: "subscription", status: "failed", amountCents: inv.amount_due ?? 0,
        currency: inv.currency ?? "eur", providerRef: `invf:${inv.id}:${inv.attempt_count ?? 0}`,
      }).onConflictDoNothing();
      // Dunning: a assinatura fica em past_due (a Stripe repete a cobrança); dados adquiridos continuam acessíveis.
      await tx.update(subscriptions).set({ status: "past_due", updatedAt: new Date() }).where(eq(subscriptions.organizationId, orgId));
    });
  }
}
