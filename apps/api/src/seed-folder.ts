/**
 * Seed de DESENVOLVIMENTO: publica as imagens de uma pasta local (metadados em seed-data/folder-images.ts).
 *
 *   pnpm --filter @bigstock/api build && node --env-file=../../.env dist/seed-folder.js --dir /caminho/imagens
 *
 * Os "direitos" criados são fictícios e marcados como tal (sem direitos comerciais reais). Idempotente por título.
 * Recusa correr com NODE_ENV=production.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assets, categories, createDb, eq, rightsRecords, runMigrations } from "@bigstock/database";
import { EXT, sniffImage } from "./catalog/image-type.js";
import { StorageService } from "./catalog/storage.service.js";
import { FOLDER_IMAGES } from "./seed-data/folder-images.js";

/** Largura/altura de um JPEG (marcadores SOF); null se não for possível ler. */
export function jpegSize(b: Buffer): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1]!;
    if (marker === 0xff) { i++; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("seed:folder não pode correr em produção");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const dirIdx = process.argv.indexOf("--dir");
  const dir = dirIdx > -1 ? process.argv[dirIdx + 1] : undefined;
  if (!dir) throw new Error("use --dir /caminho/da/pasta");
  await runMigrations(url);
  const { db, pool } = createDb(url);
  const storage = new StorageService();
  const existing = new Set((await db.select({ t: assets.title }).from(assets)).map((a) => a.t));
  const known = new Set((await db.select({ s: categories.slug }).from(categories)).map((c) => c.s));
  let created = 0;
  for (const d of FOLDER_IMAGES) {
    if (existing.has(d.title) || !known.has(d.category)) continue;
    let data: Buffer;
    try {
      data = await readFile(resolve(dir, d.file));
    } catch {
      console.warn(`ignorado (ficheiro em falta): ${d.file}`);
      continue;
    }
    const type = sniffImage(data);
    if (!type) { console.warn(`ignorado (tipo não suportado): ${d.file}`); continue; }
    const size = jpegSize(data) ?? { width: 1500, height: 1000 };
    const [a] = await db.insert(assets).values({ title: d.title, kind: "photo", categorySlug: d.category, tags: d.tags, width: size.width, height: size.height }).returning();
    const key = `previews/${a!.id}.${EXT[type]}`;
    await storage.put(key, data, type);
    const originalKey = `originals/${a!.id}.${EXT[type]}`;
    await storage.put(originalKey, data, type);
    await db.insert(rightsRecords).values({ assetId: a!.id, rightsHolder: "DEV-SEED (sem direitos reais)", licenseBasis: "Apenas desenvolvimento; não licenciável", verifiedAt: new Date() });
    await db.update(assets).set({ previewKey: key, previewContentType: type, originalKey, originalContentType: type, originalBytes: data.length, status: "published", publishedAt: new Date() }).where(eq(assets.id, a!.id));
    created++;
  }
  console.warn(`seed: ${created} ativos criados`);
  await pool.end();
}
if (process.argv[1]?.endsWith("seed-folder.js")) void main();
