"use client";

import type { LibraryAssetDto } from "@bigstock/contracts";
import { FolderPlus, Heart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CollectionPicker } from "@/components/library/collection-picker";
import { FavoriteButton } from "@/components/library/favorite-button";
import { apiGet, errorMessage } from "@/lib/api";
import { T, useT } from "@/components/i18n/provider";

export function FavoritesGrid({ orgId, canWrite, initial, nextCursor }: { orgId: string; canWrite: boolean; initial: LibraryAssetDto[]; nextCursor: string | null }) {
  const t = useT();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [picker, setPicker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (!cursor) return;
    try {
      const r = await apiGet<{ data: LibraryAssetDto[]; pagination: { next_cursor: string | null } }>(`/v1/organizations/${orgId}/favorites?limit=24&cursor=${encodeURIComponent(cursor)}`);
      setItems((p) => [...p, ...r.data]);
      setCursor(r.pagination.next_cursor);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-nav/20 bg-white p-10 text-center">
        <Heart className="mx-auto text-nav/30" size={32} />
        <p className="mt-3 font-semibold"><T>Ainda não tem favoritos.</T></p>
        <p className="mt-1 text-sm text-nav/60"><T>Toque no coração de uma imagem para a guardar aqui.</T></p>
        <Link href="/explorar" className="mt-4 inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-[#bd0024]"><T>Explorar imagens</T></Link>
      </div>
    );
  }
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {items.map((a) => (
          <li key={a.id} className="group relative">
            <div className="relative aspect-[3/2] overflow-hidden rounded-[10px] bg-gradient-to-br from-[#2b3440] to-[#11161d]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api${a.preview_url}`} alt={a.title} loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-8 text-xs font-bold text-white">{a.title}</span>
              {canWrite && (
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button type="button" aria-label={t("Guardar em coleção")} onClick={() => setPicker(picker === a.id ? null : a.id)} className="rounded-full bg-white/90 p-2 text-nav hover:bg-white"><FolderPlus size={16} /></button>
                  <FavoriteButton orgId={orgId} assetId={a.id} favorited onChange={(next) => { if (!next) setItems((p) => p.filter((x) => x.id !== a.id)); }} onError={setError} className="bg-white/90 p-2 hover:bg-white" />
                </div>
              )}
            </div>
            {picker === a.id && <CollectionPicker orgId={orgId} assetId={a.id} onClose={() => setPicker(null)} />}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-4 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
      {cursor && <div className="mt-8 text-center"><button onClick={more} className="rounded-lg border border-nav/20 bg-white px-6 py-2.5 text-sm font-bold hover:border-brand"><T>Carregar mais</T></button></div>}
    </>
  );
}
