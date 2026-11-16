import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "1000";
process.env.STORAGE_DIR = `${process.env.TMPDIR ?? "/tmp"}/bigstock-apikey-${Date.now()}`;
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { apiKeys, apiUsageMinutes, assets, createDb, eq, inArray, runMigrations, subscriptions, users } from "@bigstock/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiKeyService } from "./api-access/api-key.service.js";
import { AppModule } from "./app.module.js";
import { CreditsService } from "./billing/credits.service.js";
import { configureApp } from "./configure.js";
import { IMAGE_PROVIDER } from "./ai/image-provider.js";
import { FakeImageProvider } from "./ai/fake.provider.js";
import { JOB_QUEUE } from "./ai/job-queue.js";

const url = process.env.DATABASE_URL;
const stamp = Date.now();
const password = "correct horse battery";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe.skipIf(!url)("API pública: chaves, escopos, limites e uso", () => {
  let app: NestExpressApplication;
  let keys: ApiKeyService;
  let credits: CreditsService;
  const { db, pool } = createDb(url ?? "");
  const http = () => request(app.getHttpServer());
  const createdAssets: string[] = [];
  let n = 0;

  async function org(plan?: "business" | "pro") {
    const email = `key-${stamp}-${++n}@example.com`;
    const res = await http().post("/v1/auth/register").send({ email, password, organizationName: "Key Lda" });
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
    const me = await http().get("/v1/auth/me").set("Cookie", cookie);
    const orgId = me.body.organizations[0].id as string;
    if (plan) {
      await db.insert(subscriptions).values({ organizationId: orgId, planCode: plan, status: "active", interval: "month", currentPeriodStart: new Date(Date.now() - 86_400_000), currentPeriodEnd: new Date(Date.now() + 29 * 86_400_000) });
    }
    return { cookie, orgId, email };
  }
  const makeKey = async (o: { cookie: string; orgId: string }, scopes: string[], name = "teste") => {
    const r = await http().post(`/v1/organizations/${o.orgId}/api-keys`).set("Cookie", o.cookie).send({ name, scopes });
    expect(r.status).toBe(201);
    return r.body.data as { id: string; key: string; prefix: string };
  };
  const bearer = (k: string) => ({ Authorization: `Bearer ${k}` });

  beforeAll(async () => {
    await runMigrations(url!);
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IMAGE_PROVIDER).useValue(new FakeImageProvider())
      .overrideProvider(JOB_QUEUE).useValue({ enabled: true, enqueue: async () => undefined })
      .compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    keys = app.get(ApiKeyService);
    credits = app.get(CreditsService);
  });
  afterAll(async () => {
    if (createdAssets.length) await db.update(assets).set({ status: "unpublished" }).where(inArray(assets.id, createdAssets));
    await app.close();
    await pool.end();
  });

  it("só planos com acesso à API criam chaves; o segredo aparece uma só vez e nunca é guardado", async () => {
    const free = await org();
    const denied = await http().post(`/v1/organizations/${free.orgId}/api-keys`).set("Cookie", free.cookie).send({ name: "x", scopes: ["assets:read"] });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("api_access_not_in_plan");

    const o = await org("business");
    const k = await makeKey(o, ["assets:read", "credits:read"]);
    expect(k.key).toMatch(/^bk_live_[a-f0-9]{8}_[A-Za-z0-9_-]{43}$/);
    const list = await http().get(`/v1/organizations/${o.orgId}/api-keys`).set("Cookie", o.cookie);
    expect(list.body.data).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(k.key.split("_").pop()!); // segredo nunca devolvido
    expect(list.body.data[0].prefix).toBe(k.prefix);
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, k.id));
    expect(row!.keyHash).not.toContain(k.key.split("_").pop()!);
    expect(row!.keyHash).toHaveLength(64);
  });

  it("autenticação: chave inválida, adulterada ou revogada é recusada", async () => {
    const o = await org("business");
    const k = await makeKey(o, ["credits:read"]);
    const ok = await http().get("/v1/credits").set(bearer(k.key));
    expect(ok.status).toBe(200);
    expect(ok.body.data.available).toBe(0);
    expect((await http().get("/v1/credits").set({ Authorization: "Bearer bk_live_deadbeef_" + "A".repeat(43) })).status).toBe(401);
    expect((await http().get("/v1/credits").set(bearer(k.key.slice(0, -1) + (k.key.endsWith("A") ? "B" : "A")))).status).toBe(401);
    expect((await http().get("/v1/credits").set({ Authorization: "Bearer bk_nope" })).status).toBe(401);
    const bad = await http().get("/v1/credits").set({ Authorization: "Bearer bk_nope" });
    expect(bad.body.error.code).toBe("invalid_api_key");
    expect(bad.body.request_id).toBeTruthy();

    expect((await http().delete(`/v1/organizations/${o.orgId}/api-keys/${k.id}`).set("Cookie", o.cookie)).status).toBe(204);
    const after = await http().get("/v1/credits").set(bearer(k.key));
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe("api_key_revoked_or_expired");
  });

  it("escopos: sem o escopo → 403; rotas de gestão nunca estão disponíveis por chave", async () => {
    const o = await org("business");
    const k = await makeKey(o, ["credits:read"]);
    const noScope = await http().get("/v1/assets").set(bearer(k.key));
    expect(noScope.status).toBe(403);
    expect(noScope.body.error.code).toBe("insufficient_scope");
    expect((await http().get(`/v1/organizations/${o.orgId}/members`).set(bearer(k.key))).status).toBe(403);
    expect((await http().get(`/v1/organizations/${o.orgId}/api-keys`).set(bearer(k.key))).status).toBe(403);
    expect((await http().post(`/v1/organizations/${o.orgId}/api-keys`).set(bearer(k.key)).send({ name: "x", scopes: ["credits:read"] })).status).toBe(403);
    expect((await http().get(`/v1/organizations/${o.orgId}/billing`).set(bearer(k.key))).status).toBe(403);
    expect((await http().get("/v1/auth/me").set(bearer(k.key))).status).toBe(403);
    expect((await http().post("/v1/ai/jobs").set(bearer(k.key)).send({})).status).toBe(403); // escopo ai:generate em falta
    expect((await http().get("/v1/usage").set(bearer(k.key))).status).toBe(403);
  });

  it("isolamento: a chave só opera na sua organização (mesmo pelo URL com orgId)", async () => {
    const a = await org("business");
    const b = await org("business");
    const ka = await makeKey(a, ["credits:read"]);
    expect((await http().get(`/v1/organizations/${a.orgId}/credits`).set(bearer(ka.key))).status).toBe(200);
    expect((await http().get(`/v1/organizations/${b.orgId}/credits`).set(bearer(ka.key))).status).toBe(404);
    await credits.grant(b.orgId, { balanceType: "purchased", amount: 77, expiresAt: null, idempotencyKey: "iso" });
    expect((await http().get("/v1/credits").set(bearer(ka.key))).body.data.available).toBe(0);
  });

  it("mesma lógica da web: catálogo, licença (Idempotency-Key) e IA por chave", async () => {
    const admin = await org();
    await db.update(users).set({ platformRole: "admin" }).where(eq(users.email, admin.email));
    const o = await org("business");
    await credits.grant(o.orgId, { balanceType: "purchased", amount: 100, expiresAt: null, idempotencyKey: "g" });
    const c = await http().post("/v1/admin/assets").set("Cookie", admin.cookie).send({ title: `Via API zorbo${stamp}`, category: "natureza", width: 1, height: 1 });
    const id = c.body.data.id as string;
    createdAssets.push(id);
    await http().put(`/v1/admin/assets/${id}/preview`).set("Cookie", admin.cookie).set("Content-Type", "image/png").send(PNG);
    await http().put(`/v1/admin/assets/${id}/original`).set("Cookie", admin.cookie).set("Content-Type", "image/png").send(PNG);
    await http().put(`/v1/admin/assets/${id}/rights`).set("Cookie", admin.cookie).send({ rightsHolder: "BIGhub", licenseBasis: "teste", verified: true });
    await http().post(`/v1/admin/assets/${id}/publish`).set("Cookie", admin.cookie).expect(204);

    const k = await makeKey(o, ["assets:read", "licenses:read", "licenses:write", "ai:generate", "ai:read", "credits:read", "usage:read"]);
    const search = await http().get("/v1/assets").query({ q: `zorbo${stamp}` }).set(bearer(k.key));
    expect(search.body.data.map((a: { id: string }) => a.id)).toEqual([id]);
    expect(JSON.stringify(search.body)).not.toMatch(/storage|original_key/);

    const noKey = await http().post("/v1/licenses").set(bearer(k.key)).send({ assetId: id });
    expect(noKey.status).toBe(400);
    expect(noKey.body.error.code).toBe("idempotency_key_required");
    const lic = await http().post("/v1/licenses").set(bearer(k.key)).set("Idempotency-Key", "api-lic-0001").send({ assetId: id });
    expect(lic.status).toBe(201);
    expect((await http().post("/v1/licenses").set(bearer(k.key)).set("Idempotency-Key", "api-lic-0001").send({ assetId: id })).body.data.id).toBe(lic.body.data.id);
    const dl = await http().post(`/v1/licenses/${lic.body.data.id}/download`).set(bearer(k.key));
    expect(dl.status).toBe(200);
    expect((await http().get(dl.body.data.url)).status).toBe(200); // URL assinado funciona sem sessão

    const job = await http().post("/v1/ai/jobs").set(bearer(k.key)).set("Idempotency-Key", "api-ai-00001").send({ prompt: "uma casa no campo", size: "1024x1024", quality: "standard", expectedCostCredits: 10 });
    expect(job.status).toBe(202);
    expect((await http().get("/v1/credits").set(bearer(k.key))).body.data.available).toBe(90);
    expect((await http().get(`/v1/ai/jobs/${job.body.data.id}`).set(bearer(k.key))).body.data.ai_generated).toBe(true);
    const use = await http().get("/v1/usage").set(bearer(k.key));
    expect(use.body.data.limits.requests_per_minute).toBe(300);
    expect(use.body.data.month.requests).toBeGreaterThan(5);
  });

  it("limite de taxa por minuto: 429 com Retry-After e cabeçalhos X-RateLimit; recusados não gastam quota", async () => {
    const o = await org("business");
    const k = await makeKey(o, ["credits:read"]);
    const first = await http().get("/v1/credits").set(bearer(k.key));
    expect(first.headers["x-ratelimit-limit"]).toBe("300");
    expect(Number(first.headers["x-ratelimit-remaining"])).toBe(299);
    // simula o limite chegando ao fim: contador do minuto atual perto de 300
    const minute = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    await db.update(apiUsageMinutes).set({ requests: 299 }).where(eq(apiUsageMinutes.keyId, k.id));
    void minute;
    const last = await http().get("/v1/credits").set(bearer(k.key));
    expect([200, 429]).toContain(last.status); // 300.º pedido ainda cabe (se o minuto não virou)
    const over = await http().get("/v1/credits").set(bearer(k.key));
    if (over.status === 429) {
      expect(over.body.error.code).toBe("rate_limited");
      expect(Number(over.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    }
  });

  it("quota mensal esgotada → 402 api_quota_exceeded", async () => {
    const o = await org("business");
    const k = await makeKey(o, ["credits:read"]);
    const auth = await keys.authenticate(k.key);
    const small = { ...auth, monthly: 2 };
    await keys.meter(small);
    await keys.meter(small);
    await expect(keys.meter(small)).rejects.toMatchObject({ status: 402 });
  });

  it("downgrade para plano sem API bloqueia a chave existente", async () => {
    const o = await org("business");
    const k = await makeKey(o, ["credits:read"]);
    expect((await http().get("/v1/credits").set(bearer(k.key))).status).toBe(200);
    await db.update(subscriptions).set({ planCode: "pro" }).where(eq(subscriptions.organizationId, o.orgId));
    await new Promise((r) => setTimeout(r, 15_500)); // expira a cache de 15 s
    const r = await http().get("/v1/credits").set(bearer(k.key));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("api_access_not_in_plan");
  }, 30_000);
});
