"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { format, type Locale } from "@/lib/i18n/config";
import { setRuntimeMessages } from "@/lib/i18n/runtime";
import type { Messages } from "@/lib/i18n/messages";

type Ctx = { locale: Locale; messages: Messages };
const I18nContext = createContext<Ctx>({ locale: "pt", messages: {} });

export function I18nProvider({ locale, messages, children }: Ctx & { children: React.ReactNode }) {
  if (typeof window !== "undefined") setRuntimeMessages(messages);
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

/** Tradutor para atributos e textos dinâmicos: t("Texto em português", { n: 3 }). */
export function useT() {
  const { messages } = useContext(I18nContext);
  return useCallback((text: string, vars?: Record<string, string | number>) => format(messages[text] ?? text, vars), [messages]);
}

/** <T>Texto em português</T>: traduz o texto de um nó JSX. */
export function T({ children, v }: { children: string; v?: Record<string, string | number> }) {
  const t = useT();
  return <>{t(children, v)}</>;
}
