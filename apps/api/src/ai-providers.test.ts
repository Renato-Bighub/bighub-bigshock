import { describe, expect, it } from "vitest";
import { FakeImageProvider, makePng } from "./ai/fake.provider.js";
import { ProviderError } from "./ai/image-provider.js";
import { OpenAiImageProvider } from "./ai/openai.provider.js";
import { buildProvenance, embedAiProvenance, readPngMetadata } from "./ai/png-provenance.js";

const b64 = makePng(4, 4, Buffer.from([1, 2, 3])).toString("base64");
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe("proveniência AI Act no PNG", () => {
  it("embute XMP IPTC + tEXt sem corromper o PNG", () => {
    const png = makePng(8, 8, Buffer.from([9, 9, 9]));
    const p = buildProvenance({ provider: "openai", model: "gpt-image-1", jobId: "job-1" });
    const marked = embedAiProvenance(png, p);
    expect(marked.length).toBeGreaterThan(png.length);
    expect(marked.subarray(0, 8).equals(png.subarray(0, 8))).toBe(true);
    expect(marked.subarray(-12).equals(png.subarray(-12))).toBe(true); // IEND intacto
    const meta = readPngMetadata(marked);
    expect(meta).toMatchObject({ AIGenerated: "true", AIProvider: "openai", AIModel: "gpt-image-1", AIJobId: "job-1" });
    expect(meta["XML:com.adobe.xmp"]).toContain("digitalsourcetype/trainedAlgorithmicMedia");
  });
  it("ficheiros que não são PNG ficam inalterados", () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(embedAiProvenance(jpg, buildProvenance({ provider: "x", model: "y", jobId: "z" }))).toBe(jpg);
  });
});

describe("OpenAiImageProvider", () => {
  const mk = (fetchImpl: typeof fetch) => new OpenAiImageProvider("sk-test", "gpt-image-1", "https://api.test/v1", fetchImpl);
  const input = { prompt: "um gato", size: "1024x1024" as const, quality: "standard" as const };

  it("gera imagem e envia modelo, tamanho e qualidade mapeada", async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string | null } | undefined;
    const p = mk(async (u, init) => {
      sent = { url: String(u), body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("authorization") };
      return json(200, { data: [{ b64_json: b64 }] }, { "x-request-id": "req_1" });
    });
    const out = await p.generate(input);
    expect(sent).toMatchObject({ url: "https://api.test/v1/images/generations", auth: "Bearer sk-test", body: { model: "gpt-image-1", size: "1024x1024", quality: "medium", n: 1 } });
    expect(out.contentType).toBe("image/png");
    expect(out.providerRequestId).toBe("req_1");
  });

  it("usa /images/edits com a referência", async () => {
    let url = "";
    const p = mk(async (u) => { url = String(u); return json(200, { data: [{ b64_json: b64 }] }); });
    await p.generate({ ...input, reference: { bytes: Buffer.from("x"), contentType: "image/png" } });
    expect(url).toBe("https://api.test/v1/images/edits");
  });

  it("classifica erros: moderação, transitório e permanente", async () => {
    const kind = async (res: () => Response | Promise<Response>) => (await mk(async () => res()).generate(input).catch((e: ProviderError) => e)) as ProviderError;
    expect((await kind(() => json(400, { error: { code: "moderation_blocked", message: "no" } }))).kind).toBe("content_rejected");
    expect((await kind(() => json(429, { error: { message: "slow down" } }))).kind).toBe("transient");
    expect((await kind(() => json(503, {}))).kind).toBe("transient");
    expect((await kind(() => json(401, { error: { code: "invalid_api_key" } }))).kind).toBe("permanent");
    expect((await mk(async () => { throw new Error("ECONNRESET"); }).generate(input).catch((e: ProviderError) => e) as ProviderError).kind).toBe("transient");
  });
});

describe("FakeImageProvider", () => {
  it("é determinístico", async () => {
    const f = new FakeImageProvider();
    const a = await f.generate({ prompt: "x", size: "1024x1024", quality: "standard" });
    const b = await f.generate({ prompt: "x", size: "1024x1024", quality: "standard" });
    expect(a.bytes.equals(b.bytes)).toBe(true);
  });
});
