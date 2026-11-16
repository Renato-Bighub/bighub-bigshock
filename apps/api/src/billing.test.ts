import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "1000";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createDb, eq, invoices, payments, runMigrations, subscriptions } from "@bigstock/database";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";
import { CreditsService } from "./billing/credits.service.js";
import { BILLING_PROVIDER, type BillingProvider, type CheckoutRequest, type ProviderEvent } from "./billing/provider.js";
import { configureApp } from "./configure.js";

const url = process.env.DATABASE_URL;
const stamp = Date.now();
const WH_SECRET = "whsec_test_secret";
const stripeLib = new Stripe("sk_test_dummy");

/** Fornecedor falso: regista chamadas; a verificação de assinatura dos webhooks é a real da Stripe. */
class FakeProvider implements BillingProvider {
  checkouts: CheckoutRequest[] = [];
  upgrades: unknown[] = [];
  downgrades: unknown[] = [];
  async ensureCustomer({ organizationId }: { organizationId: string }) { return `cus_${organizationId.slice(0, 8)}`; }
  async createCheckout(req: CheckoutRequest) { this.checkouts.push(req); return { url: `https://checkout.test/${req.type}` }; }
  async createPortalSession(customerId: string) { return { url: `https://portal.test/${customerId}` }; }
  async upgradeSubscription(i: unknown) { this.upgrades.push(i); }
  async scheduleDowngrade(i: unknown) { this.downgrades.push(i); }
  verifyWebhook(raw: Buffer, sig: string): ProviderEvent {
    const e = stripeLib.webhooks.constructEvent(raw, sig, WH_SECRET);
    return { id: e.id, type: e.type, data: { object: e.data.object as unknown as Record<string, unknown> } };
  }
}

