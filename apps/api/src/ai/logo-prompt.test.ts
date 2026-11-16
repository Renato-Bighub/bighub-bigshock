import { describe, expect, it } from "vitest";
import type { LogoBrief } from "@bigstock/contracts";
import { buildLogoPrompt } from "./logo-prompt.js";

const base: LogoBrief = { brandName: "Aurora", sector: "padaria artesanal", style: "minimalista", type: "simbolo_e_nome", colors: [] };

describe("buildLogoPrompt", () => {
  it("fixa as regras de qualidade e o texto exato da marca", () => {
    const p = buildLogoPrompt({ ...base, colors: [] });
    expect(p).toContain('"Aurora"');
    expect(p).toContain("flat vector-style");
    expect(p).toContain("pure white");
    expect(p).toContain("at most 3");
  });
  it("com cores definidas restringe a paleta", () => {
    expect(buildLogoPrompt({ ...base, colors: ["#C5001F", "#111111"] })).toContain("#C5001F, #111111");
  });
  it("só símbolo: proíbe texto", () => {
    expect(buildLogoPrompt({ ...base, type: "so_simbolo" })).toContain("no text");
  });
  it("inclui direção criativa extra", () => {
    expect(buildLogoPrompt(base, "inspirado em trigo")).toContain("inspirado em trigo");
  });
});
