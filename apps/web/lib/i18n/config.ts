export const LOCALES = [
  { code: "pt", label: "Português", native: "Português", intl: "pt-PT", flag: "🇵🇹" },
  { code: "en", label: "English", native: "English", intl: "en-GB", flag: "🇬🇧" },
  { code: "es", label: "Español", native: "Español", intl: "es-ES", flag: "🇪🇸" },
  { code: "fr", label: "Français", native: "Français", intl: "fr-FR", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", native: "Deutsch", intl: "de-DE", flag: "🇩🇪" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "pt";
export const LOCALE_COOKIE = "bs_lang";

export const isLocale = (v: unknown): v is Locale => LOCALES.some((l) => l.code === v);
export const intlLocale = (l: Locale) => LOCALES.find((x) => x.code === l)!.intl;

/** Escolhe o idioma a partir do cabeçalho Accept-Language (primeiro idioma suportado). */
export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  for (const part of (header ?? "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return null;
}

/** Substitui {nome} pelos valores. */
export function format(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
