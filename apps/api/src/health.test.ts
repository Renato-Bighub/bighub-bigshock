import "reflect-metadata";
process.env.DATABASE_URL ??= "postgres://localhost:5432/unused";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";

describe("GET /v1/health", () => {
  it("devolve status ok com request_id propagado", async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = mod.createNestApplication();
    await app.init();
    const res = await request(app.getHttpServer()).get("/v1/health").set("x-request-id", "req-123");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", request_id: "req-123" });
    await app.close();
  });
});
