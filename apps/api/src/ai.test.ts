import "reflect-metadata";
process.env.AUTH_RATE_LIMIT = "1000";
process.env.STORAGE_DIR = `${process.env.TMPDIR ?? "/tmp"}/bigstock-ai-${Date.now()}`;
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { aiJobs, assets, createDb, eq, inArray, runMigrations, users } from "@bigstock/database";
import type { AiGenerationJob } from "@bigstock/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiRunnerService, RetryableError } from "./ai/ai-runner.service.js";
import { MAX_ACTIVE_JOBS_PER_ORG, reservationIdFor } from "./ai/ai.service.js";
import { FakeImageProvider } from "./ai/fake.provider.js";
import { IMAGE_PROVIDER } from "./ai/image-provider.js";
import { JOB_QUEUE, type JobQueue } from "./ai/job-queue.js";
import { readPngMetadata } from "./ai/png-provenance.js";
import { AppModule } from "./app.module.js";
import { CreditsService } from "./billing/credits.service.js";
import { configureApp } from "./configure.js";

const url = process.env.DATABASE_URL;
const stamp = Date.now();
const password = "correct horse battery";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

class MemoryQueue implements JobQueue {
  enabled = true;
  jobs: AiGenerationJob[] = [];
  failNext = false;
  async enqueue(job: AiGenerationJob) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("redis down");
    }
    this.jobs.push(job);
  }
}

