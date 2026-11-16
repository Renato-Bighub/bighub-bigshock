import type { LogoBrief } from "@bigstock/contracts";

const STYLE: Record<LogoBrief["style"], string> = {
  minimalista: "minimalist: reduce the mark to its essential idea, few shapes, generous negative space, confident simplicity",
  moderno: "modern and contemporary: clean geometry, balanced proportions, a subtle sense of motion, tech-forward feel",
  classico: "classic and timeless: refined proportions, elegant serif lettering, a sense of heritage and trust",
  geometrico: "geometric: built from circles, squares and triangles on a clear grid, precise and systematic",
  manuscrito: "hand-lettered: a custom brush or script wordmark with natural rhythm, warm and personal, still perfectly legible",
  mascote: "mascot: a friendly, simplified character with a distinctive silhouette, bold outlines, flat colour fills",
  emblema: "emblem/badge: the symbol and name enclosed in a compact crest or seal shape, balanced and symmetrical",
};

const TYPE: Record<LogoBrief["type"], (name: string) => string> = {
  simbolo_e_nome: (n) => `a combination mark: a distinctive symbol with the brand name "${n}" set beside or below it as a harmonised lockup`,
  monograma: (n) => `a monogram built from the initial letter(s) of "${n}", designed as one cohesive, memorable shape`,
  so_nome: (n) => `a wordmark: only the text "${n}" in custom, carefully kerned lettering, with one subtle distinctive detail`,
  so_simbolo: () => `a symbol-only mark (pictorial or abstract) with no text at all`,
};

/**
 * Prompt de logo montado no servidor a partir de um briefing validado. Concentra as regras de
 * qualidade (vetorial plano, fundo liso, margem de segurança, paleta limitada, legibilidade
 * em tamanho pequeno) para que a web e a API pública obtenham sempre o mesmo resultado.
 */
export function buildLogoPrompt(brief: LogoBrief, extra?: string): string {
  const name = brief.brandName.trim();
  const hasText = brief.type !== "so_simbolo";
  const colors = brief.colors.length
    ? `Use exactly this palette and nothing else: ${brief.colors.join(", ")} (plus pure white or near-black only if needed for contrast).`
    : "Choose a refined palette of at most 3 harmonious colours suited to the sector, with strong contrast.";
  const lines = [
    `Design a professional, production-ready brand logo for "${name}", a business in the sector: ${brief.sector}.`,
    `Deliverable: ${TYPE[brief.type](name)}.`,
    `Style: ${STYLE[brief.style]}.`,
    brief.tagline && hasText ? `Do not render the tagline "${brief.tagline}" inside the logo; keep the mark clean.` : "",
    colors,
    "Craft requirements: flat vector-style artwork with crisp, perfectly smooth edges; solid colour fills only; no gradients, no drop shadows, no glows, no textures, no 3D or photographic effects.",
    "The mark must be simple enough to stay recognisable at 32px, work in a single colour, and be unmistakably original — avoid clichés and generic stock icons.",
    "Composition: a single logo centred on a plain pure white (#FFFFFF) background, with generous empty margin (at least 15% on every side), perfectly aligned and optically balanced. Show only the logo — no mockups, no business cards, no extra objects, no borders, no watermark.",
    hasText ? `Typography: the text must read exactly "${name}" — correct spelling, no extra or duplicated words, no placeholder text, even letter spacing and clean baseline.` : "There must be no text, letters or numbers anywhere in the image.",
    extra?.trim() ? `Additional creative direction from the client: ${extra.trim()}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
