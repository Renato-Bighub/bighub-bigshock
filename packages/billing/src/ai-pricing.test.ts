import { describe, expect, it } from "vitest";
import { aiPricingTable, estimateAiCost } from "./ai-pricing";

describe("custo de IA", () => {
  it("é determinístico e positivo", () => {
    expect(estimateAiCost({ kind: "generate", size: "1024x1024", quality: "standard" })).toBe(10);
    expect(estimateAiCost({ kind: "generate", size: "1536x1024", quality: "high" })).toBe(45);
    expect(estimateAiCost({ kind: "edit", size: "1024x1024", quality: "standard" })).toBe(15);
    for (const row of aiPricingTable()) {
      expect(row.generate).toBeGreaterThan(0);
      expect(row.edit).toBeGreaterThan(row.generate);
    }
  });
});
