import { ProviderError, type GenerateInput, type GenerateOutput, type ImageProvider } from "./image-provider.js";

const QUALITY: Record<string, string> = { standard: "medium", high: "high" };

/**
 * OpenAI Images (gpt-image). Tradução de erros: moderação → content_rejected;
 * 429/5xx/timeout → transient (repetível); restantes 4xx → permanent.
 */
export class OpenAiImageProvider implements ImageProvider {
  readonly name = "openai";
  readonly enabled = true;
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    model = "gpt-image-1",
    private readonly baseUrl = "https://api.openai.com/v1",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.model = model;
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const quality = QUALITY[input.quality] ?? "medium";
    let res: Response;
    try {
      if (input.reference) {
        const form = new FormData();
        form.set("model", this.model);
        form.set("prompt", input.prompt);
        form.set("size", input.size);
        form.set("quality", quality);
        form.set("image", new Blob([new Uint8Array(input.reference.bytes)], { type: input.reference.contentType }), "reference");
        res = await this.fetchImpl(`${this.baseUrl}/images/edits`, { method: "POST", headers: { authorization: `Bearer ${this.apiKey}` }, body: form, signal: AbortSignal.timeout(110_000) });
      } else {
        res = await this.fetchImpl(`${this.baseUrl}/images/generations`, {
          method: "POST",
          headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: this.model, prompt: input.prompt, size: input.size, quality, n: 1 }),
          signal: AbortSignal.timeout(110_000),
        });
      }
    } catch (e) {
      throw new ProviderError("transient", `network error: ${(e as Error).message}`);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      const code = body.error?.code ?? "";
      const msg = `openai ${res.status} ${code}: ${body.error?.message ?? ""}`.trim();
      if (code === "moderation_blocked" || code === "content_policy_violation") throw new ProviderError("content_rejected", msg);
      if (res.status === 429 || res.status >= 500) throw new ProviderError("transient", msg);
      throw new ProviderError("permanent", msg);
    }
    const data = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new ProviderError("permanent", "openai returned no image");
    const [width, height] = input.size.split("x").map(Number) as [number, number];
    return { bytes: Buffer.from(b64, "base64"), contentType: "image/png", width, height, providerRequestId: res.headers.get("x-request-id") ?? undefined };
  }
}
