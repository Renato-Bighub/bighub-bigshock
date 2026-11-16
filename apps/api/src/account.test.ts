import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "100000";
process.env.WEB_URL = "https://app.test";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { createDb, emailTokens, eq, invitations, runMigrations, users } from "@bigstock/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure.js";
import { EMAIL_PROVIDER, ResendEmailProvider, type EmailMessage, type EmailProvider } from "./mail/email.provider.js";

const url = process.env.DATABASE_URL;
const stamp = Date.now();
const password = "correct horse battery";

class TestEmail implements EmailProvider {
  name = "test";
  delivers = false;
  outbox: EmailMessage[] = [];
  async send(m: EmailMessage) { this.outbox.push(m); return true; }
  to(addr: string, subjectPart: string) { return this.outbox.filter((m) => m.to === addr && m.subject.includes(subjectPart)); }
  token(addr: string, subjectPart: string) {
    const m = this.to(addr, subjectPart).at(-1);
    return m ? /token=([A-Za-z0-9_-]+)/.exec(m.text)![1]! : undefined;
  }
}

describe.skipIf(!url)("e-mail transacional, verificação e senhas", () => {
  let app: NestExpressApplication;
  const mail = new TestEmail();
  const { db, pool } = createDb(url ?? "");
  const http = () => request(app.getHttpServer());
  let n = 0;
  const newEmail = (l: string) => `acct-${stamp}-${++n}-${l}@example.com`;

  async function register(l: string) {
    const email = newEmail(l);
    const res = await http().post("/v1/auth/register").send({ email, password, displayName: `Nome ${l}`, organizationName: `Org ${l}` });
    expect(res.status).toBe(201);
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
    const me = await http().get("/v1/auth/me").set("Cookie", cookie);
    return { email, cookie, userId: me.body.user.id as string, orgId: me.body.organizations[0].id as string };
  }
  const login = (email: string, pw: string) => http().post("/v1/auth/login").send({ email, password: pw });

  beforeAll(async () => {
    await runMigrations(url!);
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_PROVIDER).useValue(mail).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("registo envia a verificação; o link confirma o e-mail uma só vez; reenvio tem intervalo mínimo", async () => {
    const u = await register("verify");
    expect((await http().get("/v1/auth/me").set("Cookie", u.cookie)).body.user.email_verified).toBe(false);
    const msg = mail.to(u.email, "Confirme")[0]!;
    expect(msg.html).toContain("https://app.test/verificar-email?token=");
    const token = mail.token(u.email, "Confirme")!;
    expect((await http().post("/v1/auth/verify-email").send({ token: "x".repeat(43) })).status).toBe(400);
    expect((await http().post("/v1/auth/verify-email").send({ token })).status).toBe(200);
    expect((await http().get("/v1/auth/me").set("Cookie", u.cookie)).body.user.email_verified).toBe(true);
    expect((await http().post("/v1/auth/verify-email").send({ token })).status).toBe(400); // uso único

    const u2 = await register("resend");
    const tooSoon = await http().post("/v1/auth/verify-email/send").set("Cookie", u2.cookie);
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error.code).toBe("too_soon");
    await db.update(emailTokens).set({ createdAt: new Date(Date.now() - 120_000) }).where(eq(emailTokens.userId, u2.userId));
    expect((await http().post("/v1/auth/verify-email/send").set("Cookie", u2.cookie)).status).toBe(202);
    expect(mail.to(u2.email, "Confirme")).toHaveLength(2);
    // só o último link funciona
    const [first, last] = mail.to(u2.email, "Confirme").map((m) => /token=([A-Za-z0-9_-]+)/.exec(m.text)![1]!);
    expect((await http().post("/v1/auth/verify-email").send({ token: first })).status).toBe(400);
    expect((await http().post("/v1/auth/verify-email").send({ token: last })).status).toBe(200);
  });

  it("token de verificação expirado é recusado", async () => {
    const u = await register("expired");
    const token = mail.token(u.email, "Confirme")!;
    await db.update(emailTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(emailTokens.userId, u.userId));
    expect((await http().post("/v1/auth/verify-email").send({ token })).status).toBe(400);
  });

  it("recuperação de senha: sem enumeração de contas, limites e uso único", async () => {
    const u = await register("forgot");
    const ghost = await http().post("/v1/auth/forgot-password").send({ email: newEmail("ghost") });
    const known = await http().post("/v1/auth/forgot-password").send({ email: u.email });
    expect(ghost.status).toBe(202);
    expect(known.status).toBe(202);
    expect(Object.keys(ghost.body).sort()).toEqual(Object.keys(known.body).sort());
    expect(mail.to(u.email, "Redefinir")).toHaveLength(1);
    expect(mail.outbox.filter((m) => m.to.includes("ghost"))).toHaveLength(0);
    await http().post("/v1/auth/forgot-password").send({ email: u.email }); // dentro do intervalo: não envia outro
    expect(mail.to(u.email, "Redefinir")).toHaveLength(1);

    const token = mail.token(u.email, "Redefinir")!;
    expect((await http().post("/v1/auth/reset-password").send({ token, password: "curta" })).status).toBe(400);
    const sessionBefore = (await http().get("/v1/auth/me").set("Cookie", u.cookie)).status;
    expect(sessionBefore).toBe(200);

    const newPw = "a brand new long password";
    expect((await http().post("/v1/auth/reset-password").send({ token, password: newPw })).status).toBe(200);
    expect((await http().post("/v1/auth/reset-password").send({ token, password: "another long password 1" })).status).toBe(400); // uso único
    expect((await login(u.email, password)).status).toBe(401);
    expect((await login(u.email, newPw)).status).toBe(200);
    expect((await http().get("/v1/auth/me").set("Cookie", u.cookie)).status).toBe(401); // sessões antigas terminadas
    expect(mail.to(u.email, "alterada")).toHaveLength(1); // aviso de segurança
    const [row] = await db.select().from(users).where(eq(users.id, u.userId));
    expect(row!.emailVerifiedAt).toBeTruthy(); // o link prova a posse do e-mail
  });

  it("recuperação: só o último link vale e contas eliminadas não recebem e-mail", async () => {
    const u = await register("latest");
    await http().post("/v1/auth/forgot-password").send({ email: u.email });
    const first = mail.token(u.email, "Redefinir")!;
    await db.update(emailTokens).set({ createdAt: new Date(Date.now() - 120_000) }).where(eq(emailTokens.userId, u.userId));
    await http().post("/v1/auth/forgot-password").send({ email: u.email });
    const second = mail.to(u.email, "Redefinir").map((m) => /token=([A-Za-z0-9_-]+)/.exec(m.text)![1]!)[1]!;
    expect((await http().post("/v1/auth/reset-password").send({ token: first, password: "a brand new long password" })).status).toBe(400);
    expect((await http().post("/v1/auth/reset-password").send({ token: second, password: "a brand new long password" })).status).toBe(200);

    const gone = await register("gone");
    await http().post("/v1/me/erase").set("Cookie", gone.cookie).send({ password, confirm: "ELIMINAR" }).expect(200);
    const before = mail.outbox.length;
    await http().post("/v1/auth/forgot-password").send({ email: gone.email });
    expect(mail.outbox.length).toBe(before);
  });

  it("alterar senha: exige a atual, mantém a sessão atual e termina as outras", async () => {
    const u = await register("change");
    const other = await login(u.email, password);
    const otherCookie = String(other.headers["set-cookie"]).split(";")[0]!;
    expect((await http().post("/v1/auth/change-password").set("Cookie", u.cookie).send({ currentPassword: "errada-errada-12", newPassword: "a brand new long password" })).status).toBe(401);
    expect((await http().post("/v1/auth/change-password").set("Cookie", u.cookie).send({ currentPassword: password, newPassword: "curta" })).status).toBe(400);
    expect((await http().post("/v1/auth/change-password").set("Cookie", u.cookie).send({ currentPassword: password, newPassword: "a brand new long password" })).status).toBe(200);
    expect((await http().get("/v1/auth/me").set("Cookie", u.cookie)).status).toBe(200);
    expect((await http().get("/v1/auth/me").set("Cookie", otherCookie)).status).toBe(401);
    expect((await login(u.email, "a brand new long password")).status).toBe(200);
    expect(mail.to(u.email, "alterada")).toHaveLength(1);
  });

  it("convites por e-mail: o token vai só para o convidado, que fica verificado ao aceitar", async () => {
    mail.delivers = true;
    try {
      const owner = await register("inviter");
      const invitee = await register("invitee");
      const inv = await http().post(`/v1/organizations/${owner.orgId}/invitations`).set("Cookie", owner.cookie).send({ email: invitee.email, role: "member" });
      expect(inv.status).toBe(201);
      expect(inv.body.data.token).toBeUndefined();
      expect(inv.body.data.emailed).toBe(true);
      const token = mail.token(invitee.email, "convidou")!;
      expect(mail.to(invitee.email, "convidou")[0]!.html).toContain("Nome inviter");
      expect((await http().get("/v1/auth/me").set("Cookie", invitee.cookie)).body.user.email_verified).toBe(false);
      expect((await http().post("/v1/invitations/accept").set("Cookie", invitee.cookie).send({ token })).status).toBe(200);
      expect((await http().get("/v1/auth/me").set("Cookie", invitee.cookie)).body.user.email_verified).toBe(true);
    } finally {
      mail.delivers = false;
    }
  });

  it("com entrega real de e-mail, aceitar um convite sem posse comprovada exige e-mail verificado", async () => {
    const owner = await register("inviter2");
    const invitee = await register("invitee2");
    // convite criado sem entrega real (token devolvido a quem convida)
    const inv = await http().post(`/v1/organizations/${owner.orgId}/invitations`).set("Cookie", owner.cookie).send({ email: invitee.email, role: "member" });
    expect(inv.body.data.token).toBeTruthy();
    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.body.data.id));
    expect(row!.emailedAt).toBeNull();
    mail.delivers = true;
    try {
      const blocked = await http().post("/v1/invitations/accept").set("Cookie", invitee.cookie).send({ token: inv.body.data.token });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe("email_not_verified");
      await http().post("/v1/auth/verify-email").send({ token: mail.token(invitee.email, "Confirme")! }).expect(200);
      expect((await http().post("/v1/invitations/accept").set("Cookie", invitee.cookie).send({ token: inv.body.data.token })).status).toBe(200);
    } finally {
      mail.delivers = false;
    }
  });
});

describe("ResendEmailProvider", () => {
  const msg = { to: "a@b.pt", subject: "Olá", html: "<p>x</p>", text: "x" };
  it("envia com Bearer e corpo correto; devolve false em erro HTTP ou de rede", async () => {
    let sent: { url: string; auth: string | null; body: Record<string, unknown> } | undefined;
    const ok = new ResendEmailProvider("re_test", "BIGstock <no-reply@x.pt>", async (u, init) => {
      sent = { url: String(u), auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) };
      return new Response("{}", { status: 200 });
    });
    expect(await ok.send(msg)).toBe(true);
    expect(sent).toMatchObject({ url: "https://api.resend.com/emails", auth: "Bearer re_test", body: { from: "BIGstock <no-reply@x.pt>", to: ["a@b.pt"], subject: "Olá" } });
    expect(ok.delivers).toBe(true);
    expect(await new ResendEmailProvider("k", "f", async () => new Response("{}", { status: 422 })).send(msg)).toBe(false);
    expect(await new ResendEmailProvider("k", "f", async () => { throw new Error("ECONNRESET"); }).send(msg)).toBe(false);
  });
});
