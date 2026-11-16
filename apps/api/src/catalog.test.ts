import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "1000";
process.env.STORAGE_DIR = `${process.env.TMPDIR ?? "/tmp"}/bigstock-test-${Date.now()}`;
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { assets, createDb, eq, inArray, rightsRecords, runMigrations, users } from "@bigstock/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure.js";

const url = process.env.DATABASE_URL;
const stamp = Date.now();
const password = "correct horse battery";
// Palavra única por execução: os testes não colidem com dados já existentes (ex.: seed de desenvolvimento).
const u = `zorbo${stamp}`;
// PNG 1x1 válido
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe.skipIf(!url)("catálogo e regras editoriais", () => {
  let app: NestExpressApplication;
  const { db, pool } = createDb(url ?? "");
  const http = () => request(app.getHttpServer());

  async function user(name: string, platformRole?: "editor" | "admin") {
    const email = `${name}-${stamp}@example.com`;
    const res = await http().post("/v1/auth/register").send({ email, password, organizationName: `${name} Lda` });
    expect(res.status).toBe(201);
    if (platformRole) await db.update(users).set({ platformRole }).where(eq(users.email, email));
    return String(res.headers["set-cookie"]).split(";")[0]!;
  }
  let customer = "";
  let editor = "";
  let admin = "";
  const created: string[] = [];

  async function newAsset(title: string, over: Record<string, unknown> = {}) {
    const res = await http().post("/v1/admin/assets").set("Cookie", editor).send({
      title, kind: "photo", category: "natureza", tags: ["vinha", "uvas"], width: 2400, height: 1600, ...over,
    });
    expect(res.status).toBe(201);
    created.push(res.body.data.id as string);
    return res.body.data.id as string;
  }
  const rights = (id: string, cookie: string, verified: boolean) =>
    http().put(`/v1/admin/assets/${id}/rights`).set("Cookie", cookie).send({ rightsHolder: "BIGhub", licenseBasis: "Contrato de autor", verified });
  const preview = (id: string) => http().put(`/v1/admin/assets/${id}/preview`).set("Cookie", editor).set("Content-Type", "image/png").send(PNG);

  beforeAll(async () => {
    await runMigrations(url!);
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    customer = await user("cliente");
    editor = await user("editor", "editor");
    admin = await user("admin", "admin");
  });
  afterAll(async () => {
    // Não deixa ativos de teste (com previews fora do armazenamento real) no catálogo de desenvolvimento.
    if (created.length) {
      await db.delete(rightsRecords).where(inArray(rightsRecords.assetId, created));
      await db.delete(assets).where(inArray(assets.id, created));
    }
    await app.close();
    await pool.end();
  });

  it("área editorial exige papel de plataforma", async () => {
    expect((await http().get("/v1/admin/assets").set("Cookie", customer)).status).toBe(403);
    expect((await http().get("/v1/admin/assets")).status).toBe(401);
  });

  it("ativo sem direitos verificados nunca é publicado (serviço e base de dados)", async () => {
    const id = await newAsset(`Sem direitos ${u}`);
    expect((await preview(id)).status).toBe(204);
    const noRights = await http().post(`/v1/admin/assets/${id}/publish`).set("Cookie", editor);
    expect(noRights.status).toBe(409);
    expect(noRights.body.error.code).toBe("rights_not_verified");
    expect((await rights(id, editor, false)).status).toBe(204);
    expect((await http().post(`/v1/admin/assets/${id}/publish`).set("Cookie", editor)).status).toBe(409);
    // editor não verifica direitos
    expect((await rights(id, editor, true)).status).toBe(400);
    // segunda barreira: o trigger bloqueia mesmo contornando a API
    await expect(db.update(assets).set({ status: "published" }).where(eq(assets.id, id))).rejects.toThrow();
    const status = await db.select({ s: assets.status }).from(assets).where(eq(assets.id, id));
    expect(status[0]!.s).toBe("draft");
  });

  it("publica com direitos verificados; pesquisa PT/EN, categoria, preview e privacidade", async () => {
    const vine = await newAsset(`Vindima ${u}`, { description: "Uvas numa vinha portuguesa", tags: [u, "uvas"] });
    const food = await newAsset(`Massa ${u}`, { category: "alimentacao", tags: [u, "massa"] });
    for (const id of [vine, food]) {
      await preview(id);
      expect((await rights(id, admin, true)).status).toBe(204);
      expect((await http().post(`/v1/admin/assets/${id}/publish`).set("Cookie", editor)).status).toBe(204);
    }
    const draft = await newAsset("Rascunho invisível", { tags: [u] });

    const pt = await http().get("/v1/assets").query({ q: `${u}` }).set("Cookie", customer);
    expect(pt.status).toBe(200);
    expect(pt.body.data.map((a: { id: string }) => a.id).sort()).toEqual([vine, food].sort());
    const en = await http().get("/v1/assets").query({ q: `Vindima ${u}` }).set("Cookie", customer);
    expect(en.body.data.map((a: { id: string }) => a.id)).toContain(vine);
    const stem = await http().get("/v1/assets").query({ q: "uva" }).set("Cookie", customer);
    expect(stem.body.data.map((a: { id: string }) => a.id)).toContain(vine);
    const cat = await http().get("/v1/assets").query({ category: "alimentacao", q: u }).set("Cookie", customer);
    expect(cat.body.data.map((a: { id: string }) => a.id)).toEqual([food]);
    const all = await http().get("/v1/assets").set("Cookie", customer);
    expect(all.body.data.map((a: { id: string }) => a.id)).not.toContain(draft);
    expect((await http().get(`/v1/assets/${draft}`).set("Cookie", customer)).status).toBe(404);

    // nada interno é exposto
    expect(JSON.stringify(all.body)).not.toMatch(/previews\/|storage|preview_key|rights/i);
    const img = await http().get(`/v1/assets/${vine}/preview`).set("Cookie", customer);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toMatch(/image\/png/);
    expect((await http().get("/v1/assets")).status).toBe(401);

    // paginação por cursor
    const p1 = await http().get("/v1/assets").query({ limit: 1 }).set("Cookie", customer);
    expect(p1.body.pagination.has_more).toBe(true);
    const p2 = await http().get("/v1/assets").query({ limit: 1, cursor: p1.body.pagination.next_cursor }).set("Cookie", customer);
    expect(p2.body.data[0].id).not.toBe(p1.body.data[0].id);
    expect((await http().get("/v1/assets").query({ cursor: "###" }).set("Cookie", customer)).status).toBe(400);

    // despublicar tira do catálogo
    await http().post(`/v1/admin/assets/${vine}/unpublish`).set("Cookie", editor).expect(204);
    expect((await http().get(`/v1/assets/${vine}`).set("Cookie", customer)).status).toBe(404);
  });

  it("rejeita preview que não é imagem real e categoria desconhecida", async () => {
    const id = await newAsset("Ficheiro falso");
    const bad = await http().put(`/v1/admin/assets/${id}/preview`).set("Cookie", editor).set("Content-Type", "image/png").send(Buffer.from("not an image at all, just text"));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("invalid_image");
    const cat = await http().post("/v1/admin/assets").set("Cookie", editor).send({ title: "x", category: "nao-existe", width: 1, height: 1 });
    expect(cat.status).toBe(400);
  });

  it("retirar a verificação dos direitos despublica o ativo", async () => {
    const id = await newAsset("Direitos revogados");
    await preview(id);
    await rights(id, admin, true);
    await http().post(`/v1/admin/assets/${id}/publish`).set("Cookie", editor).expect(204);
    await rights(id, editor, false);
    expect((await http().get(`/v1/assets/${id}`).set("Cookie", customer)).status).toBe(404);
  });
});
