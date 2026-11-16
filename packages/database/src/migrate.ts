import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { createDb } from "./client";

export async function runMigrations(connectionString: string) {
  const { db, pool } = createDb(connectionString);
  try {
    await migrate(db, { migrationsFolder: resolve(__dirname, "../migrations") });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  runMigrations(url).then(() => console.warn("migrations applied"));
}
