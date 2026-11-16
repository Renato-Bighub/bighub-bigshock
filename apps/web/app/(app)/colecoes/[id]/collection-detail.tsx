"use client";

import type { CollectionDto, LibraryAssetDto } from "@bigstock/contracts";
import { Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, apiGet, errorMessage } from "@/lib/api";

export function CollectionDetail({ orgId, canWrite, canManage, collection, initial, nextCursor }: {
  orgId: string; canWrite: boolean; canManage: boolean; collection: CollectionDto; initial: LibraryAssetDto[]; nextCursor: string | null;
}) {
  const router = useRouter();
  const [col, setCol] = useState(collection);
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const base = `/v1/organizations/${orgId}/collections/${col.id}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ data: CollectionDto }>(base, { name: name.trim(), description: description.trim() || null }, "PATCH");
      setCol(r.data);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove() {
    if (!window.confirm(`Apagar a coleção “${col.name}”? As imagens não são apagadas.`)) return;
    try {
      await api(base, undefined, "DELETE");
      router.push("/colecoes");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeItem(assetId: string) {
    setError(null);
    try {
      await api(`${base}/items/${assetId}`, undefined, "DELETE");
      setItems((p) => p.filter((x) => x.id !== assetId));
      setCol((c) => ({ ...c, item_count: Math.max(0, c.item_count - 1) }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function more() {
    if (!cursor) return;
    try {
      const r = await apiGet<{ data: LibraryAssetDto[]; pagination: { next_cursor: string | null } }>(`${base}/items?limit=24&cursor=${encodeURIComponent(cursor)}`);
      setItems((p) => [...p, ...r.data]);
      setCursor(r.pagination.next_cursor);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      {editing ? (
        <form onSubmit={save} className="flex max-w-2xl flex-col gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Nome" className="h-11 rounded-[9px] border border-nav/15 bg-white px-3 text-lg font-extrabold outline-0 focus:border-brand" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} aria-label="Descrição" placeholder="Descrição (opcional)" className="rounded-[9px] border border-nav/15 bg-white px-3 py-2 text-sm outline-0 focus:border-brand" />
          <div className="flex gap-2">
            <button disabled={!name.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-[#bd0024] disabled:opacity-60">Guardar</button>
            <button type="button" onClick={() => { setEditing(false); setName(col.name); setDescription(col.description ?? ""); }} className="rounded-lg border border-nav/20 bg-white px-4 py-2 text-sm font-bold">Cancelar</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">{col.name}</h1>
            <p className="mt-1 text-sm text-nav/60">{col.item_count} {col.item_count === 1 ? "imagem" : "imagens"}{col.description ? ` · ${col.description}` : ""}</p>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-lg border border-nav/20 bg-white px-3.5 py-2 text-sm font-bold hover:border-brand"><Pencil size={15} /> Editar</button>
              <button onClick={remove} className="flex items-center gap-1.5 rounded-lg border border-nav/20 bg-white px-3.5 py-2 text-sm font-bold text-brand hover:border-brand"><Trash2 size={15} /> Apagar</button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-4 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}

      {items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-nav/20 bg-white p-10 text-center">
          <p className="font-semibold">Esta coleção está vazia.</p>
          <p className="mt-1 text-sm text-nav/60">Abra uma imagem em Explorar e use “Guardar em coleção”.</p>
          <Link href="/explorar" className="mt-4 inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-[#bd0024]">Explorar imagens</Link>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {items.map((a) => (
            <li key={a.id} className="relative aspect-[3/2] overflow-hidden rounded-[10px] bg-gradient-to-br from-[#2b3440] to-[#11161d]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api${a.preview_url}`} alt={a.title} loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-8 text-xs font-bold text-white">{a.title}</span>
              {canWrite && <button type="button" aria-label={`Remover ${a.title} da coleção`} onClick={() => removeItem(a.id)} className="absolute top-2 right-2 rounded-full bg-white/90 p-2 text-nav hover:bg-white"><X size={16} /></button>}
            </li>
          ))}
        </ul>
      )}
      {cursor && <div className="mt-8 text-center"><button onClick={more} className="rounded-lg border border-nav/20 bg-white px-6 py-2.5 text-sm font-bold hover:border-brand">Carregar mais</button></div>}
    </>
  );
}
