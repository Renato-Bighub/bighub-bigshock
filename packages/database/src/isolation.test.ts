import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withTenant } from "./client";
import { runMigrations } from "./migrate";
import { auditEvents, creditEntries, organizationMembers, organizations, users } from "./schema";

const url = process.env.DATABASE_URL;

// Corre em todo PR (CI tem Postgres). Localmente exige DATABASE_URL.
// drizzle embrulha o erro do Postgres em "Failed query"; a causa tem a mensagem real.
async function expectAppendOnly(p: PromiseLike<unknown>) {
  const err = (await Promise.resolve(p).then(
    () => null,
    (e: unknown) => e,
  )) as { message?: string; cause?: { message?: string } } | null;
  expect(err, "esperava erro append-only").not.toBeNull();
  expect(err?.cause?.message ?? err?.message).toMatch(/append-only/);
}

describe.skipIf(!url)("isolamento multi-tenant e tabelas append-only", () => {
  const { db, pool } = createDb(url ?? "");
  let orgA = "";
  let orgB = "";
  let grantA = "";

  beforeAll(async () => {
    await runMigrations(url!);
    const [a, b] = await db
      .insert(organizations)
      .values([{ name: "Org A" }, { name: "Org B" }])
      .returning();
    orgA = a!.id;
    orgB = b!.id;
    const [user] = await db.insert(users).values({ email: `u-${Date.now()}@test.local` }).returning();
    await db.insert(organizationMembers).values([
      { organizationId: orgA, userId: user!.id, role: "owner" },
      { organizationId: orgB, userId: user!.id, role: "owner" },
    ]);
    const [g] = await db
      .insert(creditEntries)
      .values([
        { organizationId: orgA, entryType: "grant", balanceType: "purchased", amount: 100 },
        { organizationId: orgB, entryType: "grant", balanceType: "purchased", amount: 999 },
      ])
      .returning();
    grantA = g!.id;
  });
  afterAll(async () => {
    await pool.end();
  });

  it("uma organização só lê as suas próprias linhas", async () => {
    const seen = await withTenant(db, orgA, async (tx) => ({
      credits: await tx.select().from(creditEntries),
      orgs: await tx.select().from(organizations),
      members: await tx.select().from(organizationMembers),
    }));
    expect(seen.credits.map((c) => c.organizationId)).toEqual([orgA]);
    expect(seen.orgs.map((o) => o.id)).toEqual([orgA]);
    expect(seen.members.every((m) => m.organizationId === orgA)).toBe(true);
  });

  it("sem contexto de organização não se vê nada", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE bigstock_app`);
      return tx.select().from(creditEntries);
    });
    expect(rows).toHaveLength(0);
  });

  it("não escreve em nome de outra organização", async () => {
    await expect(
      withTenant(db, orgA, (tx) =>
        tx.insert(creditEntries).values({ organizationId: orgB, entryType: "grant", balanceType: "purchased", amount: 1 }),
      ),
    ).rejects.toThrow();
  });

  it("credit_entries e audit_events são append-only (UPDATE/DELETE falham)", async () => {
    await expectAppendOnly(db.update(creditEntries).set({ amount: 1 }).where(sql`id = ${grantA}`));
    await expectAppendOnly(db.delete(creditEntries).where(sql`id = ${grantA}`));
    await db.insert(auditEvents).values({ organizationId: orgA, action: "test" });
    await expectAppendOnly(db.delete(auditEvents));
    await expect(withTenant(db, orgA, (tx) => tx.update(creditEntries).set({ amount: 1 }))).rejects.toThrow();
  });

  it("idempotency_key é única por organização", async () => {
    const row = { entryType: "grant", balanceType: "purchased", amount: 5, idempotencyKey: `k-${Date.now()}` } as const;
    await db.insert(creditEntries).values({ ...row, organizationId: orgA });
    await db.insert(creditEntries).values({ ...row, organizationId: orgB });
    await expect(db.insert(creditEntries).values({ ...row, organizationId: orgA })).rejects.toThrow();
  });
});
