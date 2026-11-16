"use client";

import type { AssetDto, AssetListResponse } from "@bigstock/contracts";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiGet, errorMessage } from "@/lib/api";

export interface Category { slug: string; namePt: string; nameEn: string }

export function Explorer({ q, category, categories, initial, nextCursor }: {
  q: string; category: string; categories: Category[]; initial: AssetDto[]; nextCursor: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AssetDto | null>(null);

  const href = (next: { q?: string; category?: string }) => {
    const p = new URLSearchParams();
    const nq = next.q ?? q;
    const nc = next.category ?? category;
    if (nq) p.set("q", nq);
    if (nc) p.set("category", nc);
    return `/explorar${p.size ? `?${p}` : ""}`;
  };

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
            <li key={a.id}>
              <button onClick={() => setSelected(a)} className="group relative block aspect-[3/2] w-full overflow-hidden rounded-[10px] bg-gradient-to-br from-[#2b3440] to-[#11161d]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api${a.preview_url}`} alt={a.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-8 text-left text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">{a.title}</span>
              </button>
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
            <img src={`/api${selected.preview_url}`} alt={selected.title} className="h-full w-full bg-nav object-contain" />
            <div className="relative p-6">
              <button aria-label="Fechar" onClick={() => setSelected(null)} className="absolute top-3 right-3 rounded-lg p-2 hover:bg-surface"><X size={20} /></button>
              <h2 className="pr-8 text-xl font-extrabold">{selected.title}</h2>
              {selected.description && <p className="mt-2 text-sm text-nav/70">{selected.description}</p>}
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex gap-2"><dt className="font-semibold">Dimensões:</dt><dd>{selected.width} × {selected.height}</dd></div>
                <div className="flex gap-2"><dt className="font-semibold">Categoria:</dt><dd>{categories.find((c) => c.slug === selected.category)?.namePt ?? selected.category}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">{selected.tags.map((t) => <span key={t} className="rounded-full bg-surface px-2.5 py-1 text-xs">{t}</span>)}</div>
              <button disabled title="Disponível em breve" className="mt-6 w-full cursor-not-allowed rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white opacity-60">Licenciar e descarregar (em breve)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
