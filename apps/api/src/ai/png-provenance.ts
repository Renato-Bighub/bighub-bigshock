import { crc32 } from "node:zlib";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const AI_DIGITAL_SOURCE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

export interface Provenance {
  ai_generated: true;
  generator: string;
  provider: string;
  model: string;
  job_id: string;
  generated_at: string;
  digital_source_type: string;
  provider_request_id?: string;
}

export function buildProvenance(p: { provider: string; model: string; jobId: string; providerRequestId?: string; at?: Date }): Provenance {
  return {
    ai_generated: true,
    generator: "BIGstock",
    provider: p.provider,
    model: p.model,
    job_id: p.jobId,
    generated_at: (p.at ?? new Date()).toISOString(),
    digital_source_type: AI_DIGITAL_SOURCE,
    ...(p.providerRequestId ? { provider_request_id: p.providerRequestId } : {}),
  };
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Marca o PNG como conteúdo sintético (AI Act art. 50): XMP com IPTC DigitalSourceType
 * "trainedAlgorithmicMedia" + chaves tEXt legíveis. Não é uma assinatura C2PA; é
 * proveniência em metadados legíveis por máquina, preservada no ficheiro.
 * Devolve o original inalterado se não for PNG.
 */
export function embedAiProvenance(png: Buffer, p: Provenance): Buffer {
  if (png.length < 20 || !png.subarray(0, 8).equals(PNG_SIG)) return png;
  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:bigstock="https://bigstock.example/ns/1.0/" Iptc4xmpExt:DigitalSourceType="${esc(p.digital_source_type)}" bigstock:aiGenerated="true" bigstock:provider="${esc(p.provider)}" bigstock:model="${esc(p.model)}" bigstock:jobId="${esc(p.job_id)}" bigstock:generatedAt="${esc(p.generated_at)}"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  // iTXt: keyword\0 compressionFlag compressionMethod langTag\0 translatedKeyword\0 text
  const itxt = chunk("iTXt", Buffer.concat([Buffer.from("XML:com.adobe.xmp\0", "latin1"), Buffer.from([0, 0]), Buffer.from("\0\0", "latin1"), Buffer.from(xmp, "utf8")]));
  const text = (k: string, v: string) => chunk("tEXt", Buffer.from(`${k}\0${v}`, "latin1"));
  const extra = Buffer.concat([itxt, text("AIGenerated", "true"), text("AIProvider", p.provider), text("AIModel", p.model), text("AIJobId", p.job_id)]);
  // Insere antes do IEND (últimos 12 bytes).
  const iend = png.length - 12;
  return Buffer.concat([png.subarray(0, iend), extra, png.subarray(iend)]);
}

/** Lê os tEXt/iTXt de um PNG (para testes e verificação). */
export function readPngMetadata(png: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let o = 8;
  while (o + 12 <= png.length) {
    const len = png.readUInt32BE(o);
    const type = png.subarray(o + 4, o + 8).toString("ascii");
    const data = png.subarray(o + 8, o + 8 + len);
    if (type === "tEXt") {
      const i = data.indexOf(0);
      out[data.subarray(0, i).toString("latin1")] = data.subarray(i + 1).toString("latin1");
    } else if (type === "iTXt") {
      const i = data.indexOf(0);
      out[data.subarray(0, i).toString("latin1")] = data.subarray(i + 5).toString("utf8");
    }
    o += 12 + len;
  }
  return out;
}
