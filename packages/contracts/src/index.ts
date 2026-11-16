import { z } from "zod";

export const uuid = z.uuid();

/** Paginação por cursor (CLAUDE.md §5). */
export const paginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export const paginationMeta = z.object({
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});

/** Toda operação paga exige Idempotency-Key. */
export const idempotencyKey = z.string().min(8).max(128);

export const healthResponse = z.object({
  status: z.literal("ok"),
  request_id: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponse>;

export const errorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  request_id: z.string(),
});
export type ErrorResponse = z.infer<typeof errorResponse>;

export const balanceTypes = ["promotional", "subscription", "purchased", "enterprise"] as const;
export type BalanceType = (typeof balanceTypes)[number];

export const creditEntryTypes = ["grant", "reserve", "release", "consume", "expire"] as const;
export type CreditEntryType = (typeof creditEntryTypes)[number];

export const QUEUES = { aiGeneration: "ai-generation" } as const;

/** Payload do job de geração. O custo NUNCA vem do cliente: é recalculado no backend. */
export const aiGenerationJob = z.object({
  organizationId: uuid,
  aiJobId: uuid,
  reservationId: uuid,
});
export type AiGenerationJob = z.infer<typeof aiGenerationJob>;