describe.skipIf(!url)("geração por IA", () => {
  let app: NestExpressApplication;
  let credits: CreditsService;
  let runner: AiRunnerService;
  const queue = new MemoryQueue();
  const provider = new FakeImageProvider();
  const { db, pool } = createDb(url ?? "");
  const http = () => request(app.getHttpServer());
  const createdAssets: string[] = [];
  let n = 0;

  async function newOrg(platformRole?: "admin") {
    const email = `ai-${stamp}-${++n}@example.com`;
    const res = await http().post("/v1/auth/register").send({ email, password, organizationName: "AI Lda" });
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
    const me = await http().get("/v1/auth/me").set("Cookie", cookie);
    if (platformRole) await db.update(users).set({ platformRole }).where(eq(users.email, email));
    return { cookie, orgId: me.body.organizations[0].id as string };
  }
  const grant = (orgId: string, amount: number, key = "g") => credits.grant(orgId, { balanceType: "purchased", amount, expiresAt: null, idempotencyKey: key });
  const body = (over: Record<string, unknown> = {}) => ({ prompt: "Um escritório moderno com luz natural", size: "1024x1024", quality: "standard", expectedCostCredits: 10, ...over });
  const create = (o: { cookie: string; orgId: string }, key: string, b: Record<string, unknown> = body()) =>
    http().post(`/v1/organizations/${o.orgId}/ai/jobs`).set("Cookie", o.cookie).set("Idempotency-Key", key).send(b);
  const run = (orgId: string, jobId: string, attemptsLeft = 0) => runner.run(orgId, jobId, attemptsLeft);

  beforeAll(async () => {
    await runMigrations(url!);
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JOB_QUEUE).useValue(queue)
      .overrideProvider(IMAGE_PROVIDER).useValue(provider)
      .compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    credits = app.get(CreditsService);
    runner = app.get(AiRunnerService);
  });
  afterAll(async () => {
    // ativos licenciados ficam (concessões são append-only); apenas despublica-os para não poluir o catálogo
    if (createdAssets.length) await db.update(assets).set({ status: "unpublished" }).where(inArray(assets.id, createdAssets));
    await app.close();
    await pool.end();
  });

  it("estimativa antes de confirmar; o backend recusa custo divergente e exige Idempotency-Key", async () => {
    const o = await newOrg();
    await grant(o.orgId, 100);
    const est = await http().post(`/v1/organizations/${o.orgId}/ai/estimate`).set("Cookie", o.cookie).send({ prompt: "uma praia ao pôr do sol", size: "1536x1024", quality: "high" });
    expect(est.body.data).toMatchObject({ cost_credits: 45, available_credits: 100, can_afford: true, kind: "generate" });
    expect((await http().post(`/v1/organizations/${o.orgId}/ai/jobs`).set("Cookie", o.cookie).send(body())).status).toBe(400);
    const wrong = await create(o, "key-cost-0001", body({ expectedCostCredits: 1 }));
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe("cost_changed");
    expect(await credits.balance(o.orgId)).toBe(100); // nada reservado
    expect((await http().get(`/v1/organizations/${o.orgId}/ai/pricing`).set("Cookie", o.cookie)).body.data).toHaveLength(6);
  });

  it("logo: custo fixo, formato e qualidade impostos pelo servidor, briefing obrigatório", async () => {
    const o = await newOrg();
    await grant(o.orgId, 100);
    const brief = { brandName: "Aurora", sector: "padaria artesanal", style: "minimalista", type: "simbolo_e_nome", colors: ["#C5001F"] };
    const bad = await http().post(`/v1/organizations/${o.orgId}/ai/estimate`).set("Cookie", o.cookie).send({ mode: "logo" });
    expect(bad.status).toBe(400);
    // O cliente tenta forçar formato/qualidade baratos: o servidor ignora e cobra o preço de logo.
    const est = await http().post(`/v1/organizations/${o.orgId}/ai/estimate`).set("Cookie", o.cookie).send({ mode: "logo", brief, size: "1536x1024", quality: "standard" });
    expect(est.body.data).toMatchObject({ cost_credits: 40, kind: "logo" });
    const res = await create(o, "key-logo-0001", { mode: "logo", brief, expectedCostCredits: 40 });
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ kind: "logo", size: "1024x1024", quality: "high", cost_credits: 40, brief: { brandName: "Aurora" } });
    await run(o.orgId, res.body.data.id);
    const done = await http().get(`/v1/organizations/${o.orgId}/ai/jobs/${res.body.data.id}`).set("Cookie", o.cookie);
    expect(done.body.data.status).toBe("succeeded");
    expect(await credits.balance(o.orgId)).toBe(60);
  });

  it("sem créditos: 402 antes de qualquer job ser enfileirado", async () => {
    const o = await newOrg();
    const before = queue.jobs.length;
    const res = await create(o, "key-broke-0001");
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("insufficient_credits");
    expect(queue.jobs.length).toBe(before);
    expect((await http().get(`/v1/organizations/${o.orgId}/ai/jobs`).set("Cookie", o.cookie)).body.data).toHaveLength(0);
  });

  it("sucesso: reserva → fila → geração → consumo, com proveniência AI Act e saída privada", async () => {
    const o = await newOrg();
    await grant(o.orgId, 100);
    const res = await create(o, "key-success-01");
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ status: "queued", cost_credits: 10, ai_generated: true });
    expect(await credits.balance(o.orgId)).toBe(90); // reservado, ainda não consumido definitivamente
    const queued = queue.jobs.at(-1)!;
    expect(queued).toMatchObject({ organizationId: o.orgId, aiJobId: res.body.data.id, reservationId: reservationIdFor(o.orgId, "key-success-01") });

    // retry de rede com a mesma chave: não duplica job nem cobrança
    const retry = await create(o, "key-success-01");
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(res.body.data.id);
    expect(await credits.balance(o.orgId)).toBe(90);
    expect((await create(o, "key-success-01", body({ prompt: "outro pedido diferente" }))).status).toBe(409);

    await run(o.orgId, res.body.data.id);
    const job = await http().get(`/v1/organizations/${o.orgId}/ai/jobs/${res.body.data.id}`).set("Cookie", o.cookie);
    expect(job.body.data).toMatchObject({ status: "succeeded", provider: "fake", model: "fake-image-1", ai_generated: true });
    expect(await credits.balance(o.orgId)).toBe(90); // consumido
    await run(o.orgId, res.body.data.id); // reexecução é inócua
    expect(await credits.balance(o.orgId)).toBe(90);

    const out = await http().get(`/v1/organizations/${o.orgId}/ai/jobs/${res.body.data.id}/output`).set("Cookie", o.cookie).buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on("data", (d) => c.push(d)); r.on("end", () => cb(null, Buffer.concat(c))); });
    expect(out.status).toBe(200);
    expect(out.headers["content-type"]).toMatch(/image\/png/);
    const meta = readPngMetadata(out.body as Buffer);
    expect(meta.AIGenerated).toBe("true");
    expect(meta.AIProvider).toBe("fake");
    expect(meta["XML:com.adobe.xmp"]).toContain("trainedAlgorithmicMedia");
    // privado: só aparece para a própria organização e nunca no catálogo
    const other = await newOrg();
    expect((await http().get(`/v1/organizations/${o.orgId}/ai/jobs/${res.body.data.id}`).set("Cookie", other.cookie)).status).toBe(404);
    expect((await http().get(`/v1/organizations/${other.orgId}/ai/jobs/${res.body.data.id}`).set("Cookie", other.cookie)).status).toBe(404);
    const [row] = await db.select().from(aiJobs).where(eq(aiJobs.id, res.body.data.id));
    expect(row!.outputKey).toMatch(/^ai\//);
  });

  it("falhas devolvem os créditos; transitórias repetem e só falham na última tentativa", async () => {
    const o = await newOrg();
    await grant(o.orgId, 100);
    const status = async (id: string) => (await http().get(`/v1/organizations/${o.orgId}/ai/jobs/${id}`).set("Cookie", o.cookie)).body.data;

    const f = (await create(o, "key-fail-00001", body({ prompt: "pedido [fail] técnico" }))).body.data.id;
    await run(o.orgId, f);
    expect(await status(f)).toMatchObject({ status: "failed", error_code: "generation_failed" });
    expect(await credits.balance(o.orgId)).toBe(100);

    const b = (await create(o, "key-block-0001", body({ prompt: "pedido [blocked] inadequado" }))).body.data.id;
    await run(o.orgId, b);
    expect(await status(b)).toMatchObject({ status: "failed", error_code: "content_rejected" });
    expect(await credits.balance(o.orgId)).toBe(100);

    const t = (await create(o, "key-trans-0001", body({ prompt: "pedido [transient] instável" }))).body.data.id;
    expect(await credits.balance(o.orgId)).toBe(90);
    await expect(run(o.orgId, t, 2)).rejects.toBeInstanceOf(RetryableError);
    expect((await status(t)).status).toBe("queued");
    expect(await credits.balance(o.orgId)).toBe(90); // ainda reservado durante as repetições
    await run(o.orgId, t, 0); // última tentativa
    expect(await status(t)).toMatchObject({ status: "failed", error_code: "provider_unavailable" });
    expect(await credits.balance(o.orgId)).toBe(100);
  });

  it("falha ao enfileirar devolve os créditos e responde 503", async () => {
    const o = await newOrg();
    await grant(o.orgId, 50);
    queue.failNext = true;
    const res = await create(o, "key-queue-0001");
    expect(res.status).toBe(503);
    expect(await credits.balance(o.orgId)).toBe(50);
  });

  it("limite de trabalhos simultâneos devolve 429 com Retry-After", async () => {
    const o = await newOrg();
    await grant(o.orgId, 1000);
    for (let i = 0; i < MAX_ACTIVE_JOBS_PER_ORG; i++) expect((await create(o, `key-cap-${i}-aaaa`, body({ prompt: `pedido número ${i}` }))).status).toBe(202);
    const over = await create(o, "key-cap-over-aa", body({ prompt: "pedido a mais" }));
    expect(over.status).toBe(429);
    expect(over.headers["retry-after"]).toBe("10");
    expect(await credits.balance(o.orgId)).toBe(1000 - MAX_ACTIVE_JOBS_PER_ORG * 10); // o 6º não reservou nada
  });

  it("créditos concorrentes: dois pedidos com a mesma chave reservam uma só vez", async () => {
    const o = await newOrg();
    await grant(o.orgId, 100);
    const rs = await Promise.all([1, 2, 3, 4].map(() => create(o, "key-race-00001")));
    expect(new Set(rs.map((r) => r.body.data.id)).size).toBe(1);
    expect(await credits.balance(o.orgId)).toBe(90);
  });

  it("referência: só ativos licenciados pela organização e com allows_ai_transform", async () => {
    const admin = await newOrg("admin");
    const o = await newOrg();
    await grant(o.orgId, 100);
    async function asset(title: string, allows: boolean) {
      const c = await http().post("/v1/admin/assets").set("Cookie", admin.cookie).send({ title: `${title} zorbo${stamp}`, category: "natureza", width: 1, height: 1, allowsAiTransform: allows });
      const id = c.body.data.id as string;
      createdAssets.push(id);
      await http().put(`/v1/admin/assets/${id}/preview`).set("Cookie", admin.cookie).set("Content-Type", "image/png").send(PNG);
      await http().put(`/v1/admin/assets/${id}/original`).set("Cookie", admin.cookie).set("Content-Type", "image/png").send(PNG);
      await http().put(`/v1/admin/assets/${id}/rights`).set("Cookie", admin.cookie).send({ rightsHolder: "BIGhub", licenseBasis: "teste", verified: true });
      await http().post(`/v1/admin/assets/${id}/publish`).set("Cookie", admin.cookie).expect(204);
      return id;
    }
    const okAsset = await asset("Permite IA", true);
    const noAsset = await asset("Proibe IA", false);
    const edit = (assetId: string, key: string) => create(o, key, body({ referenceAssetId: assetId, expectedCostCredits: 15 }));

    expect((await edit(okAsset, "key-ref-000001")).status).toBe(404); // ainda não licenciado
    for (const [id, k] of [[okAsset, "lic-ok-000001"], [noAsset, "lic-no-000001"]] as const) {
      await http().post(`/v1/organizations/${o.orgId}/licenses`).set("Cookie", o.cookie).set("Idempotency-Key", k).send({ assetId: id }).expect(201);
    }
    const blocked = await edit(noAsset, "key-ref-000002");
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("ai_transform_not_allowed");
    expect(await credits.balance(o.orgId)).toBe(100);
    const good = await edit(okAsset, "key-ref-000003");
    expect(good.status).toBe(202);
    expect(good.body.data).toMatchObject({ kind: "edit", cost_credits: 15 });
    await run(o.orgId, good.body.data.id);
    expect((await http().get(`/v1/organizations/${o.orgId}/ai/jobs/${good.body.data.id}`).set("Cookie", o.cookie)).body.data.status).toBe("succeeded");
  });
});
