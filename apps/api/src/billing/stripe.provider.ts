import { HttpException } from "@nestjs/common";
import Stripe from "stripe";
import type { BillingProvider, CheckoutRequest, PackPrice, PlanPrice, ProviderEvent } from "./provider.js";

const unavailable = () => new HttpException({ code: "billing_unavailable", message: "Billing provider is not configured" }, 503);

/** Usado quando STRIPE_SECRET_KEY não está definida (ex.: desenvolvimento sem Stripe). */
export class DisabledProvider implements BillingProvider {
  ensureCustomer(): Promise<string> { throw unavailable(); }
  createCheckout(): Promise<{ url: string }> { throw unavailable(); }
  createPortalSession(): Promise<{ url: string }> { throw unavailable(); }
  upgradeSubscription(): Promise<void> { throw unavailable(); }
  scheduleDowngrade(): Promise<void> { throw unavailable(); }
  cancelSubscription(): Promise<void> { throw unavailable(); }
  verifyWebhook(): ProviderEvent { throw unavailable(); }
}

export class StripeProvider implements BillingProvider {
  private readonly stripe: Stripe;
  private readonly priceCache = new Map<string, string>();

  constructor(secretKey: string, private readonly webhookSecret: string, private readonly automaticTax = false) {
    this.stripe = new Stripe(secretKey);
  }

  async ensureCustomer({ organizationId, name, email, existingId }: { organizationId: string; name: string; email: string | null; existingId: string | null }) {
    if (existingId) return existingId;
    const c = await this.stripe.customers.create(
      { name, email: email ?? undefined, metadata: { organization_id: organizationId } },
      { idempotencyKey: `customer:${organizationId}` },
    );
    return c.id;
  }

  /**
   * Os preços vivem na nossa BD (fonte única). Cada preço é garantido no Stripe por lookup_key;
   * se o valor mudou, cria-se um preço novo e transfere-se a chave.
   */
  private async ensurePrice(key: string, name: string, amountCents: number, interval?: "month" | "year"): Promise<string> {
    const cacheKey = `${key}:${amountCents}`;
    const hit = this.priceCache.get(cacheKey);
    if (hit) return hit;
    const found = await this.stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
    const existing = found.data[0];
    if (existing && existing.unit_amount === amountCents) {
      this.priceCache.set(cacheKey, existing.id);
      return existing.id;
    }
    const price = await this.stripe.prices.create({
      currency: "eur",
      unit_amount: amountCents,
      lookup_key: key,
      transfer_lookup_key: true,
      tax_behavior: "exclusive",
      recurring: interval ? { interval } : undefined,
      product_data: { name: `BIGstock — ${name}` },
    });
    this.priceCache.set(cacheKey, price.id);
    return price.id;
  }

  private priceKey(plan: PlanPrice) {
    return `bigstock_${plan.code}_${plan.interval}`;
  }

  async createCheckout(req: CheckoutRequest) {
    const taxing = this.automaticTax
      ? ({ automatic_tax: { enabled: true }, tax_id_collection: { enabled: true }, customer_update: { address: "auto", name: "auto" }, billing_address_collection: "required" } as const)
      : ({} as const);
    if (req.type === "subscription") {
      const price = await this.ensurePrice(this.priceKey(req.plan), req.plan.name, req.plan.amountCents, req.plan.interval);
      const meta = { organization_id: req.organizationId, plan_code: req.plan.code, interval: req.plan.interval };
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: req.customerId,
          line_items: [{ price, quantity: 1 }],
          subscription_data: { metadata: meta },
          metadata: meta,
          success_url: req.successUrl,
          cancel_url: req.cancelUrl,
          ...taxing,
        },
        { idempotencyKey: req.idempotencyKey },
      );
      return { url: session.url! };
    }
    const price = await this.ensurePrice(`bigstock_${req.pack.code}`, req.pack.name, req.pack.amountCents);
    const meta = { organization_id: req.organizationId, pack_code: req.pack.code };
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer: req.customerId,
        line_items: [{ price, quantity: 1 }],
        metadata: meta,
        // Fatura fiscal também para compras avulsas.
        invoice_creation: { enabled: true, invoice_data: { metadata: meta } },
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        ...taxing,
      },
      { idempotencyKey: req.idempotencyKey },
    );
    return { url: session.url! };
  }

  async createPortalSession(customerId: string, returnUrl: string) {
    const s = await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { url: s.url };
  }

  private async currentItem(subscriptionId: string) {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const item = sub.items.data[0];
    if (!item) throw new Error("subscription has no items");
    return { sub, item };
  }

  async upgradeSubscription({ subscriptionId, organizationId, plan }: { subscriptionId: string; organizationId: string; plan: PlanPrice }) {
    const { item } = await this.currentItem(subscriptionId);
    const price = await this.ensurePrice(this.priceKey(plan), plan.name, plan.amountCents, plan.interval);
    await this.stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price }],
      // Proporcional faturado já: o benefício do novo plano é imediato (CLAUDE.md §6).
      proration_behavior: "always_invoice",
      metadata: { organization_id: organizationId, plan_code: plan.code, interval: plan.interval, pending_plan_code: "" },
      cancel_at_period_end: false,
    });
  }

  async scheduleDowngrade({ subscriptionId, organizationId, plan }: { subscriptionId: string; organizationId: string; plan: PlanPrice }) {
    const { sub, item } = await this.currentItem(subscriptionId);
    const price = await this.ensurePrice(this.priceKey(plan), plan.name, plan.amountCents, plan.interval);
    const schedule = sub.schedule
      ? await this.stripe.subscriptionSchedules.retrieve(typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id)
      : await this.stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
    const current = schedule.phases[0]!;
    await this.stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        { items: [{ price: item.price.id, quantity: 1 }], start_date: current.start_date, end_date: current.end_date, metadata: { plan_code: sub.metadata?.plan_code ?? "" } },
        // Novo plano só a partir do próximo ciclo: nunca penaliza o uso do período corrente.
        { items: [{ price, quantity: 1 }], metadata: { organization_id: organizationId, plan_code: plan.code, interval: plan.interval } },
      ],
    });
    await this.stripe.subscriptions.update(subscriptionId, { metadata: { pending_plan_code: plan.code } });
  }

  async cancelSubscription(subscriptionId: string) {
    await this.stripe.subscriptions.cancel(subscriptionId);
  }

  verifyWebhook(rawBody: Buffer, signature: string): ProviderEvent {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    return { id: event.id, type: event.type, data: { object: event.data.object as unknown as Record<string, unknown> } };
  }
}

export function createProviderFromEnv(): BillingProvider {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return new DisabledProvider();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set");
  return new StripeProvider(key, secret, process.env.STRIPE_AUTOMATIC_TAX === "true");
}

export type { PackPrice };
