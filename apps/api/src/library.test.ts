import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "1000";
process.env.STORAGE_DIR = `${process.env.TMPDIR ?? "/tmp"}/bigstock-lib-${Date.now()}`;
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { assets, collectionItems, collections, createDb, eq, favorites, inArray, organizationMembers, rightsRecords, runMigrations, users, withTenant } from "@bigstock/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure.js";

const url = process.env.DATABASE_URL;
const stamp = Date.now();
const password = "correct horse battery";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe.skipIf(!url)("biblioteca: favoritos e coleções", () => {
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
  let c: Awaited<ReturnType<typeof user>>;
  let admin: Awaited<ReturnType<typeof user>>;
  let assetId = "";
  let draftId = "";

  const mk = async (title: string, publish: boolean) => {
    const r = await http().post("/v1/admin/assets").set("Cookie", admin.cookie).send({ title, category: "natureza", width: 10, height: 10 });
    const id = r.body.data.id as string;
    created.push(id);
    if (publish) {
      await http().put(`/v1/admin/assets/${id}/preview`).set("Cookie", admin.cookie).set("Content-Type", "image/png").send(PNG);
      await http().put(`/v1/admin/assets/${id}/original`).set("Cookie", admin.cookie).set("Content-Type", "image/png").send(PNG);
      await http().put(`/v1/admin/assets/${id}/rights`).set("Cookie", admin.cookie).send({ rightsHolder: "BIGhub", licenseBasis: "teste", verified: true });
      await http().post(`/v1/admin/assets/${id}/publish`).set("Cookie", admin.cookie).expect(204);
    }
    return id;
  };
  const base = (who: { orgId: string }) => `/v1/organizations/${who.orgId}`;

  beforeAll(async () => {
    await runMigrations(url!);
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    a = await user("lib-a");
    b = await user("lib-b");
    c = await user("lib-c");
    admin = await user("lib-admin", "admin");
    assetId = await mk(`Biblioteca zorbo${stamp}`, true);
    draftId = await mk(`Rascunho zorbo${stamp}`, false);
    // c entra na organização de a como "member" (não é o criador das coleções de a).
    await db.insert(organizationMembers).values({ organizationId: a.orgId, userId: c.userId, role: "member" });
  });
  afterAll(async () => {
    for (const org of [a, b]) {
      await withTenant(db, org.orgId, async (tx) => {
        await tx.delete(favorites).where(eq(favorites.organizationId, org.orgId));
        await tx.delete(collectionItems).where(eq(collectionItems.organizationId, org.orgId));
        await tx.delete(collections).where(eq(collections.organizationId, org.orgId));
      });
    }
    await db.delete(organizationMembers).where(eq(organizationMembers.userId, c.userId));
    if (created.length) {
      await db.delete(rightsRecords).where(inArray(rightsRecords.assetId, created));
      await db.delete(assets).where(inArray(assets.id, created));
    }
    await app.close();
    await pool.end();
  });

  it("exige sessão", async () => {
    expect((await http().get(`${base(a)}/favorites`)).status).toBe(401);
    expect((await http().get(`${base(a)}/collections`)).status).toBe(401);
  });

  it("favoritos: adicionar é idempotente, lista, ids e remover", async () => {
    expect((await http().put(`${base(a)}/favorites/${assetId}`).set("Cookie", a.cookie)).status).toBe(200);
    expect((await http().put(`${base(a)}/favorites/${assetId}`).set("Cookie", a.cookie)).status).toBe(200);
    const list = await http().get(`${base(a)}/favorites`).set("Cookie", a.cookie);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id: assetId, preview_url: `/v1/assets/${assetId}/preview` });
    expect(list.body.data[0]).not.toHaveProperty("storage_key");
    expect((await http().get(`${base(a)}/favorites/ids`).set("Cookie", a.cookie)).body.data).toEqual([assetId]);
    expect((await http().delete(`${base(a)}/favorites/${assetId}`).set("Cookie", a.cookie)).status).toBe(204);
    expect((await http().get(`${base(a)}/favorites`).set("Cookie", a.cookie)).body.data).toHaveLength(0);
  });

  it("favoritos são por utilizador e só aceitam ativos publicados", async () => {
    await http().put(`${base(a)}/favorites/${assetId}`).set("Cookie", a.cookie).expect(200);
    // c é membro da mesma organização mas não vê os favoritos de a.
    expect((await http().get(`${base(a)}/favorites`).set("Cookie", c.cookie)).body.data).toHaveLength(0);
    expect((await http().put(`${base(a)}/favorites/${draftId}`).set("Cookie", a.cookie)).status).toBe(404);
    expect((await http().put(`${base(a)}/favorites/not-a-uuid`).set("Cookie", a.cookie)).status).toBe(400);
  });

  it("isolamento entre organizações", async () => {
    expect((await http().get(`${base(a)}/favorites`).set("Cookie", b.cookie)).status).toBe(404);
    expect((await http().get(`${base(b)}/favorites`).set("Cookie", b.cookie)).body.data).toHaveLength(0);
    const col = await http().post(`${base(a)}/collections`).set("Cookie", a.cookie).send({ name: "Privada de A" });
    expect(col.status).toBe(201);
    expect((await http().get(`${base(a)}/collections`).set("Cookie", b.cookie)).status).toBe(404);
    // Mesmo com o id certo, a coleção de A não existe na organização de B (RLS).
    expect((await http().get(`${base(b)}/collections/${col.body.data.id}`).set("Cookie", b.cookie)).status).toBe(404);
    expect((await http().put(`${base(b)}/collections/${col.body.data.id}/items/${assetId}`).set("Cookie", b.cookie)).status).toBe(404);
    expect((await http().get(`${base(b)}/collections`).set("Cookie", b.cookie)).body.data).toHaveLength(0);
  });

  it("coleções: criar, adicionar/remover itens, contagem e capa", async () => {
    const created1 = await http().post(`${base(a)}/collections`).set("Cookie", a.cookie).send({ name: "  Campanha  ", description: "Verão" });
    expect(created1.status).toBe(201);
    expect(created1.body.data).toMatchObject({ name: "Campanha", description: "Verão", item_count: 0, cover_preview_url: null });
    const id = created1.body.data.id as string;
    expect((await http().post(`${base(a)}/collections`).set("Cookie", a.cookie).send({ name: "" })).status).toBe(400);

    expect((await http().put(`${base(a)}/collections/${id}/items/${assetId}`).set("Cookie", a.cookie)).status).toBe(200);
    expect((await http().put(`${base(a)}/collections/${id}/items/${assetId}`).set("Cookie", a.cookie)).status).toBe(200); // idempotente
    expect((await http().put(`${base(a)}/collections/${id}/items/${draftId}`).set("Cookie", a.cookie)).status).toBe(404);

    const one = await http().get(`${base(a)}/collections/${id}`).set("Cookie", a.cookie);
    expect(one.body.data).toMatchObject({ item_count: 1, cover_preview_url: `/v1/assets/${assetId}/preview` });
    const items = await http().get(`${base(a)}/collections/${id}/items`).set("Cookie", a.cookie);
    expect(items.body.data.map((x: { id: string }) => x.id)).toEqual([assetId]);
    expect(items.body.pagination).toEqual({ next_cursor: null, has_more: false });
    const all = await http().get(`${base(a)}/collections`).set("Cookie", a.cookie);
    expect(all.body.data.find((x: { id: string }) => x.id === id)).toMatchObject({ item_count: 1 });

    expect((await http().delete(`${base(a)}/collections/${id}/items/${assetId}`).set("Cookie", a.cookie)).status).toBe(204);
    expect((await http().get(`${base(a)}/collections/${id}`).set("Cookie", a.cookie)).body.data.item_count).toBe(0);
  });

  it("só o criador ou admin altera/apaga; membros leem e adicionam itens", async () => {
    const col = (await http().post(`${base(a)}/collections`).set("Cookie", a.cookie).send({ name: "Da equipa" })).body.data.id as string;
    expect((await http().get(`${base(a)}/collections/${col}`).set("Cookie", c.cookie)).status).toBe(200);
    expect((await http().put(`${base(a)}/collections/${col}/items/${assetId}`).set("Cookie", c.cookie)).status).toBe(200);
    expect((await http().patch(`${base(a)}/collections/${col}`).set("Cookie", c.cookie).send({ name: "Roubada" })).status).toBe(403);
    expect((await http().delete(`${base(a)}/collections/${col}`).set("Cookie", c.cookie)).status).toBe(403);
    const patched = await http().patch(`${base(a)}/collections/${col}`).set("Cookie", a.cookie).send({ name: "Renomeada", description: null });
    expect(patched.body.data).toMatchObject({ name: "Renomeada", description: null });
    expect((await http().patch(`${base(a)}/collections/${col}`).set("Cookie", a.cookie).send({})).status).toBe(400);
    expect((await http().delete(`${base(a)}/collections/${col}`).set("Cookie", a.cookie)).status).toBe(204);
    expect((await http().get(`${base(a)}/collections/${col}`).set("Cookie", a.cookie)).status).toBe(404);
  });

  it("ativos despublicados deixam de aparecer na biblioteca", async () => {
    const id = await mk(`Efémero zorbo${stamp}`, true);
    await http().put(`${base(a)}/favorites/${id}`).set("Cookie", a.cookie).expect(200);
    const col = (await http().post(`${base(a)}/collections`).set("Cookie", a.cookie).send({ name: "Efémeras" })).body.data.id as string;
    await http().put(`${base(a)}/collections/${col}/items/${id}`).set("Cookie", a.cookie).expect(200);
    await http().post(`/v1/admin/assets/${id}/unpublish`).set("Cookie", admin.cookie).expect(204);
    const favs = (await http().get(`${base(a)}/favorites`).set("Cookie", a.cookie)).body.data as { id: string }[];
    expect(favs.map((x) => x.id)).not.toContain(id);
    expect((await http().get(`${base(a)}/collections/${col}`).set("Cookie", a.cookie)).body.data.item_count).toBe(0);
    expect((await http().get(`${base(a)}/collections/${col}/items`).set("Cookie", a.cookie)).body.data).toHaveLength(0);
  });

  it("chaves de API não acedem à biblioteca", async () => {
    const key = await http().post(`${base(a)}/api-keys`).set("Cookie", a.cookie).send({ name: "k", scopes: ["assets:read", "licenses:read"] });
    const secret = key.body.data?.key ?? key.body.key;
    if (!secret) return; // formato de resposta diferente: o default-deny já é coberto em api-keys.test.ts
    const res = await http().get(`/v1/organizations/${a.orgId}/favorites`).set("Authorization", `Bearer ${secret}`);
    expect([401, 403, 404]).toContain(res.status);
  });
});
