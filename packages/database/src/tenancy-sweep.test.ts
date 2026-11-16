import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { runMigrations } from "./migrate";

const url = process.env.DATABASE_URL;

/**
 * Varredura estrutural (corre em todo PR, CLAUDE.md §6): garante que NENHUMA tabela com organization_id
 * fica sem RLS forçado, e que as tabelas financeiras/de auditoria são append-only.
 * Uma tabela nova de cliente sem RLS faz este teste falhar.
 */
describe.skipIf(!url)("varredura de multi-tenancy e append-only", () => {
  const { db, pool } = createDb(url ?? "");
  beforeAll(async () => {
    await runMigrations(url!);
  });
  afterAll(async () => {
    await pool.end();
  });

  const q = async (text: string) => (await db.execute(text as never)).rows as Record<string, unknown>[];

  it("toda tabela com organization_id tem RLS ativo e forçado, com política de isolamento", async () => {
    const rows = await q(`
      SELECT c.relname AS tbl, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
        EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation') AS has_policy
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM information_schema.columns col WHERE col.table_schema='public' AND col.table_name=c.relname AND col.column_name='organization_id')
      ORDER BY 1`);
    expect(rows.length).toBeGreaterThan(10);
    // organizations usa "id" (é a própria organização) e é verificada à parte abaixo.
    const bad = rows.filter((r) => !(r.rls && r.forced && r.has_policy)).map((r) => r.tbl);
    expect(bad, `tabelas com organization_id sem RLS forçado + tenant_isolation: ${bad.join(", ")}`).toEqual([]);
    const [org] = await q(`SELECT relrowsecurity AS rls, relforcerowsecurity AS forced FROM pg_class WHERE relname='organizations' AND relkind='r'`);
    expect(org).toMatchObject({ rls: true, forced: true });
  });

  it("o papel da aplicação não ignora o RLS (sem BYPASSRLS nem superuser)", async () => {
    const [r] = await q(`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname='bigstock_app'`);
    expect(r).toMatchObject({ rolbypassrls: false, rolsuper: false });
  });

  it("tabelas financeiras e de auditoria têm trigger append-only", async () => {
    const append = ["credit_entries", "audit_events", "payments", "invoices", "license_grants", "download_events", "license_terms_versions"];
    const rows = await q(`
      SELECT c.relname AS tbl FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND t.tgname LIKE '%append_only'`);
    const have = new Set(rows.map((r) => r.tbl));
    expect(append.filter((t) => !have.has(t))).toEqual([]);
  });

  it("nenhuma tabela financeira tem coluna de saldo", async () => {
    const rows = await q(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND column_name ILIKE '%balance%' AND column_name NOT IN ('balance_type')`);
    expect(rows).toEqual([]);
  });

  it("a aplicação não tem DELETE/UPDATE nas tabelas append-only", async () => {
    const rows = await q(`
      SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE grantee='bigstock_app' AND table_name IN ('credit_entries','audit_events','payments','invoices','license_grants','download_events','license_terms_versions')
        AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')`);
    expect(rows).toEqual([]);
  });
});
