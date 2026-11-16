import { describe, expect, it } from "vitest";
import {
  availableBalance,
  buildReleaseEntries,
  buildReserveEntries,
  InsufficientCreditsError,
  planReservation,
  type CreditEntry,
} from "./ledger";

const org = "org-1";
const now = new Date("2026-06-01T00:00:00Z");
let n = 0;
const grant = (over: Partial<CreditEntry>): CreditEntry => ({
  id: `g${++n}`,
  organizationId: org,
  entryType: "grant",
  balanceType: "purchased",
  amount: 100,
  sourceEntryId: null,
  reservationId: null,
  expiresAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});
const days = (d: number) => new Date(now.getTime() + d * 86_400_000);
const materialize = (rows: Omit<CreditEntry, "id" | "createdAt">[]): CreditEntry[] =>
  rows.map((r) => ({ ...r, id: `e${++n}`, createdAt: now }));

describe("credit ledger", () => {
  it("saldo é a soma dos movimentos e ignora grants expirados", () => {
    const entries = [grant({ amount: 50 }), grant({ amount: 70, expiresAt: days(-1) })];
    expect(availableBalance(entries, now)).toBe(50);
  });

  it("falha com insufficient_credits sem alocar nada", () => {
    expect(() => planReservation([grant({ amount: 10 })], 11, now)).toThrow(InsufficientCreditsError);
  });

  it("respeita prioridade de tipo e depois FIFO por expires_at", () => {
    const purchased = grant({ balanceType: "purchased", amount: 100 });
    const subLate = grant({ balanceType: "subscription", amount: 30, expiresAt: days(30) });
    const subSoon = grant({ balanceType: "subscription", amount: 30, expiresAt: days(5) });
    const promo = grant({ balanceType: "promotional", amount: 20, expiresAt: days(60) });
    const plan = planReservation([purchased, subLate, subSoon, promo], 70, now);
    expect(plan.map((a) => [a.sourceEntryId, a.amount])).toEqual([
      [promo.id, 20],
      [subSoon.id, 30],
      [subLate.id, 20],
    ]);
  });

  it("reserva reduz o disponível e release devolve exatamente o valor", () => {
    const g = grant({ amount: 100 });
    const reserves = materialize(buildReserveEntries(org, "res-1", planReservation([g], 40, now)));
    expect(availableBalance([g, ...reserves], now)).toBe(60);
    const releases = materialize(buildReleaseEntries(reserves));
    expect(availableBalance([g, ...reserves, ...releases], now)).toBe(100);
  });

  it("nunca permite saldo negativo em reservas sucessivas", () => {
    const g = grant({ amount: 100 });
    const r1 = materialize(buildReserveEntries(org, "a", planReservation([g], 70, now)));
    expect(() => planReservation([g, ...r1], 40, now)).toThrow(InsufficientCreditsError);
  });
});
