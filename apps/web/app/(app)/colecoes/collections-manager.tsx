"use client";

import type { CollectionDto } from "@bigstock/contracts";
import { Folder, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { T, useT } from "@/components/i18n/provider";

export function CollectionsManager({ orgId, canWrite, initial }: { orgId: string; canWrite: boolean; initial: CollectionDto[] }) {
  const t = useT();
  const [items, setItems] = useState(initial);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ data: CollectionDto }>(`/v1/organizations/${orgId}/collections`, { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) });
      setItems((p) => [r.data, ...p]);
      setName("");
      setDescription("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {canWrite && (
        <form onSubmit={create} className="mb-6 flex max-w-3xl flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t("Nome da nova coleção")} aria-label={t("Nome da coleção")} className="h-11 min-w-48 flex-1 rounded-[9px] border border-nav/15 bg-white px-3 text-sm outline-0 focus:border-brand" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder={t("Descrição (opcional)")} aria-label={t("Descrição")} className="h-11 min-w-48 flex-[2] rounded-[9px] border border-nav/15 bg-white px-3 text-sm outline-0 focus:border-brand" />
          <button disabled={busy || !name.trim()} className="flex h-11 items-center gap-1.5 rounded-[9px] bg-brand px-4 text-sm font-bold text-white hover:bg-[#bd0024] disabled:opacity-60"><Plus size={16} /> <T>Criar coleção</T></button>
        </form>
      )}
      {error && <p role="alert" className="mb-4 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-nav/20 bg-white p-10 text-center">
          <Folder className="mx-auto text-nav/30" size={32} />
          <p className="mt-3 font-semibold"><T>Ainda não tem coleções.</T></p>
          <p className="mt-1 text-sm text-nav/60">{canWrite ? t("Crie a primeira acima e guarde imagens a partir do Explorar.") : t("Peça a um membro da equipa para criar uma.")}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {items.map((c) => (
            <li key={c.id}>
              <Link href={`/colecoes/${c.id}`} className="group block overflow-hidden rounded-[12px] border border-nav/10 bg-white hover:border-brand">
                <div className="aspect-[16/9] bg-gradient-to-br from-[#2b3440] to-[#11161d]">
                  {c.cover_preview_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api${c.cover_preview_url}`} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-white/30"><Folder size={36} /></div>
                  )}
                </div>
                <div className="p-3.5">
                  <h2 className="truncate font-extrabold">{c.name}</h2>
                  <p className="mt-0.5 text-xs text-nav/60">{c.item_count} {c.item_count === 1 ? "imagem" : "imagens"}</p>
                  {c.description && <p className="mt-1.5 line-clamp-2 text-sm text-nav/70">{c.description}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
