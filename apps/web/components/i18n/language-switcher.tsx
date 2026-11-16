"use client";

import { Check, Globe, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { T, useLocale, useT } from "./provider";

export function setLocaleCookie(code: Locale) {
  const host = window.location.hostname;
  const domain = host === "bigstock.tech" || host.endsWith(".bigstock.tech") ? "; domain=.bigstock.tech" : "";
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax${domain}`;
}

/** Botão + modal de seleção de idioma (PT, EN, ES, FR, DE). */
export function LanguageSwitcher({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function choose(code: Locale) {
    setLocaleCookie(code);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("Alterar idioma")}
        className={`flex items-center gap-1.5 rounded-lg p-2 text-sm font-bold uppercase ${variant === "dark" ? "text-white hover:bg-white/10" : "text-nav hover:bg-nav/5"}`}
      >
        <Globe size={20} /> <span className="hidden sm:inline">{locale}</span>
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={t("Escolher idioma")} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-nav shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold"><T>Escolher idioma</T></h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Fechar")} className="rounded-full p-1.5 hover:bg-surface"><X size={18} /></button>
            </div>
            <ul className="space-y-1.5">
              {LOCALES.map((l) => (
                <li key={l.code}>
                  <button
                    type="button"
                    onClick={() => choose(l.code)}
                    aria-current={l.code === locale}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition ${l.code === locale ? "border-brand bg-brand/5" : "border-nav/10 hover:border-nav/30"}`}
                  >
                    <span className="text-xl" aria-hidden>{l.flag}</span>
                    <span className="flex-1">{l.native}</span>
                    {l.code === locale && <Check size={17} className="text-brand" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
