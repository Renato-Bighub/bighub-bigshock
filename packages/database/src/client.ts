import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  // Serverless (Vercel): poucas ligações por instância e idle curto; use o URL "pooled" do fornecedor
  // (PgBouncer em modo transação funciona: SET LOCAL ROLE/set_config vivem dentro da transação).
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 10)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return { db: drizzle(pool, { schema }), pool };
}
export type Database = ReturnType<typeof createDb>["db"];
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Executa `fn` numa transação limitada a UMA organização: assume o papel
 * bigstock_app (sujeito a RLS) e fixa app.organization_id. Toda leitura/escrita
 * de dados de cliente deve passar por aqui (CLAUDE.md §6, §8).
 */
export async function withTenant<T>(db: Database, organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE bigstock_app`);
    await tx.execute(sql`SELECT set_config('app.organization_id', ${organizationId}, true)`);
    return fn(tx);
  });
}

/** Contexto de utilizador (sem organização): lista as organizações a que pertence. */
export async function withUser<T>(
  db: Database,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
  opts: { email?: string } = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE bigstock_app`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    if (opts.email) await tx.execute(sql`SELECT set_config('app.user_email', ${opts.email}, true)`);
    return fn(tx);
  });
}

/** Dentro de uma transação já autenticada, passa a operar na organização indicada (após validação na app). */
export async function enterTenant(tx: Tx, organizationId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.organization_id', ${organizationId}, true)`);
}
