import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "100000";
process.env.STORAGE_DIR = `${process.env.TMPDIR ?? "/tmp"}/bigstock-gdpr-${Date.now()}`;
process.env.CRON_SECRET = "cron-secret-for-tests-0123456789";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { aiJobs, apiKeys, auditEvents, createDb, creditEntries, eq, organizations, runMigrations, sessions, subscriptions, users } from "@bigstock/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiRunnerService } from "./ai/ai-runner.service.js";
import { FakeImageProvider } from "./ai/fake.provider.js";
import { IMAGE_PROVIDER } from "./ai/image-provider.js";
import { JOB_QUEUE } from "./ai/job-queue.js";
import { AppModule } from "./app.module.js";
import { BILLING_PROVIDER } from "./billing/provider.js";
import { CreditsService } from "./billing/credits.service.js";
import { configureApp } from "./configure.js";

const url = process.env.DATABASE_URL;
const stamp = Date.now();
const password = "correct horse battery";

describe.skipIf(!url)("RGPD: exportação, eliminação e retenção", () => {
  let app: NestExpressApplication;
  let credits: CreditsService;
  let runner: AiRunnerService;
  const cancelled: string[] = [];
  const { db, pool } = createDb(url ?? "");
  const http = () => request(app.getHttpServer());
  let n = 0;

  async function newUser(label: string) {
    const email = `gdpr-${stamp}-${++n}-${label}@example.com`;
    const res = await http().post("/v1/auth/register").send({ email, password, displayName: `Nome ${label}`, organizationName: `Org ${label}` });
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
    const me = await http().get("/v1/auth/me").set("Cookie", cookie);
    return { email, cookie, userId: me.body.user.id as string, orgId: me.body.organizations[0].id as string };
  }

  beforeAll(async () => {
    await runMigrations(url!);
    const provider = {
      ensureCustomer: async () => "cus_x", createCheckout: async () => ({ url: "x" }), createPortalSession: async () => ({ url: "x" }),
      upgradeSubscription: async () => undefined, scheduleDowngrade: async () => undefined,
      cancelSubscription: async (id: string) => { cancelled.push(id); }, verifyWebhook: () => { throw new Error("unused"); },
    };
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BILLING_PROVIDER).useValue(provider)
      .overrideProvider(IMAGE_PROVIDER).useValue(new FakeImageProvider())
      .overrideProvider(JOB_QUEUE).useValue({ enabled: true, enqueue: async () => undefined })
      .compile();
    app = mod.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app);
    await app.init();
    credits = app.get(CreditsService);
    runner = app.get(AiRunnerService);
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("exportação: dados do titular, sem segredos nem dados de terceiros; fica auditada", async () => {
    const u = await newUser("export");
    await credits.grant(u.orgId, { balanceType: "purchased", amount: 50, expiresAt: null, idempotencyKey: "g" });
    const job = await http().post(`/v1/organizations/${u.orgId}/ai/jobs`).set("Cookie", u.cookie).set("Idempotency-Key", "gdpr-job-0001").send({ prompt: "o meu prompt privado", size: "1024x1024", quality: "standard", expectedCostCredits: 10 });
    expect(job.status).toBe(202);
    await http().post(`/v1/organizations/${u.orgId}/invitations`).set("Cookie", u.cookie).send({ email: `terceiro-${stamp}@example.com`, role: "member" });

    const res = await http().get("/v1/me/export").set("Cookie", u.cookie);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.body.subject).toMatchObject({ email: u.email, display_name: "Nome export" });
    expect(res.body.organizations[0].ai_jobs[0].prompt).toBe("o meu prompt privado");
    expect(res.body.organizations[0].invitations_sent).toHaveLength(1);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("terceiro-"); // e-mail do convidado (terceiro) não é exportado
    expect(text).not.toMatch(/password|token_hash|key_hash|\$argon2/i);
    const [ev] = await db.select().from(auditEvents).where(eq(auditEvents.actorUserId, u.userId));
    expect(ev).toBeTruthy();
    expect((await http().get("/v1/me/export")).status).toBe(401);
  });

  it("eliminação: exige a senha e a confirmação", async () => {
    const u = await newUser("confirm");
    expect((await http().post("/v1/me/erase").set("Cookie", u.cookie).send({ password: "outra-senha-errada", confirm: "ELIMINAR" })).status).toBe(401);
    expect((await http().post("/v1/me/erase").set("Cookie", u.cookie).send({ password })).status).toBe(400);
    expect((await http().get("/v1/auth/me").set("Cookie", u.cookie)).status).toBe(200); // nada mudou
  });

  it("utilizador único: anonimiza a conta, encerra a organização e retém os registos financeiros", async () => {
    const u = await newUser("solo");
    await credits.grant(u.orgId, { balanceType: "purchased", amount: 100, expiresAt: null, idempotencyKey: "g" });
    const job = await http().post(`/v1/organizations/${u.orgId}/ai/jobs`).set("Cookie", u.cookie).set("Idempotency-Key", "gdpr-solo-0001").send({ prompt: "conteúdo sensível do cliente", size: "1024x1024", quality: "standard", expectedCostCredits: 10 });
    await runner.run(u.orgId, job.body.data.id, 0);
    // API Pública + assinatura ativa na Stripe
    await db.insert(subscriptions).values({ organizationId: u.orgId, planCode: "business", status: "active", interval: "month", currentPeriodStart: new Date(Date.now() - 1000), currentPeriodEnd: new Date(Date.now() + 86_400_000), stripeSubscriptionId: `sub_gdpr_solo_${stamp}` });
    const key = (await http().post(`/v1/organizations/${u.orgId}/api-keys`).set("Cookie", u.cookie).send({ name: "k", scopes: ["credits:read"] })).body.data;
    const before = await db.select().from(creditEntries).where(eq(creditEntries.organizationId, u.orgId));

    const res = await http().post("/v1/me/erase").set("Cookie", u.cookie).send({ password, confirm: "ELIMINAR" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ closed_organizations: 1, left_organizations: 0 });
    expect(cancelled).toContain(`sub_gdpr_solo_${stamp}`);

    // conta anonimizada e inutilizável
    const [row] = await db.select().from(users).where(eq(users.id, u.userId));
    expect(row).toMatchObject({ email: `deleted-${u.userId}@anonymized.invalid`, displayName: null, passwordHash: null });
    expect(row!.deletedAt).toBeTruthy();
    expect((await http().get("/v1/auth/me").set("Cookie", u.cookie)).status).toBe(401);
    expect((await http().post("/v1/auth/login").send({ email: u.email, password })).status).toBe(401);
    const live = await db.select().from(sessions).where(eq(sessions.userId, u.userId));
    expect(live.every((s) => s.revokedAt !== null)).toBe(true);

    // organização encerrada; conteúdo privado removido; chaves revogadas; registos financeiros e de auditoria retidos
    const [org] = await db.select().from(organizations).where(eq(organizations.id, u.orgId));
    expect(org).toMatchObject({ name: "Organização encerrada" });
    expect(org!.closedAt).toBeTruthy();
    const [aj] = await db.select().from(aiJobs).where(eq(aiJobs.organizationId, u.orgId));
    expect(aj!.prompt).toBe("[removido a pedido do titular]");
    expect(aj!.outputKey).toBeNull();
    expect((await db.select().from(apiKeys).where(eq(apiKeys.id, key.id)))[0]!.revokedAt).toBeTruthy();
    expect((await db.select().from(creditEntries).where(eq(creditEntries.organizationId, u.orgId))).length).toBe(before.length);
    expect((await db.select().from(auditEvents).where(eq(auditEvents.actorUserId, u.userId))).some((e) => e.action === "gdpr.erase")).toBe(true);

    // o e-mail original fica livre para novo registo
    expect((await http().post("/v1/auth/register").send({ email: u.email, password, organizationName: "Nova" })).status).toBe(201);
  });

  it("organização partilhada: o membro sai; único dono com outros membros tem de transferir a propriedade", async () => {
    const owner = await newUser("owner");
    const member = await newUser("member");
    const inv = await http().post(`/v1/organizations/${owner.orgId}/invitations`).set("Cookie", owner.cookie).send({ email: member.email, role: "member" });
    await http().post("/v1/invitations/accept").set("Cookie", member.cookie).send({ token: inv.body.data.token }).expect(200);

    const blocked = await http().post("/v1/me/erase").set("Cookie", owner.cookie).send({ password, confirm: "ELIMINAR" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("sole_owner");
    expect((await http().get("/v1/auth/me").set("Cookie", owner.cookie)).status).toBe(200);

    // o membro elimina a sua conta: a organização do dono continua intacta
    const mOrgs = (await http().get("/v1/auth/me").set("Cookie", member.cookie)).body.organizations;
    expect(mOrgs).toHaveLength(2);
    const res = await http().post("/v1/me/erase").set("Cookie", member.cookie).send({ password, confirm: "ELIMINAR" });
    expect(res.body.data).toMatchObject({ closed_organizations: 1, left_organizations: 1 });
    const members = await http().get(`/v1/organizations/${owner.orgId}/members`).set("Cookie", owner.cookie);
    expect(members.body.data.map((m: { email: string }) => m.email)).toEqual([owner.email]);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, owner.orgId));
    expect(org!.closedAt).toBeNull();
  });

  it("chaves de API não acedem a exportação nem eliminação", async () => {
    const u = await newUser("keyed");
    await db.insert(subscriptions).values({ organizationId: u.orgId, planCode: "business", status: "active", interval: "month", currentPeriodStart: new Date(Date.now() - 1000), currentPeriodEnd: new Date(Date.now() + 86_400_000) });
    const key = (await http().post(`/v1/organizations/${u.orgId}/api-keys`).set("Cookie", u.cookie).send({ name: "k", scopes: ["credits:read"] })).body.data.key;
    expect((await http().get("/v1/me/export").set("Authorization", `Bearer ${key}`)).status).toBe(403);
    expect((await http().post("/v1/me/erase").set("Authorization", `Bearer ${key}`).send({ password, confirm: "ELIMINAR" })).status).toBe(403);
  });

  it("retenção: protegida por segredo e apaga dados operacionais antigos", async () => {
    expect((await http().get("/v1/internal/retention")).status).toBe(401);
    expect((await http().get("/v1/internal/retention").set("Authorization", "Bearer errado")).status).toBe(401);
    const old = new Date(Date.now() - 40 * 86_400_000);
    await db.execute(`insert into auth_attempts (email_hash, ip, success, created_at) values ('retention-test-${stamp}', '127.0.0.1', false, '${old.toISOString()}')` as never);
    const res = await http().get("/v1/internal/retention").set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.data.auth_attempts).toBeGreaterThanOrEqual(1);
    const left = await db.execute(`select count(*)::int n from auth_attempts where email_hash = 'retention-test-${stamp}'` as never);
    expect((left.rows[0] as { n: number }).n).toBe(0);
  });
});
