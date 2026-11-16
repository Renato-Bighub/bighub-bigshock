import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "1000";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { createDb, runMigrations, subscriptions } from "@bigstock/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure.js";
import { buildOpenApi } from "./openapi.js";

const url = process.env.DATABASE_URL;

describe("OpenAPI", () => {
  it("é um documento 3.1 com segurança Bearer e `request_id`/paginação documentados", () => {
    const doc = buildOpenApi() as { openapi: string; paths: Record<string, Record<string, { "x-required-scope"?: string; security?: unknown }>>; components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> } };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.components.securitySchemes.bearerAuth).toBeTruthy();
    expect(Object.keys(doc.components.schemas)).toEqual(expect.arrayContaining(["Error", "Pagination", "Asset", "AiJob"]));
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [m, o] of Object.entries(methods)) {
        expect(o["x-required-scope"], `${m} ${path}`).toBeTruthy();
      }
    }
    // operações pagas documentam Idempotency-Key
    const paid = [doc.paths["/v1/licenses"]!.post, doc.paths["/v1/ai/jobs"]!.post] as unknown as { parameters: { name: string }[] }[];
    for (const p of paid) expect(p.parameters.map((x) => x.name)).toContain("Idempotency-Key");
  });
});

describe.skipIf(!url)("OpenAPI vs rotas reais", () => {
  let app: NestExpressApplication;
  const { db, pool } = createDb(url ?? "");

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

  it("serve /v1/openapi.json sem autenticação", async () => {
    const res = await request(app.getHttpServer()).get("/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
  });

  it("todo o caminho documentado existe na API (sem deriva entre documentação e implementação)", async () => {
    const http = () => request(app.getHttpServer());
    const reg = await http().post("/v1/auth/register").send({ email: `oas-${Date.now()}@example.com`, password: "correct horse battery", organizationName: "OAS" });
    const cookie = String(reg.headers["set-cookie"]).split(";")[0]!;
    const me = await http().get("/v1/auth/me").set("Cookie", cookie);
    const orgId = me.body.organizations[0].id as string;
    await db.insert(subscriptions).values({ organizationId: orgId, planCode: "business", status: "active", interval: "month", currentPeriodStart: new Date(Date.now() - 1000), currentPeriodEnd: new Date(Date.now() + 86_400_000) });
    const k = (await http().post(`/v1/organizations/${orgId}/api-keys`).set("Cookie", cookie).send({ name: "oas", scopes: ["assets:read", "licenses:read", "licenses:write", "credits:read", "ai:read", "ai:generate", "usage:read"] })).body.data.key as string;
    const doc = buildOpenApi() as { paths: Record<string, Record<string, unknown>> };
    const uuid = "00000000-0000-4000-8000-000000000000";
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const method of Object.keys(methods)) {
        const concrete = path.replace(/\{[^}]+\}/g, uuid);
        const res = await (http() as unknown as Record<string, (u: string) => request.Test>)[method]!(concrete).set("Authorization", `Bearer ${k}`).send({});
        // Rota inexistente do Nest devolve 404 sem `error.code`; as nossas respostas 404 têm sempre `error.code`.
        const unmatched = res.status === 404 && !res.body?.error?.code;
        expect(unmatched, `${method.toUpperCase()} ${path} não existe na API`).toBe(false);
      }
    }
  });
});
