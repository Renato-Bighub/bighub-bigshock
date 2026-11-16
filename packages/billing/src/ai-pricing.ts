/**
 * Custo em créditos das operações de IA. Funções puras; o backend recalcula sempre
 * (nunca confia no valor mostrado/enviado pelo cliente). Valores PLACEHOLDER até decisão comercial.
 */
export const AI_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
export const AI_QUALITIES = ["standard", "high"] as const;
export type AiSize = (typeof AI_SIZES)[number];
export type AiQuality = (typeof AI_QUALITIES)[number];
export type AiKind = "generate" | "edit";

const BASE: Record<AiSize, number> = { "1024x1024": 10, "1536x1024": 15, "1024x1536": 15 };
const QUALITY_MULTIPLIER: Record<AiQuality, number> = { standard: 1, high: 3 };
const EDIT_SURCHARGE = 5;

export function estimateAiCost(input: { kind: AiKind; size: AiSize; quality: AiQuality }): number {
  const base = BASE[input.size] * QUALITY_MULTIPLIER[input.quality];
  return base + (input.kind === "edit" ? EDIT_SURCHARGE : 0);
}

export function aiPricingTable() {
  return AI_SIZES.flatMap((size) =>
    AI_QUALITIES.map((quality) => ({ size, quality, generate: estimateAiCost({ kind: "generate", size, quality }), edit: estimateAiCost({ kind: "edit", size, quality }) })),
  );
}
