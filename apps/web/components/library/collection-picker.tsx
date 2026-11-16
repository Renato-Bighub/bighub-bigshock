"use client";

import type { CollectionDto } from "@bigstock/contracts";
import { Check, FolderPlus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api, apiGet, errorMessage } from "@/lib/api";

/** Escolhe a coleção onde guardar um ativo (ou cria uma nova). Adicionar é idempotente. */
export function CollectionPicker({ orgId, assetId, onClose }: { orgId: string; assetId: string; onClose: () => void }) {
  const [collections, setCollections] = useState<CollectionDto[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: CollectionDto[] }>(`/v1/organizations/${orgId}/collections`)
      .then((r) => setCollections(r.data))
      .catch((e) => { setError(errorMessage(e)); setCollections([]); });
  }, [orgId]);

  async function add(collectionId: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/organizations/${orgId}/collections/${collectionId}/items/${assetId}`, undefined, "PUT");
      setAdded((s) => new Set(s).add(collectionId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ data: CollectionDto }>(`/v1/organizations/${orgId}/collections`, { name: name.trim() });
      setCollections((c) => [r.data, ...(c ?? [])]);
      setName("");
      await api(`/v1/organizations/${orgId}/collections/${r.data.id}/items/${assetId}`, undefined, "PUT");
      setAdded((s) => new Set(s).add(r.data.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="group" aria-label="Guardar em coleção" className="mt-3 rounded-lg border border-nav/15 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold"><FolderPlus size={16} /> Guardar em coleção</span>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-nav/60 hover:text-nav">Fechar</button>
      </div>
      {collections === null ? (
        <p className="text-sm text-nav/60">A carregar…</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-auto">
          {collections.length === 0 && <li className="text-sm text-nav/60">Ainda não tem coleções.</li>}
          {collections.map((c) => (
            <li key={c.id}>
              <button type="button" disabled={busy} onClick={() => add(c.id)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface disabled:opacity-60">
                <span className="truncate">{c.name} <small className="text-nav/50">({c.item_count})</small></span>
                {added.has(c.id) && <Check size={16} className="shrink-0 text-green-600" aria-label="Adicionado" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={create} className="mt-2 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nova coleção…" aria-label="Nome da nova coleção" className="min-w-0 flex-1 rounded-md border border-nav/20 px-2.5 py-1.5 text-sm outline-0 focus:border-brand" />
        <button disabled={busy || !name.trim()} aria-label="Criar coleção e adicionar" className="rounded-md bg-brand px-2.5 text-white hover:bg-[#bd0024] disabled:opacity-60"><Plus size={16} /></button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-brand">{error}</p>}
    </div>
  );
}
