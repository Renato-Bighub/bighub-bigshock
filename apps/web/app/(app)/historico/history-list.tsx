"use client";

import type { AiJobDto } from "@bigstock/contracts";
import Link from "next/link";
import { useState } from "react";
import { apiGet, codeMessage, errorMessage } from "@/lib/api";
import { AiBadge } from "../gerar/studio";

const STATUS: Record<string, string> = { queued: "Na fila", running: "A gerar", succeeded: "Concluída", failed: "Falhou" };

export function HistoryList({ orgId, initial, nextCursor }: { orgId: string; initial: AiJobDto[]; nextCursor: string | null }) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [error, setError] = useState<string | null>(null);

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
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-[#2b3440] to-[#11161d]">
              {j.output_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api${j.output_url}`} alt="" className="h-full w-full object-cover" />}
            </div>
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
      {cursor && <div className="text-center"><button onClick={more} className="rounded-lg border border-nav/20 bg-white px-6 py-2.5 text-sm font-bold hover:border-brand">Carregar mais</button></div>}
    </div>
  );
}
