/**
 * Seed de DESENVOLVIMENTO: publica ativos demonstrativos a partir de apps/web/public/images
 * (ficheiros locais não versionados) e, opcionalmente, concede papel de plataforma.
 *
 *   pnpm --filter @bigstock/api seed:catalog [--admin email@exemplo.com]
 *
 * Os "direitos" criados aqui são fictícios e marcados como tal. Nunca corre em produção.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assets, categories, createDb, eq, rightsRecords, runMigrations, users } from "@bigstock/database";
import { EXT, sniffImage } from "./catalog/image-type.js";
import { StorageService } from "./catalog/storage.service.js";

const DEMO = [
  { title: "Vindima ao pôr do sol", file: "fresh-vineyard.jpg", category: "natureza", tags: ["vinha", "uvas", "agricultura"] },
  { title: "Arquitetura empresarial", file: "fresh-office.jpg", category: "negocios", tags: ["escritório", "fachada", "arquitetura"] },
  { title: "Costa ao entardecer", file: "fresh-coast.jpg", category: "viagens", tags: ["praia", "mar", "rochas"] },
  { title: "Profissional de restauração", file: "fresh-barista.jpg", category: "pessoas", tags: ["barista", "café", "profissão"] },
  { title: "Energia renovável", file: "fresh-energy.jpg", category: "tecnologia", tags: ["turbinas", "sustentabilidade", "energia"] },
  { title: "Elétrico na cidade", file: "fresh-city.jpg", category: "viagens", tags: ["portugal", "lisboa", "urbano"] },
  { title: "Reunião de equipa", file: "category-business.jpg", category: "negocios", tags: ["reunião", "colaboração"] },
  { title: "Infraestrutura de servidores", file: "category-technology.jpg", category: "tecnologia", tags: ["data center", "servidor", "hardware"] },
  { title: "Retrato profissional", file: "category-people.jpg", category: "pessoas", tags: ["retrato", "mulher", "sorriso"] },
  { title: "Cidades europeias", file: "category-travel.jpg", category: "viagens", tags: ["viagem", "europa", "edifícios"] },
  { title: "Cascata na floresta", file: "category-nature.jpg", category: "natureza", tags: ["água", "verde", "floresta"] },
  { title: "Gastronomia contemporânea", file: "category-food.jpg", category: "alimentacao", tags: ["massa", "comida", "restaurante"] },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("seed:catalog não pode correr em produção");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  await runMigrations(url);
  const { db, pool } = createDb(url);
  const storage = new StorageService();
  const imagesDir = resolve(process.cwd(), "../web/public/images");

  const adminIdx = process.argv.indexOf("--admin");
  if (adminIdx > -1) {
    const email = process.argv[adminIdx + 1]?.toLowerCase();
    const done = email ? await db.update(users).set({ platformRole: "admin" }).where(eq(users.email, email)).returning({ id: users.id }) : [];
    console.warn(done.length ? `${email} é agora administrador da plataforma` : `utilizador ${email} não encontrado`);
  }

  const existing = new Set((await db.select({ t: assets.title }).from(assets)).map((a) => a.t));
  const known = new Set((await db.select({ s: categories.slug }).from(categories)).map((c) => c.s));
  let created = 0;
  for (const d of DEMO) {
    if (existing.has(d.title) || !known.has(d.category)) continue;
    let data: Buffer;
    try {
      data = await readFile(resolve(imagesDir, d.file));
    } catch {
      console.warn(`ignorado (ficheiro em falta): ${d.file}`);
      continue;
    }
    const type = sniffImage(data);
    if (!type) continue;
    const [a] = await db
      .insert(assets)
      .values({ title: d.title, kind: "photo", categorySlug: d.category, tags: d.tags, width: 2400, height: 1600 })
      .returning();
    const key = `previews/${a!.id}.${EXT[type]}`;
    await storage.put(key, data);
    await db.insert(rightsRecords).values({
      assetId: a!.id,
      rightsHolder: "DEV-SEED (sem direitos reais)",
      licenseBasis: "Apenas desenvolvimento; não licenciável",
      verifiedAt: new Date(),
    });
    await db.update(assets).set({ previewKey: key, previewContentType: type, status: "published", publishedAt: new Date() }).where(eq(assets.id, a!.id));
    created++;
  }
  console.warn(`seed: ${created} ativos criados`);
  await pool.end();
}
void main();
