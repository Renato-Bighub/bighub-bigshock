"use client";

import { Code2, Download, Folder, Heart, History, Home, Layers3, LifeBuoy, Search, Settings, Users, WandSparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./brand";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/explorar", label: "Explorar Imagens", icon: Search },
  { href: "/gerar", label: "Gerar com IA", icon: WandSparkles, tag: "Novo" },
  { href: "/colecoes", label: "Coleções", icon: Folder },
  { href: "/favoritos", label: "Favoritos", icon: Heart },
  { href: "/downloads", label: "Downloads", icon: Download },
  { href: "/historico", label: "Histórico de Geração", icon: History },
  { href: "/api", label: "Integração via API", icon: Code2 },
  { href: "/planos", label: "Planos e Créditos", icon: Layers3 },
  { href: "/equipa", label: "Equipa", icon: Users },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
// Só dashboard, explorar, downloads, planos e equipa existem nesta fase; os restantes módulos chegam com as fases seguintes.
const AVAILABLE = new Set(["/dashboard", "/explorar", "/downloads", "/planos", "/equipa"]);

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-70 flex w-62 flex-col overflow-y-auto bg-linear-to-b from-[#0a0d11] to-[#11161d] px-[9px] pt-3 pb-2.5 text-white shadow-[5px_0_18px_rgba(8,10,12,.11)] transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="flex min-h-[83px] items-center justify-between px-7 pt-0.5 pb-7">
        <Logo />
        <button aria-label="Fechar menu" onClick={onClose} className="rounded-lg p-2 hover:bg-white/10 lg:hidden">
          <X size={23} />
        </button>
      </div>
      <nav aria-label="Menu principal" className="flex flex-col gap-[3px]">
        {NAV.map(({ href, label, icon: Icon, tag }) => {
          const base = "relative flex min-h-12 w-full items-center gap-[17px] rounded-[10px] px-[18px] py-3 text-left text-sm font-semibold transition";
          const content = (
            <>
              <Icon size={22} strokeWidth={1.95} className="shrink-0" />
              <span>{label}</span>
              {tag && <small className="ml-auto rounded-[7px] bg-[#e8002c] px-2 py-[3px] text-[11px] font-bold">{tag}</small>}
            </>
          );
          if (!AVAILABLE.has(href)) {
            return (
              <span key={href} aria-disabled="true" title="Disponível em breve" className={`${base} cursor-not-allowed text-white/40`}>
                {content}
              </span>
            );
          }
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`${base} ${active ? "bg-linear-to-r from-[#cc0024] to-[#f00739] shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)]" : "text-[#f1f2f4] hover:bg-white/[.085]"}`}
            >
              {content}
            </Link>
          );
        })}
      </nav>
      <div className="min-h-5 flex-1" />
      <div className="mx-px mb-[9px] rounded-[14px] bg-linear-to-br from-[#353a45] to-[#252b35] p-[15px_11px_13px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)]">
        <div className="mb-[18px] flex items-start gap-2.5">
          <LifeBuoy size={27} className="shrink-0" />
          <div>
            <strong className="block text-[13px]">Precisa de ajuda?</strong>
            <small className="mt-0.5 block text-xs text-[#e1e1e5]">Aceda à central de suporte</small>
          </div>
        </div>
        <button disabled title="Disponível em breve" className="w-full cursor-not-allowed rounded-[9px] bg-linear-to-b from-white to-[#e3e5e9] p-2.5 text-xs font-extrabold text-[#18191d] opacity-90">
          Falar com o suporte
        </button>
      </div>
      <div className="text-center text-[10px] text-[#777e87]">BIGstock by BIGhub</div>
    </aside>
  );
}
