export const BILLING_PROVIDER = Symbol("BILLING_PROVIDER");

export type CheckoutRequest =
  | { type: "subscription"; organizationId: string; customerId: string; plan: PlanPrice; successUrl: string; cancelUrl: string; idempotencyKey: string }
  | { type: "credit_pack"; organizationId: string; customerId: string; pack: PackPrice; successUrl: string; cancelUrl: string; idempotencyKey: string };

export interface PlanPrice {
  code: string;
  name: string;
  interval: "month" | "year";
  amountCents: number;
}
export interface PackPrice {
  code: string;
  name: string;
  credits: number;
  amountCents: number;
}

/** Evento do fornecedor já verificado (assinatura) e normalizado como objeto genérico. */
export interface ProviderEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Fornecedor de pagamentos e faturação fiscal (Stripe). O domínio nunca fala com o SDK
 * diretamente: tudo passa por esta interface (CLAUDE.md §2 — sem motor fiscal próprio).
 */
export interface BillingProvider {
  ensureCustomer(input: { organizationId: string; name: string; email: string | null; existingId: string | null }): Promise<string>;
  createCheckout(req: CheckoutRequest): Promise<{ url: string }>;
  createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
  /** Upgrade: efeito imediato com proporcional. */
  upgradeSubscription(input: { subscriptionId: string; organizationId: string; plan: PlanPrice }): Promise<void>;
  /** Downgrade: só entra em vigor no próximo ciclo de faturação. */
  scheduleDowngrade(input: { subscriptionId: string; organizationId: string; plan: PlanPrice }): Promise<void>;
  verifyWebhook(rawBody: Buffer, signature: string): ProviderEvent;
}
