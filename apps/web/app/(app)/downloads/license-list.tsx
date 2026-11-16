"use client";

import type { LicenseDto } from "@bigstock/contracts";
import { Download } from "lucide-react";
import { useState } from "react";
import { api, apiGet, errorMessage } from "@/lib/api";
import { T, useLocale, useT } from "@/components/i18n/provider";
import { intlLocale } from "@/lib/i18n/config";

export function LicenseList({ orgId, canDownload, initial, nextCursor }: {
  orgId: string; canDownload: boolean; initial: LicenseDto[]; nextCursor: string | null;
}) {
  const t = useT();
  const intl = intlLocale(useLocale());
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(id: string) {
    setBusy(id);
    setError(null);
    try {
      const r = await api<{ data: { url: string } }>(`/v1/organizations/${orgId}/licenses/${id}/download`);
      window.location.assign(`/api${r.data.url}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function more() {
    if (!cursor) return;
    try {
      const r = await apiGet<{ data: LicenseDto[]; pagination: { next_cursor: string | null } }>(`/v1/organizations/${orgId}/licenses?limit=24&cursor=${encodeURIComponent(cursor)}`);
      setItems((p) => [...p, ...r.data]);
      setCursor(r.pagination.next_cursor);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (items.length === 0) {
    return <p className="rounded-[14px] border border-[#e0e3e9] bg-white p-6 text-sm text-nav/60"><T>Ainda sem imagens licenciadas. Explore o catálogo e licencie a sua primeira imagem.</T></p>;
  }
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
      <ul className="divide-y divide-[#eef0f3] rounded-[14px] border border-[#e0e3e9] bg-white">
        {items.map((l) => (
          <li key={l.id} className="flex items-center gap-4 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api${l.asset.preview_url}`} alt="" className="h-14 w-20 shrink-0 rounded-lg bg-nav object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{l.asset.title}</p>
              <p className="text-xs text-nav/60"><T>Licenciada em</T> {new Date(l.created_at).toLocaleDateString(intl)} <T>· termos</T> {l.terms_version}</p>
            </div>
            <button
              onClick={() => download(l.id)}
              disabled={!canDownload || busy === l.id}
              aria-label={t("Descarregar {title}", { title: l.asset.title })}
              className="flex items-center gap-1.5 rounded-lg border border-nav/20 px-3 py-2 text-xs font-bold hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={15} /> <T>Descarregar</T>
            </button>
          </li>
        ))}
      </ul>
      {cursor && <div className="text-center"><button onClick={more} className="rounded-lg border border-nav/20 bg-white px-6 py-2.5 text-sm font-bold hover:border-brand"><T>Carregar mais</T></button></div>}
    </div>
  );
}
