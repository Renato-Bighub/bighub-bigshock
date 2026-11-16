"use client";

import { Bell, Check, ChevronDown, Crown, LogOut, Menu, Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import type { ShellUser } from "./app-shell";

const ROLES: Record<string, string> = { owner: "Proprietário", admin: "Administrador", member: "Membro", billing: "Faturação" };

export function Topbar({ user, onMenu }: { user: ShellUser; onMenu: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function switchOrg(id: string) {
    document.cookie = `bs_org=${id}; path=/; max-age=31536000; samesite=lax`;
    setOpen(false);
    router.refresh();
  }

  async function logout() {
    await api("/v1/auth/logout").catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 flex h-[70px] items-center justify-between gap-6 bg-nav px-4 py-2.5 text-white sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-[18px]">
        <button aria-label="Abrir menu" onClick={onMenu} className="rounded-lg p-2 hover:bg-white/10 lg:hidden">
          <Menu size={26} />
        </button>
        <form role="search" onSubmit={(e) => { e.preventDefault(); const q = String(new FormData(e.currentTarget).get("q") ?? "").trim(); router.push(q ? `/explorar?q=${encodeURIComponent(q)}` : "/explorar"); }} className="flex h-11 max-w-[940px] min-w-0 flex-1 overflow-hidden rounded-[9px] bg-white">
          <input
            name="q"
            aria-label="Pesquisar imagens, vetores ou modelos"
            placeholder="Pesquisar imagens, vetores ou modelos..."
            className="min-w-0 flex-1 bg-white px-[17px] text-[15px] text-[#20222a] outline-0 placeholder:text-[#7a7c87]"
          />
          <button type="submit" aria-label="Pesquisar" className="flex w-[62px] shrink-0 items-center justify-center bg-brand transition hover:bg-[#bd0024]">
            <Search size={22} />
          </button>
        </form>
      </div>
      <div className="flex shrink-0 items-center gap-[13px]">
        <button aria-label="Notificações" className="relative hidden rounded-lg p-2 hover:bg-white/10 sm:block">
          <Bell size={24} />
        </button>
        <div className="hidden h-[31px] w-px bg-[#30343a] sm:block" />
        <div className="relative">
          <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-[11px] py-[3px] text-left">
            <span className="flex size-[42px] items-center justify-center rounded-full border-2 border-[#f7f8fa] bg-white text-[#282c33]">
              <UserRound size={21} />
            </span>
            <span className="hidden min-w-[130px] flex-col sm:flex">
              <strong className="text-xs font-bold whitespace-nowrap">{user.name}</strong>
              <small className="mt-1 text-xs text-[#d8d9de]">{user.orgName} · {ROLES[user.role] ?? user.role}</small>
            </span>
            <ChevronDown size={18} />
          </button>
          {open && (
            <div className="absolute top-[calc(100%+17px)] right-0 z-60 w-[250px] rounded-xl border border-[#e7e9ed] bg-white p-2.5 text-[#16191d] shadow-[0_14px_48px_rgba(0,0,0,.17)]">
              {user.organizations.length > 1 && (
                <div className="mb-1 border-b border-[#eef0f3] pb-1">
                  <p className="px-2.5 py-1.5 text-[11px] font-bold text-[#7a7c87] uppercase">Organização</p>
                  {user.organizations.map((o) => (
                    <button key={o.id} onClick={() => switchOrg(o.id)} className="flex w-full items-center gap-2.5 rounded-[7px] p-[9px_10px] text-[13px] hover:bg-[#f4f5f7]">
                      <span className="flex-1 truncate text-left">{o.name}</span>
                      {o.id === user.orgId && <Check size={16} className="text-brand" />}
                    </button>
                  ))}
                </div>
              )}
              <button disabled className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-[7px] p-[11px_10px] text-[13px] opacity-50">
                <Crown size={17} /> Gerir plano
              </button>
              <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-[7px] p-[11px_10px] text-[13px] hover:bg-[#f4f5f7]">
                <LogOut size={17} /> Terminar sessão
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
