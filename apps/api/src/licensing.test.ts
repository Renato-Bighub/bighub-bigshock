import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "1000";
process.env.STORAGE_DIR = `${process.env.TMPDIR ?? "/tmp"}/bigstock-lic-${Date.now()}`;
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { assets, createDb, downloadEvents, eq, inArray, licenseGrants, rightsRecords, runMigrations, subscriptions, users } from "@bigstock/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure.js";
import { signDownload } from "./licensing/download-token.js";

const url = process.env.DATABASE_URL;
const stamp = Date.now();
const password = "correct horse battery";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe.skipIf(!url)("licenciamento e downloads", () => {
  let app: NestExpressApplication;
  const { db, pool } = createDb(url ?? "");
  const http = () => request(app.getHttpServer());
  const created: string[] = [];

  async function user(name: string, platformRole?: "editor" | "admin") {
    const email = `${name}-${stamp}@example.com`;
    const res = await http().post("/v1/auth/register").send({ email, password, organizationName: `${name} Lda` });
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
    const me = await http().get("/v1/auth/me").set("Cookie", cookie);
    if (platformRole) await db.update(users).set({ platformRole }).where(eq(users.email, email));
    return { cookie, userId: me.body.user.id as string, orgId: me.body.organizations[0].id as string };
  }
  let a: Awaited<ReturnType<typeof user>>;
  let b: Awaited<ReturnType<typeof user>>;
  let admin: Awaited<ReturnType<typeof user>>;
  let assetId = "";

  const license = (who: typeof a, id: string, key?: string) => {
    const r = http().post(`/v1/organizations/${who.orgId}/licenses`).set("Cookie", who.cookie);
    if (key) r.set("Idempotency-Key", key);
    return r.send({ assetId: id });
  };

  beforeAll(async () => {
    await runMigrations(url!);
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    a = await user("lic-a");
    b = await user("lic-b");
    admin = await user("lic-admin", "admin");
    const c = await http().post("/v1/admin/assets").set("Cookie", admin.cookie).send({ title: `Licenciável zorbo${stamp}`, category: "natureza", width: 10, height: 10 });
    assetId = c.body.data.id;
    created.push(assetId);
    await http().put(`/v1/admin/assets/${assetId}/preview`).set("Cookie", admin.cookie).set("Content-Type", "image/png").send(PNG);
    await http().put(`/v1/admin/assets/${assetId}/original`).set("Cookie", admin.cookie).set("Content-Type", "image/png").send(PNG);
    await http().put(`/v1/admin/assets/${assetId}/rights`).set("Cookie", admin.cookie).send({ rightsHolder: "BIGhub", licenseBasis: "teste", verified: true });
    await http().post(`/v1/admin/assets/${assetId}/publish`).set("Cookie", admin.cookie).expect(204);
  });
  afterAll(async () => {
    // Concessões são append-only, logo os ativos licenciados ficam (despublicados). Remove só os sem concessões.
    const granted = new Set((await db.select({ id: licenseGrants.assetId }).from(licenseGrants).where(inArray(licenseGrants.assetId, created))).map((g) => g.id));
    const removable = created.filter((id) => !granted.has(id));
    if (removable.length) {
      await db.delete(rightsRecords).where(inArray(rightsRecords.assetId, removable));
      await db.delete(assets).where(inArray(assets.id, removable));
    }
    await app.close();
    await pool.end();
  });

  it("exige Idempotency-Key e valida o ativo", async () => {
    const noKey = await license(a, assetId);
    expect(noKey.status).toBe(400);
    expect(noKey.body.error.code).toBe("idempotency_key_required");
    expect((await license(a, "00000000-0000-4000-8000-000000000000", "key-unknown-1")).status).toBe(404);
    expect((await http().post(`/v1/organizations/${a.orgId}/licenses`).set("Cookie", a.cookie).set("Idempotency-Key", "key-bad-123").send({ assetId: "x" })).status).toBe(400);
  });

  it("licenciar é idempotente e regista a versão dos termos", async () => {
    const first = await license(a, assetId, "key-aaaa-0001");
    expect(first.status).toBe(201);
    const retry = await license(a, assetId, "key-aaaa-0001");
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(first.body.data.id);
    // outra chave, mesmo ativo: devolve a mesma licença (sem duplicar)
    const other = await license(a, assetId, "key-aaaa-0002");
    expect(other.body.data.id).toBe(first.body.data.id);
    // mesma chave para outro ativo = conflito
    const c2 = await http().post("/v1/admin/assets").set("Cookie", admin.cookie).send({ title: "Outro", category: "natureza", width: 1, height: 1 });
    created.push(c2.body.data.id);
    const conflict = await license(a, c2.body.data.id, "key-aaaa-0001");
    expect(conflict.status).toBe(409);
    // concorrência: 5 pedidos simultâneos, 1 concessão
    const [r1, r2, r3, r4, r5] = await Promise.all([1, 2, 3, 4, 5].map(() => license(b, assetId, "key-bbbb-conc")));
    const ids = new Set([r1, r2, r3, r4, r5].map((r) => r!.body.data.id));
    expect(ids.size).toBe(1);
    const list = await http().get(`/v1/organizations/${a.orgId}/licenses`).set("Cookie", a.cookie);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].terms_version).toBe("standard-1.0");
    expect(JSON.stringify(list.body)).not.toMatch(/originals\/|original_key/);
  });

  it("licenças são isoladas por organização", async () => {
    const listB = await http().get(`/v1/organizations/${b.orgId}/licenses`).set("Cookie", b.cookie);
    expect(listB.body.data).toHaveLength(1);
    expect((await http().get(`/v1/organizations/${a.orgId}/licenses`).set("Cookie", b.cookie)).status).toBe(404);
    const grantA = (await http().get(`/v1/organizations/${a.orgId}/licenses`).set("Cookie", a.cookie)).body.data[0].id;
    // B não consegue emitir download de uma licença de A, nem via a sua própria organização
    expect((await http().post(`/v1/organizations/${b.orgId}/licenses/${grantA}/download`).set("Cookie", b.cookie)).status).toBe(404);
  });

  it("download por URL assinado: funciona, expira, não pode ser forjado e fica registado", async () => {
    const grantId = (await http().get(`/v1/organizations/${a.orgId}/licenses`).set("Cookie", a.cookie)).body.data[0].id;
    const issued = await http().post(`/v1/organizations/${a.orgId}/licenses/${grantId}/download`).set("Cookie", a.cookie);
    expect(issued.status).toBe(200);
    const dl = await http().get(issued.body.data.url);
    expect(dl.status).toBe(200);
    expect(dl.headers["content-disposition"]).toMatch(/attachment; filename="licenciavel-zorbo\d+\.png"/);
    expect(Buffer.compare(dl.body as Buffer, PNG)).toBe(0);
    const events = await db.select().from(downloadEvents).where(eq(downloadEvents.grantId, grantId));
    expect(events).toHaveLength(1);

    const [payload] = issued.body.data.url.split("/").pop()!.split(".");
    expect((await http().get(`/v1/downloads/${payload}.forjado`)).status).toBe(404);
    expect((await http().get("/v1/downloads/lixo")).status).toBe(404);
    const expired = signDownload({ g: grantId, o: a.orgId, u: a.userId }, Date.now() - 10 * 60 * 1000);
    expect((await http().get(`/v1/downloads/${expired.token}`)).status).toBe(404);
    // token de A não serve para outra organização (claims assinados)
    const swapped = signDownload({ g: grantId, o: b.orgId, u: b.userId });
    expect((await http().get(`/v1/downloads/${swapped.token}`)).status).toBe(404);
  });

  it("despublicar bloqueia novas licenças mas não revoga as concedidas", async () => {
    await http().post(`/v1/admin/assets/${assetId}/unpublish`).set("Cookie", admin.cookie).expect(204);
    const fresh = await user("lic-c");
    expect((await license(fresh, assetId, "key-cccc-0001")).status).toBe(404);
    const grantId = (await http().get(`/v1/organizations/${a.orgId}/licenses`).set("Cookie", a.cookie)).body.data[0].id;
    const issued = await http().post(`/v1/organizations/${a.orgId}/licenses/${grantId}/download`).set("Cookie", a.cookie);
    expect(issued.status).toBe(200);
    expect((await http().get(issued.body.data.url)).status).toBe(200);
  });

  it("quota do plano: gratuito = 3 licenças; assinatura ativa amplia; expirada volta ao gratuito", async () => {
    const q = await user("lic-q");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const c = await http().post("/v1/admin/assets").set("Cookie", admin.cookie).send({ title: `Quota ${i} zorbo${stamp}`, category: "natureza", width: 1, height: 1 });
      const id = c.body.data.id as string;
      created.push(id);
      ids.push(id);
      await http().put(`/v1/admin/assets/${id}/preview`).set("Cookie", admin.cookie).set("Content-Type", "image/png").send(PNG);
      await http().put(`/v1/admin/assets/${id}/original`).set("Cookie", admin.cookie).set("Content-Type", "image/png").send(PNG);
      await http().put(`/v1/admin/assets/${id}/rights`).set("Cookie", admin.cookie).send({ rightsHolder: "BIGhub", licenseBasis: "teste", verified: true });
      await http().post(`/v1/admin/assets/${id}/publish`).set("Cookie", admin.cookie).expect(204);
    }
    for (let i = 0; i < 3; i++) expect((await license(q, ids[i]!, `key-quota-${i}-aa`)).status).toBe(201);
    const over = await license(q, ids[3]!, "key-quota-3-aa");
    expect(over.status).toBe(402);
    expect(over.body.error.code).toBe("download_quota_exceeded");
    // reaproveitar uma licença existente não consome quota
    expect((await license(q, ids[0]!, "key-quota-0-bb")).status).toBe(200);

    const now = new Date();
    const sub = { organizationId: q.orgId, planCode: "pro", status: "active" as const, interval: "month" as const, currentPeriodStart: new Date(now.getTime() - 86_400_000), currentPeriodEnd: new Date(now.getTime() + 29 * 86_400_000) };
    await db.insert(subscriptions).values(sub);
    expect((await license(q, ids[3]!, "key-quota-3-cc")).status).toBe(201);

    // assinatura expirada/cancelada: volta ao plano gratuito (já usou 4 ≥ 3)
    await db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.organizationId, q.orgId));
    expect((await license(q, ids[4]!, "key-quota-4-dd")).status).toBe(402);
    // dados já adquiridos continuam acessíveis
    const grantId = (await http().get(`/v1/organizations/${q.orgId}/licenses`).set("Cookie", q.cookie)).body.data[0].id;
    expect((await http().post(`/v1/organizations/${q.orgId}/licenses/${grantId}/download`).set("Cookie", q.cookie)).status).toBe(200);
    await db.delete(subscriptions).where(eq(subscriptions.organizationId, q.orgId));
  });

  it("concessões e downloads são append-only", async () => {
    await expect(db.delete(licenseGrants)).rejects.toThrow();
    await expect(db.update(downloadEvents).set({ userId: a.userId })).rejects.toThrow();
  });
});
