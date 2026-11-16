import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "1000";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createDb, creditEntries, runMigrations } from "@bigstock/database";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";
import { CreditsService } from "./billing/credits.service.js";
import { configureApp } from "./configure.js";

const url = process.env.DATABASE_URL;
const stamp = Date.now();
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

describe.skipIf(!url)("carteira de créditos", () => {
  let app: NestExpressApplication;
  let credits: CreditsService;
  const { db, pool } = createDb(url ?? "");
  let n = 0;

  async function newOrg() {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email: `cred-${stamp}-${++n}@example.com`, password: "correct horse battery", organizationName: "Cred" });
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
    const me = await request(app.getHttpServer()).get("/v1/auth/me").set("Cookie", cookie);
    return { orgId: me.body.organizations[0].id as string, cookie };
  }

  beforeAll(async () => {
    await runMigrations(url!);
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    credits = app.get(CreditsService);
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("concessão é idempotente e o saldo é a soma do livro", async () => {
    const { orgId } = await newOrg();
    const g = { balanceType: "purchased" as const, amount: 100, expiresAt: days(30), idempotencyKey: "grant-1" };
    expect((await credits.grant(orgId, g)).granted).toBe(true);
    expect((await credits.grant(orgId, g)).granted).toBe(false);
    expect(await credits.balance(orgId)).toBe(100);
  });

  it("reserva, consumo e libertação seguem a máquina de estados e são idempotentes", async () => {
    const { orgId } = await newOrg();
    await credits.grant(orgId, { balanceType: "subscription", amount: 100, expiresAt: days(30), idempotencyKey: "g" });
    const r1 = randomUUID();
    expect((await credits.reserve(orgId, r1, 40)).created).toBe(true);
    expect((await credits.reserve(orgId, r1, 40)).created).toBe(false); // retry não duplica
    expect(await credits.balance(orgId)).toBe(60);
    expect((await credits.release(orgId, r1)).changed).toBe(true);
    expect((await credits.release(orgId, r1)).changed).toBe(false);
    expect(await credits.balance(orgId)).toBe(100);

    const r2 = randomUUID();
    await credits.reserve(orgId, r2, 30);
    expect((await credits.consume(orgId, r2)).changed).toBe(true);
    expect((await credits.release(orgId, r2)).changed).toBe(false); // depois de consumido não devolve
    expect(await credits.balance(orgId)).toBe(70);
  });

  it("nunca fica negativo: reservas concorrentes respeitam o saldo", async () => {
    const { orgId } = await newOrg();
    await credits.grant(orgId, { balanceType: "purchased", amount: 100, expiresAt: null, idempotencyKey: "g" });
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => credits.reserve(orgId, randomUUID(), 10)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toBe(10);
    expect(failed).toHaveLength(10);
    expect(failed[0]!.reason.getStatus()).toBe(402);
    expect(failed[0]!.reason.getResponse().code).toBe("insufficient_credits");
    expect(await credits.balance(orgId)).toBe(0);
  });

  it("consome por prioridade de tipo e validade; ignora créditos expirados", async () => {
    const { orgId } = await newOrg();
    await credits.grant(orgId, { balanceType: "purchased", amount: 50, expiresAt: days(5), idempotencyKey: "p" });
    await credits.grant(orgId, { balanceType: "subscription", amount: 50, expiresAt: days(20), idempotencyKey: "s" });
    await credits.grant(orgId, { balanceType: "promotional", amount: 10, expiresAt: days(90), idempotencyKey: "pr" });
    await db.insert(creditEntries).values({ organizationId: orgId, entryType: "grant", balanceType: "subscription", amount: 999, expiresAt: days(-1), idempotencyKey: "old" });
    expect(await credits.balance(orgId)).toBe(110);
    await credits.reserve(orgId, randomUUID(), 55);
    const ledger = await credits.ledger(orgId, 50);
    const reserves = ledger.data.filter((e) => e.type === "reserve");
    expect(reserves.map((e) => [e.balance_type, e.amount]).sort()).toEqual([["promotional", -10], ["subscription", -45]].sort());
  });

  it("livro paginado e isolado por organização", async () => {
    const a = await newOrg();
    const b = await newOrg();
    await credits.grant(a.orgId, { balanceType: "purchased", amount: 5, expiresAt: null, idempotencyKey: "x" });
    expect((await credits.ledger(b.orgId, 10)).data).toHaveLength(0);
    const res = await request(app.getHttpServer()).get(`/v1/organizations/${a.orgId}/credits`).set("Cookie", a.cookie);
    expect(res.body.data.available).toBe(5);
  });
});