describe.skipIf(!url)("monetização: checkout, assinaturas e webhooks", () => {
  let app: NestExpressApplication;
  let credits: CreditsService;
  const provider = new FakeProvider();
  const { db, pool } = createDb(url ?? "");
  const http = () => request(app.getHttpServer());
  let n = 0;

  async function newOrg(role: "owner" | "member" = "owner") {
    const res = await http().post("/v1/auth/register").send({ email: `bill-${stamp}-${++n}@example.com`, password: "correct horse battery", organizationName: "Bill" });
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
    const me = await http().get("/v1/auth/me").set("Cookie", cookie);
    void role;
    return { cookie, orgId: me.body.organizations[0].id as string };
  }

  function event(type: string, object: Record<string, unknown>, id = `evt_${randomUUID()}`) {
    const payload = JSON.stringify({ id, object: "event", type, data: { object } });
    const sig = stripeLib.webhooks.generateTestHeaderString({ payload, secret: WH_SECRET });
    return { id, payload, sig };
  }
  const send = (e: { payload: string; sig: string }) => http().post("/v1/webhooks/stripe").set("Stripe-Signature", e.sig).set("Content-Type", "application/json").send(e.payload);

  const now = Math.floor(Date.now() / 1000);
  const period = { current_period_start: now - 3600, current_period_end: now + 29 * 86400 };
  const sub = (orgId: string, plan: string, over: Record<string, unknown> = {}) => ({
    id: `sub_${orgId.slice(0, 8)}`, status: "active", customer: `cus_${orgId.slice(0, 8)}`,
    metadata: { organization_id: orgId, plan_code: plan, interval: "month" },
    items: { data: [{ price: { recurring: { interval: "month" } } }] }, ...period, ...over,
  });
  const invoice = (orgId: string, plan: string, reason: string, id = `in_${randomUUID()}`) => ({
    id, number: "BS-0001", total: 4900, amount_paid: 4900, currency: "eur", created: now, billing_reason: reason,
    total_taxes: [{ amount: 913 }], hosted_invoice_url: "https://invoice.test/h", invoice_pdf: "https://invoice.test/p",
    subscription_details: { metadata: { organization_id: orgId, plan_code: plan } },
    lines: { data: [{ period: { start: period.current_period_start, end: period.current_period_end } }] },
  });

  beforeAll(async () => {
    process.env.WEB_URL = "https://app.test";
    await runMigrations(url!);
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(BILLING_PROVIDER).useValue(provider).compile();
    app = mod.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app);
    await app.init();
    credits = app.get(CreditsService);
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("catálogo de planos e pacotes vem da base de dados", async () => {
    const o = await newOrg();
    const res = await http().get("/v1/plans").set("Cookie", o.cookie);
    expect(res.body.data.plans.map((p: { code: string }) => p.code)).toEqual(["free", "starter", "pro", "business", "api_platform"]);
    expect(res.body.data.credit_packs).toHaveLength(3);
  });

  it("checkout exige Idempotency-Key, permissão e usa o preço do backend", async () => {
    const o = await newOrg();
    const body = { type: "subscription", plan: "pro", interval: "year", priceCents: 1 };
    expect((await http().post(`/v1/organizations/${o.orgId}/billing/checkout`).set("Cookie", o.cookie).send(body)).status).toBe(400);
    const ok = await http().post(`/v1/organizations/${o.orgId}/billing/checkout`).set("Cookie", o.cookie).set("Idempotency-Key", "idem-key-0001").send(body);
    expect(ok.status).toBe(200);
    expect(ok.body.data.url).toContain("checkout.test");
    const sent = provider.checkouts.at(-1)!;
    expect(sent.type === "subscription" && sent.plan.amountCents).toBe(47040); // anual do plano, ignora qualquer valor do cliente
    expect(sent.type === "subscription" && sent.successUrl).toBe("https://app.test/planos?checkout=success");
    expect((await http().post(`/v1/organizations/${o.orgId}/billing/checkout`).set("Cookie", o.cookie).set("Idempotency-Key", "idem-key-0002").send({ type: "subscription", plan: "free" })).status).toBe(400);
    expect((await http().post(`/v1/organizations/${o.orgId}/billing/checkout`).set("Cookie", o.cookie).set("Idempotency-Key", "idem-key-0003").send({ type: "credit_pack", pack: "nope" })).status).toBe(400);
    const pack = await http().post(`/v1/organizations/${o.orgId}/billing/checkout`).set("Cookie", o.cookie).set("Idempotency-Key", "idem-key-0004").send({ type: "credit_pack", pack: "pack_2000" });
    expect(pack.status).toBe(200);
    const p = provider.checkouts.at(-1)!;
    expect(p.type === "credit_pack" && p.pack.amountCents).toBe(2900);
  });

  it("webhooks: assinatura inválida é rejeitada; compra de pacote credita uma só vez", async () => {
    const o = await newOrg();
    expect((await http().post("/v1/webhooks/stripe").set("Stripe-Signature", "t=1,v1=bad").set("Content-Type", "application/json").send("{}")).status).toBe(400);
    expect((await http().post("/v1/webhooks/stripe").set("Content-Type", "application/json").send("{}")).status).toBe(400);

    const session = { id: "cs_test_1" + stamp + o.orgId.slice(0, 4), mode: "payment", payment_status: "paid", customer: "cus_x", amount_total: 2900, currency: "eur", metadata: { organization_id: o.orgId, pack_code: "pack_2000" } };
    const e1 = event("checkout.session.completed", session);
    expect((await send(e1)).body.duplicate).toBe(false);
    expect((await send(e1)).body.duplicate).toBe(true); // reentrega do mesmo evento
    await send(event("checkout.session.completed", session)); // evento novo, mesma sessão: chave de idempotência protege
    expect(await credits.balance(o.orgId)).toBe(2000);
    const pays = await db.select().from(payments).where(eq(payments.organizationId, o.orgId));
    expect(pays).toHaveLength(1);
    expect(pays[0]!.kind).toBe("credit_pack");
  });

  it("ciclo da assinatura: ativação, créditos do período, fatura, falha de pagamento e cancelamento", async () => {
    const o = await newOrg();
    await send(event("customer.subscription.created", sub(o.orgId, "pro")));
    const inv = invoice(o.orgId, "pro", "subscription_create");
    await send(event("invoice.paid", inv));
    await send(event("invoice.paid", inv)); // reentrega

    const summary = await http().get(`/v1/organizations/${o.orgId}/billing`).set("Cookie", o.cookie);
    expect(summary.body.data.plan_code).toBe("pro");
    expect(summary.body.data.downloads.quota).toBe(150);
    expect(summary.body.data.credits.available).toBe(4000); // incluídos do plano, uma só vez
    const invs = await http().get(`/v1/organizations/${o.orgId}/billing/invoices`).set("Cookie", o.cookie);
    expect(invs.body.data).toHaveLength(1);
    expect(invs.body.data[0]).toMatchObject({ number: "BS-0001", amount_cents: 4900, tax_cents: 913 });
    expect(await db.select().from(invoices).where(eq(invoices.organizationId, o.orgId))).toHaveLength(1);

    // créditos incluídos expiram no fim do período (não acumulam)
    const ledger = await http().get(`/v1/organizations/${o.orgId}/credits/ledger`).set("Cookie", o.cookie);
    expect(new Date(ledger.body.data[0].expires_at).getTime() / 1000).toBeCloseTo(period.current_period_end, -1);

    // pagamento falhado → past_due, mas o plano mantém-se durante a janela de dunning
    await send(event("invoice.payment_failed", { id: "in_fail1" + o.orgId.slice(0, 4), amount_due: 4900, attempt_count: 1, currency: "eur", subscription_details: { metadata: { organization_id: o.orgId } } }));
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, o.orgId));
    expect(row!.status).toBe("past_due");
    expect((await http().get(`/v1/organizations/${o.orgId}/billing`).set("Cookie", o.cookie)).body.data.plan_code).toBe("pro");

    await send(event("customer.subscription.deleted", sub(o.orgId, "pro", { status: "canceled" })));
    expect((await http().get(`/v1/organizations/${o.orgId}/billing`).set("Cookie", o.cookie)).body.data.plan_code).toBe("free");
    // créditos já adquiridos continuam
    expect((await http().get(`/v1/organizations/${o.orgId}/credits`).set("Cookie", o.cookie)).body.data.available).toBe(4000);
  });

  it("upgrade é imediato; downgrade só no próximo ciclo", async () => {
    const o = await newOrg();
    await send(event("customer.subscription.created", sub(o.orgId, "starter")));
    await send(event("invoice.paid", invoice(o.orgId, "starter", "subscription_create")));
    expect(await credits.balance(o.orgId)).toBe(500);

    const up = await http().post(`/v1/organizations/${o.orgId}/billing/change-plan`).set("Cookie", o.cookie).send({ plan: "business", interval: "month" });
    expect(up.body.data).toMatchObject({ mode: "upgrade", effective: "immediately" });
    expect(provider.upgrades).toHaveLength(1);
    // o fornecedor confirma por webhook: benefício liberado já, só a diferença
    await send(event("customer.subscription.updated", sub(o.orgId, "business")));
    expect(await credits.balance(o.orgId)).toBe(15000); // 500 + (15000-500)

    const down = await http().post(`/v1/organizations/${o.orgId}/billing/change-plan`).set("Cookie", o.cookie).send({ plan: "starter", interval: "month" });
    expect(down.body.data).toMatchObject({ mode: "downgrade", effective: "next_period" });
    expect(provider.downgrades).toHaveLength(1);
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, o.orgId));
    expect(row!.planCode).toBe("business"); // continua no plano atual até ao fim do período
    expect(row!.pendingPlanCode).toBe("starter");
    expect((await http().post(`/v1/organizations/${o.orgId}/billing/change-plan`).set("Cookie", o.cookie).send({ plan: "business" })).status).toBe(400);
  });

  it("assinatura de uma organização nunca afeta outra", async () => {
    const a = await newOrg();
    const b = await newOrg();
    await send(event("customer.subscription.created", sub(a.orgId, "business")));
    expect((await http().get(`/v1/organizations/${b.orgId}/billing`).set("Cookie", b.cookie)).body.data.plan_code).toBe("free");
    expect((await http().get(`/v1/organizations/${a.orgId}/billing`).set("Cookie", b.cookie)).status).toBe(404);
  });

  it("portal de faturação: isolado por organização e só após existir conta de faturação", async () => {
    const o = await newOrg();
    const m = await newOrg();
    // quem não é membro da organização recebe 404
    expect((await http().post(`/v1/organizations/${o.orgId}/billing/portal`).set("Cookie", m.cookie)).status).toBe(404);
    const portal = await http().post(`/v1/organizations/${o.orgId}/billing/portal`).set("Cookie", o.cookie);
    expect(portal.status).toBe(409); // ainda sem conta de faturação
    await http().post(`/v1/organizations/${o.orgId}/billing/checkout`).set("Cookie", o.cookie).set("Idempotency-Key", "idem-key-9999").send({ type: "credit_pack", pack: "pack_500" });
    const portal2 = await http().post(`/v1/organizations/${o.orgId}/billing/portal`).set("Cookie", o.cookie);
    expect(portal2.body.data.url).toContain("portal.test");
  });
});
