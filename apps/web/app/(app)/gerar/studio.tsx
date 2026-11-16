"use client";

import type { AiJobDto } from "@bigstock/contracts";
import { Download, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, apiGet, ApiError, codeMessage, errorMessage } from "@/lib/api";

const SIZES = [
  { value: "1024x1024", label: "Quadrado 1:1" },
  { value: "1536x1024", label: "Horizontal 3:2" },
  { value: "1024x1536", label: "Vertical 2:3" },
];
const QUALITIES = [
  { value: "standard", label: "Standard" },
  { value: "high", label: "Alta qualidade" },
];

export function AiBadge() {
  return <span className="rounded-full bg-nav/80 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">Gerado por IA</span>;
}

export function Studio({ orgId, initialCredits, recent }: { orgId: string; initialCredits: number; recent: AiJobDto[] }) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("standard");
  const [estimate, setEstimate] = useState<{ cost: number; available: number; canAfford: boolean } | null>(null);
  const [job, setJob] = useState<AiJobDto | null>(null);
  const [history, setHistory] = useState(recent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A chave identifica UMA intenção de gerar: reenvios do mesmo clique não cobram duas vezes.
  const keyRef = useRef<string>(crypto.randomUUID());
  const base = `/v1/organizations/${orgId}/ai`;

  // Estimativa ao vivo (o backend recalcula sempre na confirmação).
  useEffect(() => {
    if (prompt.trim().length < 3) { setEstimate(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api<{ data: { cost_credits: number; available_credits: number; can_afford: boolean } }>(`${base}/estimate`, { prompt, size, quality });
        setEstimate({ cost: r.data.cost_credits, available: r.data.available_credits, canAfford: r.data.can_afford });
      } catch { setEstimate(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [prompt, size, quality, base]);

  // Polling até terminar.
  useEffect(() => {
    if (!job || job.status === "succeeded" || job.status === "failed") return;
    const t = setInterval(async () => {
      try {
        const r = await apiGet<{ data: AiJobDto }>(`${base}/jobs/${job.id}`);
        setJob(r.data);
        if (r.data.status === "succeeded" || r.data.status === "failed") {
          setHistory((h) => [r.data, ...h.filter((x) => x.id !== r.data.id)].slice(0, 6));
          const e = await api<{ data: { cost_credits: number; available_credits: number; can_afford: boolean } }>(`${base}/estimate`, { prompt, size, quality }).catch(() => null);
          if (e) setEstimate({ cost: e.data.cost_credits, available: e.data.available_credits, canAfford: e.data.can_afford });
        }
      } catch { /* tenta no próximo ciclo */ }
    }, 2000);
    return () => clearInterval(t);
  }, [job, base, prompt, size, quality]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!estimate) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ data: AiJobDto }>(`${base}/jobs`, { prompt, size, quality, expectedCostCredits: estimate.cost }, "POST", { "Idempotency-Key": keyRef.current });
      setJob(r.data);
      keyRef.current = crypto.randomUUID(); // próximo pedido = nova intenção
    } catch (err) {
      if (err instanceof ApiError && err.code === "cost_changed") {
        const r = await api<{ data: { cost_credits: number; available_credits: number; can_afford: boolean } }>(`${base}/estimate`, { prompt, size, quality }).catch(() => null);
        if (r) setEstimate({ cost: r.data.cost_credits, available: r.data.available_credits, canAfford: r.data.can_afford });
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const available = estimate?.available ?? initialCredits;
  const running = job && (job.status === "queued" || job.status === "running");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <form onSubmit={generate} className="space-y-4 rounded-[14px] border border-[#e0e3e9] bg-white p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Descrição</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={2000}
            rows={5}
            required
            placeholder="Um escritório contemporâneo com luz natural e vista para a cidade"
            className="w-full rounded-lg border border-nav/20 px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-1 block text-sm font-semibold">Formato</span>
            <select value={size} onChange={(e) => setSize(e.target.value)} className="w-full rounded-lg border border-nav/20 bg-white px-3 py-2.5 text-sm">{SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-sm font-semibold">Qualidade</span>
            <select value={quality} onChange={(e) => setQuality(e.target.value)} className="w-full rounded-lg border border-nav/20 bg-white px-3 py-2.5 text-sm">{QUALITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2.5 text-sm">
          <span>Custo: <strong>{estimate ? `${estimate.cost} créditos` : "—"}</strong></span>
          <span className="text-nav/60">Saldo: <strong className="text-nav">{new Intl.NumberFormat("pt-PT").format(available)}</strong></span>
        </div>
        {estimate && !estimate.canAfford && (
          <p className="text-sm text-brand">Créditos insuficientes. <Link href="/planos#creditos" className="font-bold underline">Comprar créditos</Link></p>
        )}
        {error && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
        <button
          disabled={busy || !!running || !estimate || !estimate.canAfford}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-[#bd0024] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles size={17} /> {busy ? "A enviar…" : running ? "A gerar…" : estimate ? `Gerar (${estimate.cost} créditos)` : "Gerar"}
        </button>
        <p className="text-[11px] text-nav/50">As imagens geradas são privadas da sua organização e sinalizadas como conteúdo gerado por IA.</p>
      </form>

      <div className="space-y-4">
        <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[14px] border border-[#e0e3e9] bg-gradient-to-br from-[#2b3440] to-[#11161d]">
          {job?.status === "succeeded" && job.output_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api${job.output_url}`} alt={job.prompt} className="h-full w-full object-contain" />
              <div className="absolute top-3 left-3"><AiBadge /></div>
              <a href={`/api${job.output_url}?download=1`} className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold hover:bg-surface"><Download size={14} /> Descarregar</a>
            </>
          ) : job?.status === "failed" ? (
            <p className="max-w-xs p-6 text-center text-sm text-white">{codeMessage(job.error_code)}</p>
          ) : running ? (
            <p className="animate-pulse text-sm text-white/80">A gerar a imagem…</p>
          ) : (
            <p className="max-w-xs p-6 text-center text-sm text-white/60">O resultado aparece aqui.</p>
          )}
        </div>
        {history.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-extrabold">Recentes</h2><Link href="/historico" className="text-xs font-bold text-[#c5001f] hover:underline">Ver histórico</Link></div>
            <ul className="grid grid-cols-3 gap-2">
              {history.filter((h) => h.status === "succeeded" && h.output_url).slice(0, 6).map((h) => (
                <li key={h.id}>
                  <button onClick={() => setJob(h)} className="relative block aspect-square w-full overflow-hidden rounded-lg bg-nav">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api${h.output_url}`} alt={h.prompt} className="h-full w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
