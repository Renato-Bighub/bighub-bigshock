"use client";

import type { AiJobDto } from "@bigstock/contracts";
import Link from "next/link";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet, codeMessage, errorMessage } from "@/lib/api";
import { AiBadge } from "../gerar/studio";

const STATUS: Record<string, string> = { queued: "Na fila", running: "A gerar", succeeded: "Concluída", failed: "Falhou" };

export function HistoryList({ orgId, initial, nextCursor }: { orgId: string; initial: AiJobDto[]; nextCursor: string | null }) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AiJobDto | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function more() {
    if (!cursor) return;
    try {
      const r = await apiGet<{ data: AiJobDto[]; pagination: { next_cursor: string | null } }>(`/v1/organizations/${orgId}/ai/jobs?limit=24&cursor=${encodeURIComponent(cursor)}`);
      setItems((p) => [...p, ...r.data]);
      setCursor(r.pagination.next_cursor);
    } catch (e) { setError(errorMessage(e)); }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[14px] border border-[#e0e3e9] bg-white p-6 text-sm text-nav/60">
        Ainda sem gerações. <Link href="/gerar" className="font-bold text-[#c5001f] hover:underline">Criar a primeira imagem</Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
      <ul className="divide-y divide-[#eef0f3] rounded-[14px] border border-[#e0e3e9] bg-white">
        {items.map((j) => (
          <li key={j.id} className="flex items-center gap-4 p-3">
            {j.output_url ? (
              <button type="button" onClick={() => setOpen(j)} aria-label="Ver imagem em tamanho maior" className="relative h-16 w-16 shrink-0 cursor-zoom-in overflow-hidden rounded-lg bg-gradient-to-br from-[#2b3440] to-[#11161d] transition hover:ring-2 hover:ring-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api${j.output_url}`} alt="" className="h-full w-full object-cover" />
              </button>
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-lg bg-gradient-to-br from-[#2b3440] to-[#11161d]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{j.prompt}</p>
              <p className="text-xs text-nav/60">
                {STATUS[j.status]} · {j.cost_credits} créditos · {j.size} · {new Date(j.created_at).toLocaleString("pt-PT")}
                {j.model && ` · ${j.provider}/${j.model}`}
              </p>
              {j.status === "failed" && <p className="text-xs text-brand">{codeMessage(j.error_code)}</p>}
            </div>
            {j.status === "succeeded" && <AiBadge />}
          </li>
        ))}
      </ul>
      {open?.output_url && (
        <div role="dialog" aria-modal="true" aria-label="Visualizar imagem" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(null)}>
          <div className="relative max-h-full w-full max-w-3xl overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(null)} aria-label="Fechar" className="absolute top-3 right-3 z-10 rounded-full bg-white/90 p-1.5 shadow hover:bg-white"><X size={18} /></button>
            <div className="relative flex max-h-[70vh] items-center justify-center bg-[#11161d]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api${open.output_url}`} alt={open.prompt} className={`max-h-[70vh] w-auto object-contain ${open.kind === "logo" ? "bg-white p-6" : ""}`} />
              <div className="absolute top-3 left-3"><AiBadge /></div>
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <p className="min-w-0 text-sm"><span className="block truncate font-semibold">{open.prompt}</span><span className="text-xs text-nav/60">{new Date(open.created_at).toLocaleString("pt-PT")} · {open.cost_credits} créditos</span></p>
              <a href={`/api${open.output_url}?download=1`} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-[#bd0024]"><Download size={15} /> Descarregar</a>
            </div>
          </div>
        </div>
      )}
      {cursor && <div className="text-center"><button onClick={more} className="rounded-lg border border-nav/20 bg-white px-6 py-2.5 text-sm font-bold hover:border-brand">Carregar mais</button></div>}
    </div>
  );
}
