"use client";

import type { AssetDto, AssetListResponse } from "@bigstock/contracts";
import { FolderPlus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CollectionPicker } from "@/components/library/collection-picker";
import { FavoriteButton } from "@/components/library/favorite-button";
import { api, apiGet, errorMessage } from "@/lib/api";

export interface Category { slug: string; namePt: string; nameEn: string }

export interface Terms { version: string; title: string; summary: string }

export function Explorer({ q, category, categories, initial, nextCursor, orgId, canLicense, terms, favoriteIds }: {
  q: string; category: string; categories: Category[]; initial: AssetDto[]; nextCursor: string | null;
  orgId: string | null; canLicense: boolean; terms: Terms | null; favoriteIds: string[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AssetDto | null>(null);
  const [licensing, setLicensing] = useState(false);
  const [favs, setFavs] = useState(() => new Set(favoriteIds));
  const [pickerOpen, setPickerOpen] = useState(false);
  const setFav = (id: string, on: boolean) => setFavs((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const [licenseError, setLicenseError] = useState<string | null>(null);
  // Uma chave por tentativa de licenciar o mesmo ativo: reenvios não duplicam a concessão.
  const [idemKeys] = useState(() => new Map<string, string>());

  const href = (next: { q?: string; category?: string }) => {
    const p = new URLSearchParams();
    const nq = next.q ?? q;
    const nc = next.category ?? category;
    if (nq) p.set("q", nq);
    if (nc) p.set("category", nc);
    return `/explorar${p.size ? `?${p}` : ""}`;
  };

  async function licenseAndDownload(asset: AssetDto) {
    if (!orgId) return;
    setLicensing(true);
    setLicenseError(null);
    try {
      const key = idemKeys.get(asset.id) ?? crypto.randomUUID();
      idemKeys.set(asset.id, key);
      const lic = await api<{ data: { id: string } }>(`/v1/organizations/${orgId}/licenses`, { assetId: asset.id }, "POST", { "Idempotency-Key": key });
      const dl = await api<{ data: { url: string } }>(`/v1/organizations/${orgId}/licenses/${lic.data.id}/download`);
      window.location.assign(`/api${dl.data.url}`);
    } catch (e) {
      setLicenseError(errorMessage(e));
    } finally {
      setLicensing(false);
    }
  }

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ limit: "24", cursor });
      if (q) p.set("q", q);
      if (category) p.set("category", category);
      const res = await apiGet<AssetListResponse>(`/v1/assets?${p}`);
      setItems((prev) => [...prev, ...res.data]);
      setCursor(res.pagination.next_cursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1880px] px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold">Explorar imagens</h1>
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); router.push(href({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() })); }}
        className="mt-4 flex h-12 max-w-2xl overflow-hidden rounded-[9px] border border-nav/15 bg-white"
      >
        <input name="q" defaultValue={q} aria-label="Pesquisar" placeholder="Pesquisar em português ou inglês…" className="min-w-0 flex-1 px-4 text-sm outline-0" />
        <button className="flex w-14 items-center justify-center bg-brand text-white hover:bg-[#bd0024]" aria-label="Pesquisar"><Search size={20} /></button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {[{ slug: "", namePt: "Todas" }, ...categories].map((c) => (
          <Link
            key={c.slug || "all"}
            href={href({ category: c.slug })}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${category === c.slug ? "border-brand bg-brand text-white" : "border-nav/20 bg-white hover:border-brand"}`}
          >
            {c.namePt}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="mt-10 text-nav/60">Nenhuma imagem encontrada{q ? ` para “${q}”` : ""}.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {items.map((a) => (
            <li key={a.id} className="relative">
              <button onClick={() => { setSelected(a); setLicenseError(null); setPickerOpen(false); }} className="group relative block aspect-[3/2] w-full overflow-hidden rounded-[10px] bg-gradient-to-br from-[#2b3440] to-[#11161d]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api${a.preview_url}`} alt={a.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-8 text-left text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">{a.title}</span>
              </button>
              {orgId && canLicense && (
                <FavoriteButton orgId={orgId} assetId={a.id} favorited={favs.has(a.id)} onChange={(on) => setFav(a.id, on)} onError={setError} className="absolute top-2 right-2 bg-white/90 p-2 text-nav hover:bg-white" />
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p role="alert" className="mt-4 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
      {cursor && (
        <div className="mt-8 text-center">
          <button onClick={loadMore} disabled={loading} className="rounded-lg border border-nav/20 bg-white px-6 py-2.5 text-sm font-bold hover:border-brand disabled:opacity-60">
            {loading ? "A carregar…" : "Carregar mais"}
          </button>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div role="dialog" aria-modal="true" aria-label={selected.title} className="grid max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white md:grid-cols-[1.4fr_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="flex min-h-64 items-center justify-center bg-nav"><img src={`/api${selected.preview_url}`} alt={selected.title} className="max-h-[80vh] w-full object-contain" /></div>
            <div className="relative p-6">
              <button aria-label="Fechar" onClick={() => setSelected(null)} className="absolute top-3 right-3 rounded-lg p-2 hover:bg-surface"><X size={20} /></button>
              <h2 className="pr-8 text-xl font-extrabold">{selected.title}</h2>
              {selected.description && <p className="mt-2 text-sm text-nav/70">{selected.description}</p>}
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex gap-2"><dt className="font-semibold">Dimensões:</dt><dd>{selected.width} × {selected.height}</dd></div>
                <div className="flex gap-2"><dt className="font-semibold">Categoria:</dt><dd>{categories.find((c) => c.slug === selected.category)?.namePt ?? selected.category}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">{selected.tags.map((t) => <span key={t} className="rounded-full bg-surface px-2.5 py-1 text-xs">{t}</span>)}</div>
              {terms && (
                <details className="mt-4 rounded-lg border border-nav/15 p-3 text-xs text-nav/70">
                  <summary className="cursor-pointer font-semibold text-nav">{terms.title} · versão {terms.version}</summary>
                  <p className="mt-2 leading-relaxed">{terms.summary}</p>
                </details>
              )}
              {orgId && canLicense && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <FavoriteButton orgId={orgId} assetId={selected.id} favorited={favs.has(selected.id)} onChange={(on) => setFav(selected.id, on)} onError={setLicenseError} label className="border border-nav/20 bg-white px-3.5 py-2 hover:border-brand" />
                  <button type="button" onClick={() => setPickerOpen((o) => !o)} aria-expanded={pickerOpen} className="flex items-center gap-1.5 rounded-full border border-nav/20 bg-white px-3.5 py-2 text-sm font-bold hover:border-brand"><FolderPlus size={16} /> Guardar em coleção</button>
                </div>
              )}
              {orgId && canLicense && pickerOpen && <CollectionPicker orgId={orgId} assetId={selected.id} onClose={() => setPickerOpen(false)} />}
              {licenseError && <p role="alert" className="mt-3 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{licenseError}</p>}
              <button
                disabled={!canLicense || licensing}
                onClick={() => licenseAndDownload(selected)}
                title={canLicense ? undefined : "O seu papel não permite licenciar"}
                className="mt-4 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-[#bd0024] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {licensing ? "A processar…" : "Licenciar e descarregar"}
              </button>
              <p className="mt-2 text-center text-[11px] text-nav/50">Ao licenciar, aceita os termos acima.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
