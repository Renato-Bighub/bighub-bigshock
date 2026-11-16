"use client";

import { Check, ChevronDown, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { useLocale, useT } from "./provider";

export function setLocaleCookie(code: Locale) {
  const host = window.location.hostname;
  const domain = host === "bigstock.tech" || host.endsWith(".bigstock.tech") ? "; domain=.bigstock.tech" : "";
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax${domain}`;
}

/** Seletor de idioma (PT, EN, ES, FR, DE), no mesmo desenho do seletor do site bigstock.tech. */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onClick); };
  }, [open]);

  function choose(code: Locale) {
    setLocaleCookie(code);
    setOpen(false);
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("Alterar idioma")}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-[#e0e3e9] bg-white px-3.5 py-2 text-sm font-bold text-nav shadow-sm transition hover:border-nav/30"
      >
        <Globe size={19} strokeWidth={1.8} />
        <span className="uppercase">{locale}</span>
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul role="listbox" aria-label={t("Escolher idioma")} className="absolute top-[calc(100%+8px)] right-0 z-[100] w-[240px] rounded-2xl border border-[#e7e9ed] bg-white p-2 text-nav shadow-[0_14px_48px_rgba(0,0,0,.17)]">
          {LOCALES.map((l) => {
            const on = l.code === locale;
            return (
              <li key={l.code} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => choose(l.code)}
                  className={`flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left text-[15px] font-bold transition ${on ? "bg-brand/8 text-brand" : "hover:bg-surface"}`}
                >
                  <span className={`w-7 text-xs font-bold uppercase ${on ? "text-brand" : "text-nav/40"}`}>{l.code}</span>
                  <span className="flex-1">{l.native}</span>
                  {on && <Check size={18} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
