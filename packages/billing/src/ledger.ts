import type { BalanceType, CreditEntryType } from "@bigstock/contracts";

/**
 * Livro de movimentos de créditos. Não existe coluna "balance": o saldo é
 * sempre a soma das entradas (CLAUDE.md §4). Funções puras, sem I/O.
 */
export interface CreditEntry {
  id: string;
  organizationId: string;
  entryType: CreditEntryType;
  balanceType: BalanceType;
  /** Com sinal: grant > 0, reserve < 0, release > 0, consume = 0 (marca de fecho). */
  amount: number;
  /** Para reserve/release/consume: o grant de origem. */
  sourceEntryId: string | null;
  reservationId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export class InsufficientCreditsError extends Error {
  readonly code = "insufficient_credits";
  constructor(readonly required: number, readonly available: number) {
    super(`insufficient_credits: required ${required}, available ${available}`);
  }
}

/** Prioridade de consumo: promocional → assinatura → comprado → empresarial. */
export const BALANCE_PRIORITY: readonly BalanceType[] = [
  "promotional",
  "subscription",
  "purchased",
  "enterprise",
];

const isExpired = (g: CreditEntry, now: Date) => g.expiresAt !== null && g.expiresAt <= now;

/** Saldo restante de cada grant (grant + reservas/liberações que o referenciam). */
export function grantRemaining(entries: readonly CreditEntry[], now: Date) {
  const grants = entries.filter((e) => e.entryType === "grant");
  return grants
    .map((g) => {
      const movements = entries
        .filter((e) => e.sourceEntryId === g.id)
        .reduce((sum, e) => sum + e.amount, 0);
      return { grant: g, remaining: isExpired(g, now) ? 0 : g.amount + movements };
    })
    .filter((r) => r.remaining > 0);
}

export function availableBalance(entries: readonly CreditEntry[], now: Date): number {
  return grantRemaining(entries, now).reduce((s, r) => s + r.remaining, 0);
}

export interface Allocation {
  sourceEntryId: string;
  balanceType: BalanceType;
  amount: number;
}

/**
 * Planeia a reserva: tipo por prioridade, depois FIFO por expires_at mais
 * próximo (sem validade por último). Falha antes de qualquer job.
 */
export function planReservation(
  entries: readonly CreditEntry[],
  cost: number,
  now: Date,
): Allocation[] {
  if (!Number.isInteger(cost) || cost <= 0) throw new RangeError("cost must be a positive integer");
  const available = availableBalance(entries, now);
  if (available < cost) throw new InsufficientCreditsError(cost, available);

  const ordered = grantRemaining(entries, now).sort((a, b) => {
    const byType = BALANCE_PRIORITY.indexOf(a.grant.balanceType) - BALANCE_PRIORITY.indexOf(b.grant.balanceType);
    if (byType !== 0) return byType;
    const ea = a.grant.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const eb = b.grant.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return ea - eb || a.grant.createdAt.getTime() - b.grant.createdAt.getTime();
  });

  const allocations: Allocation[] = [];
  let left = cost;
  for (const { grant, remaining } of ordered) {
    if (left === 0) break;
    const take = Math.min(left, remaining);
    allocations.push({ sourceEntryId: grant.id, balanceType: grant.balanceType, amount: take });
    left -= take;
  }
  return allocations;
}

type NewEntry = Omit<CreditEntry, "id" | "createdAt">;

/** Reserva = entradas negativas (nunca um débito definitivo). */
export function buildReserveEntries(
  organizationId: string,
  reservationId: string,
  allocations: readonly Allocation[],
): NewEntry[] {
  return allocations.map((a) => ({
    organizationId,
    entryType: "reserve" as const,
    balanceType: a.balanceType,
    amount: -a.amount,
    sourceEntryId: a.sourceEntryId,
    reservationId,
    expiresAt: null,
  }));
}

/** Falha técnica sem entrega → devolve o valor reservado (novas linhas, nunca UPDATE). */
export function buildReleaseEntries(reserves: readonly CreditEntry[]): NewEntry[] {
  return reserves
    .filter((r) => r.entryType === "reserve")
    .map((r) => ({
      organizationId: r.organizationId,
      entryType: "release" as const,
      balanceType: r.balanceType,
      amount: -r.amount,
      sourceEntryId: r.sourceEntryId,
      reservationId: r.reservationId,
      expiresAt: null,
    }));
}

/** Sucesso → fecha a reserva como consume (marca de valor 0; o débito já existe). */
export function buildConsumeEntries(reserves: readonly CreditEntry[]): NewEntry[] {
  return reserves
    .filter((r) => r.entryType === "reserve")
    .map((r) => ({
      organizationId: r.organizationId,
      entryType: "consume" as const,
      balanceType: r.balanceType,
      amount: 0,
      sourceEntryId: r.sourceEntryId,
      reservationId: r.reservationId,
      expiresAt: null,
    }));
}
