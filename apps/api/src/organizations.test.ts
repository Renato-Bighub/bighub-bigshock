import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "1000";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { runMigrations } from "@bigstock/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";

const url = process.env.DATABASE_URL;
const stamp = Date.now();
const password = "correct horse battery";

describe.skipIf(!url)("organizações, permissões e convites", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  async function register(name: string) {
    const email = `${name}-${stamp}@example.com`;
    const res = await http().post("/v1/auth/register").send({ email, password, organizationName: `${name} Lda` });
    expect(res.status).toBe(201);
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
    const me = await http().get("/v1/auth/me").set("Cookie", cookie);
    return { email, cookie, userId: me.body.user.id as string, orgId: me.body.organizations[0].id as string };
  }

  let owner: Awaited<ReturnType<typeof register>>;
  let other: Awaited<ReturnType<typeof register>>;
  let bob: Awaited<ReturnType<typeof register>>;
  let carol: Awaited<ReturnType<typeof register>>;

  beforeAll(async () => {
    await runMigrations(url!);
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    owner = await register("owner");
    other = await register("other");
    bob = await register("bob");
    carol = await register("carol");
  });
  afterAll(async () => {
    await app.close();
  });

  const invite = (orgId: string, cookie: string, email: string, role: string) =>
    http().post(`/v1/organizations/${orgId}/invitations`).set("Cookie", cookie).send({ email, role });

  it("não-membros recebem 404 em organizações alheias", async () => {
    expect((await http().get(`/v1/organizations/${owner.orgId}/members`).set("Cookie", other.cookie)).status).toBe(404);
    expect((await invite(owner.orgId, other.cookie, "x@example.com", "member")).status).toBe(404);
  });

  it("fluxo: convidar, listar, aceitar e ver membro", async () => {
    const inv = await invite(owner.orgId, owner.cookie, bob.email, "member");
    expect(inv.status).toBe(201);
    const token = inv.body.data.token as string;
    expect((await http().get(`/v1/organizations/${owner.orgId}/invitations`).set("Cookie", owner.cookie)).body.data).toHaveLength(1);

    // outro utilizador, mesmo com o token, não consegue aceitar
    expect((await http().post("/v1/invitations/accept").set("Cookie", carol.cookie).send({ token })).status).toBe(400);
    const ok = await http().post("/v1/invitations/accept").set("Cookie", bob.cookie).send({ token });
    expect(ok.status).toBe(200);
    expect(ok.body.data.role).toBe("member");
    // token de uso único
    expect((await http().post("/v1/invitations/accept").set("Cookie", bob.cookie).send({ token })).status).toBe(400);

    const members = await http().get(`/v1/organizations/${owner.orgId}/members`).set("Cookie", bob.cookie);
    expect(members.status).toBe(200);
    expect(members.body.data.map((m: { email: string }) => m.email).sort()).toEqual([bob.email, owner.email].sort());
    const me = await http().get("/v1/auth/me").set("Cookie", bob.cookie);
    expect(me.body.organizations).toHaveLength(2);
  });

  it("member não convida nem remove (403)", async () => {
    expect((await invite(owner.orgId, bob.cookie, "y@example.com", "member")).status).toBe(403);
    expect((await http().delete(`/v1/organizations/${owner.orgId}/members/${owner.userId}`).set("Cookie", bob.cookie)).status).toBe(403);
  });

  it("admin só atribui member/billing; ninguém convida owner", async () => {
    await http().patch(`/v1/organizations/${owner.orgId}/members/${bob.userId}`).set("Cookie", owner.cookie).send({ role: "admin" }).expect(200);
    expect((await invite(owner.orgId, bob.cookie, carol.email, "admin")).status).toBe(403);
    expect((await invite(owner.orgId, bob.cookie, carol.email, "billing")).status).toBe(201);
    expect((await invite(owner.orgId, owner.cookie, carol.email, "owner")).status).toBe(400);
    // admin não altera papéis
    expect((await http().patch(`/v1/organizations/${owner.orgId}/members/${owner.userId}`).set("Cookie", bob.cookie).send({ role: "member" })).status).toBe(403);
  });

  it("admin não remove owner; último owner não pode ser removido nem despromovido", async () => {
    expect((await http().delete(`/v1/organizations/${owner.orgId}/members/${owner.userId}`).set("Cookie", bob.cookie)).status).toBe(403);
    const demote = await http().patch(`/v1/organizations/${owner.orgId}/members/${owner.userId}`).set("Cookie", owner.cookie).send({ role: "member" });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe("last_owner");
    expect((await http().delete(`/v1/organizations/${owner.orgId}/members/${owner.userId}`).set("Cookie", owner.cookie)).status).toBe(409);
  });

  it("revogar convite impede o aceite; remover membro retira o acesso", async () => {
    const list = await http().get(`/v1/organizations/${owner.orgId}/invitations`).set("Cookie", owner.cookie);
    const pending = list.body.data[0];
    expect((await http().delete(`/v1/organizations/${owner.orgId}/invitations/${pending.id}`).set("Cookie", owner.cookie)).status).toBe(204);
    expect((await http().get(`/v1/organizations/${owner.orgId}/invitations`).set("Cookie", owner.cookie)).body.data).toHaveLength(0);

    expect((await http().delete(`/v1/organizations/${owner.orgId}/members/${bob.userId}`).set("Cookie", owner.cookie)).status).toBe(204);
    expect((await http().get(`/v1/organizations/${owner.orgId}/members`).set("Cookie", bob.cookie)).status).toBe(404);
  });
});
