import { HttpException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  and,
  creditEntries,
  desc,
  eq,
  sql,
  withTenant,
  type Database,
  type Tx,
} from "@bigstock/database";
import {
  availableBalance,
  buildConsumeEntries,
  buildReleaseEntries,
  buildReserveEntries,
  InsufficientCreditsError,
  planReservation,
  type CreditEntry,
} from "@bigstock/billing";
import type { BalanceType } from "@bigstock/contracts";
import { DB } from "../database.module.js";
import { decodeCursor, encodeCursor } from "../catalog/cursor.js";

/**
 * Carteira de créditos de IA: livro de movimentos, nunca uma coluna de saldo (CLAUDE.md §4).
 * Toda mutação corre numa transação com lock por organização, para que reservas
 * concorrentes nunca levem o saldo a negativo.
 */
@Injectable()
export class CreditsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private lock(tx: Tx, orgId: string) {
    return tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${orgId}, 0))`);
  }

  private async load(tx: Tx, orgId: string): Promise<CreditEntry[]> {
    return (await tx.select().from(creditEntries).where(eq(creditEntries.organizationId, orgId))) as CreditEntry[];
  }

  async balance(orgId: string): Promise<number> {
    return withTenant(this.db, orgId, async (tx) => availableBalance(await this.load(tx, orgId), new Date()));
  }

  /** Concede créditos. Idempotente por (organização, idempotencyKey): repetir não duplica. */
  async grant(
    orgId: string,
    input: { balanceType: BalanceType; amount: number; expiresAt: Date | null; idempotencyKey: string },
  ): Promise<{ granted: boolean }> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new RangeError("amount must be a positive integer");
    return withTenant(this.db, orgId, async (tx) => {
      const rows = await tx
        .insert(creditEntries)
        .values({
          organizationId: orgId,
          entryType: "grant",
          balanceType: input.balanceType,
          amount: input.amount,
          expiresAt: input.expiresAt,
          idempotencyKey: input.idempotencyKey,
        })
        .onConflictDoNothing()
        .returning({ id: creditEntries.id });
      return { granted: rows.length > 0 };
    });
  }

  /** Reserva (nunca débito direto). Idempotente por reservationId. Falha com 402 insufficient_credits. */
  async reserve(orgId: string, reservationId: string, amount: number) {
    try {
      return await withTenant(this.db, orgId, async (tx) => {
        await this.lock(tx, orgId);
        const entries = await this.load(tx, orgId);
        const existing = entries.filter((e) => e.reservationId === reservationId && e.entryType === "reserve");
        if (existing.length > 0) return { reservationId, reserved: -existing.reduce((s, e) => s + e.amount, 0), created: false };
        const plan = planReservation(entries, amount, new Date());
        const rows = buildReserveEntries(orgId, reservationId, plan);
        await tx.insert(creditEntries).values(rows);
        return { reservationId, reserved: amount, created: true };
      });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        throw new HttpException({ code: "insufficient_credits", message: `Required ${e.required}, available ${e.available}` }, 402);
      }
      throw e;
    }
  }

  private async close(orgId: string, reservationId: string, mode: "consume" | "release"): Promise<{ changed: boolean }> {
    return withTenant(this.db, orgId, async (tx) => {
      await this.lock(tx, orgId);
      const entries = await this.load(tx, orgId);
      const mine = entries.filter((e) => e.reservationId === reservationId);
      const reserves = mine.filter((e) => e.entryType === "reserve");
      const closed = mine.some((e) => e.entryType === "consume" || e.entryType === "release");
      if (reserves.length === 0 || closed) return { changed: false };
      const rows = mode === "consume" ? buildConsumeEntries(reserves) : buildReleaseEntries(reserves);
      await tx.insert(creditEntries).values(rows);
      return { changed: true };
    });
  }

  /** Sucesso da operação: fecha a reserva como consumo definitivo. */
  consume(orgId: string, reservationId: string) {
    return this.close(orgId, reservationId, "consume");
  }

  /** Falha técnica sem entrega: devolve o valor reservado. */
  release(orgId: string, reservationId: string) {
    return this.close(orgId, reservationId, "release");
  }

  async ledger(orgId: string, limit: number, cursor?: string) {
    const cur = decodeCursor<{ t: string; id: string }>(cursor);
    const rows = await withTenant(this.db, orgId, (tx) =>
      tx
        .select({
          id: creditEntries.id,
          type: creditEntries.entryType,
          balanceType: creditEntries.balanceType,
          amount: creditEntries.amount,
          expiresAt: creditEntries.expiresAt,
          createdAt: creditEntries.createdAt,
          created: sql<string>`${creditEntries.createdAt}::text`,
        })
        .from(creditEntries)
        .where(
          and(
            eq(creditEntries.organizationId, orgId),
            cur ? sql`(${creditEntries.createdAt}, ${creditEntries.id}) < (${cur.t}::timestamptz, ${cur.id}::uuid)` : undefined,
          ),
        )
        .orderBy(desc(creditEntries.createdAt), desc(creditEntries.id))
        .limit(limit + 1),
    );
    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const last = page.at(-1);
    return {
      data: page.map((r) => ({
        id: r.id,
        type: r.type,
        balance_type: r.balanceType,
        amount: r.amount,
        expires_at: r.expiresAt?.toISOString() ?? null,
        created_at: r.createdAt.toISOString(),
      })),
      has_more: hasMore,
      next_cursor: hasMore && last ? encodeCursor({ t: last.created, id: last.id }) : null,
    };
  }

  newReservationId() {
    return randomUUID();
  }
}
