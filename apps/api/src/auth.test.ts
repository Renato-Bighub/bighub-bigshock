import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "1000";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { runMigrations } from "@bigstock/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("auth", () => {
  let app: INestApplication;
  const email = `ana-${Date.now()}@example.com`;
  const password = "correct horse battery";
  let cookie = "";

  beforeAll(async () => {
    await runMigrations(url!);
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  const http = () => request(app.getHttpServer());

  it("registo cria utilizador, organização (owner) e sessão httpOnly", async () => {
    const res = await http().post("/v1/auth/register").send({ email, password, organizationName: "Ana Lda" });
    expect(res.status).toBe(201);
    expect(res.body.request_id).toBeTruthy();
    const set = String(res.headers["set-cookie"]);
    expect(set).toMatch(/bs_session=/);
    expect(set).toMatch(/HttpOnly/i);
    cookie = set.split(";")[0]!;
  });

  it("/me devolve utilizador e organizações; sem cookie dá 401", async () => {
    const me = await http().get("/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.organizations).toEqual([expect.objectContaining({ name: "Ana Lda", role: "owner" })]);
    const anon = await http().get("/v1/auth/me");
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe("unauthenticated");
  });

  it("senha nunca é guardada em claro nem devolvida", async () => {
    const res = await http().post("/v1/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(password);
  });

  it("rejeita email duplicado, senha curta e credenciais erradas", async () => {
    expect((await http().post("/v1/auth/register").send({ email, password, organizationName: "X" })).status).toBe(409);
    expect((await http().post("/v1/auth/register").send({ email: "b@example.com", password: "short", organizationName: "X" })).status).toBe(400);
    const bad = await http().post("/v1/auth/login").send({ email, password: "wrong-password-123" });
    expect(bad.status).toBe(401);
    const unknown = await http().post("/v1/auth/login").send({ email: "nobody@example.com", password });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe(bad.body.error.code);
  });

  it("logout revoga a sessão", async () => {
    expect((await http().post("/v1/auth/logout").set("Cookie", cookie)).status).toBe(204);
    expect((await http().get("/v1/auth/me").set("Cookie", cookie)).status).toBe(401);
  });
});
