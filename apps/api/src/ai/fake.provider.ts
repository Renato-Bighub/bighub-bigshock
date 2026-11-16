import { createHash } from "node:crypto";
import { deflateSync, crc32 } from "node:zlib";
import { ProviderError, type GenerateInput, type GenerateOutput, type ImageProvider } from "./image-provider.js";

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** PNG RGB mínimo (gradiente determinístico a partir do prompt). Sem dependências. */
export function makePng(width: number, height: number, seed: Buffer): Buffer {
  const [r, g, b] = [seed[0]!, seed[1]!, seed[2]!];
  const row = 1 + width * 3;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * row + 1 + x * 3;
      raw[o] = (r + (x * 255) / width) & 255;
      raw[o + 1] = (g + (y * 255) / height) & 255;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Fornecedor falso para desenvolvimento e testes. Comportamentos controlados pelo prompt:
 *   "[fail]"      → erro permanente
 *   "[transient]" → erro transitório (permite testar repetição)
 *   "[blocked]"   → conteúdo rejeitado
 */
export class FakeImageProvider implements ImageProvider {
  readonly name = "fake";
  readonly model = "fake-image-1";
  readonly enabled = true;
  calls = 0;

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    this.calls++;
    if (input.prompt.includes("[blocked]")) throw new ProviderError("content_rejected", "blocked by fake policy");
    if (input.prompt.includes("[transient]")) throw new ProviderError("transient", "fake transient failure");
    if (input.prompt.includes("[fail]")) throw new ProviderError("permanent", "fake permanent failure");
    const seed = createHash("sha256").update(input.prompt).digest();
    // Imagem pequena: o objetivo é exercitar o pipeline, não a qualidade.
    const [w, h] = input.size.split("x").map(Number) as [number, number];
    const width = Math.round(w / 16);
    const height = Math.round(h / 16);
    return { bytes: makePng(width, height, seed), contentType: "image/png", width: w, height: h, providerRequestId: `fake-${seed.subarray(0, 4).toString("hex")}` };
  }
}
