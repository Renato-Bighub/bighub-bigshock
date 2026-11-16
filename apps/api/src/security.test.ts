import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "100000";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { authAttempts, createDb, eq, runMigrations } from "@bigstock/database";
import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure.js";

const url = process.env.DATABASE_URL;
const stamp = Date.now();

describe.skipIf(!url)("segurança", () => {
  let app: NestExpressApplication;
  const { db, pool } = createDb(url ?? "");
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    await runMigrations(url!);
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("cabeçalhos de segurança presentes e sem X-Powered-By nem CORS permissivo", async () => {
    const res = await http().get("/v1/health").set("Origin", "https://evil.example");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeTruthy();
    expect(res.headers["referrer-policy"]).toBeTruthy();
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("cookie de sessão: HttpOnly, SameSite=Lax e Path=/", async () => {
    const res = await http().post("/v1/auth/register").send({ email: `sec-${stamp}@example.com`, password: "correct horse battery", organizationName: "Sec" });
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it("força bruta: 10 falhas por e-mail bloqueiam o login (429), mesmo com a senha certa", async () => {
    const email = `brute-${stamp}@example.com`;
    await http().post("/v1/auth/register").send({ email, password: "correct horse battery", organizationName: "Brute" });
    for (let i = 0; i < 10; i++) {
      expect((await http().post("/v1/auth/login").send({ email, password: `wrong-password-${i}` })).status).toBe(401);
    }
    const locked = await http().post("/v1/auth/login").send({ email, password: "correct horse battery" });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("too_many_attempts");
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);
    // só se guarda o hash do e-mail, nunca o e-mail em claro
    const rows = await db.select().from(authAttempts).where(eq(authAttempts.emailHash, createHash("sha256").update(email).digest("hex")));
    expect(rows.length).toBe(10);
    expect(JSON.stringify(rows)).not.toContain(email);
    // outro utilizador não é afetado
    const other = `calm-${stamp}@example.com`;
    await http().post("/v1/auth/register").send({ email: other, password: "correct horse battery", organizationName: "Calm" });
    expect((await http().post("/v1/auth/login").send({ email: other, password: "correct horse battery" })).status).toBe(200);
  });

  it("erros internos não vazam detalhes e a documentação de erro tem request_id", async () => {
    const res = await http().get("/v1/assets/not-a-uuid");
    expect(res.body.request_id ?? res.body.error?.request_id).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|postgres/i);
  });
});
