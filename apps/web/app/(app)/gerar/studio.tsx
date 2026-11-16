"use client";

import type { AiJobDto } from "@bigstock/contracts";
import { Download, FileText, ImageIcon, Lock, Loader2, Shapes, Sparkles, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GeneratingVisual } from "@/components/ai/generating-visual";
import { api, apiGet, ApiError, codeMessage, errorMessage } from "@/lib/api";
import { generateBrandManual } from "@/lib/brand-manual";

type Mode = "image" | "logo";
const STYLES = [
  { value: "minimalista", label: "Minimalista" },
  { value: "moderno", label: "Moderno" },
  { value: "classico", label: "Clássico" },
  { value: "geometrico", label: "Geométrico" },
  { value: "manuscrito", label: "Manuscrito" },
  { value: "mascote", label: "Mascote" },
  { value: "emblema", label: "Emblema" },
] as const;
const LOGO_TYPES = [
  { value: "simbolo_e_nome", label: "Símbolo e nome" },
  { value: "monograma", label: "Monograma" },
  { value: "so_nome", label: "Apenas nome" },
  { value: "so_simbolo", label: "Apenas símbolo" },
] as const;
const COLOR_PRESETS = ["#E4072D", "#1F4FFF", "#0B8F5C", "#F5A524", "#7A3CFF", "#111827"];

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
  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [brandName, setBrandName] = useState("");
  const [tagline, setTagline] = useState("");
  const [sector, setSector] = useState("");
  const [style, setStyle] = useState<(typeof STYLES)[number]["value"]>("minimalista");
  const [logoType, setLogoType] = useState<(typeof LOGO_TYPES)[number]["value"]>("simbolo_e_nome");
  const [colors, setColors] = useState<string[]>([]);
  const [manualBusy, setManualBusy] = useState(false);
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

  const brief = { brandName: brandName.trim(), tagline: tagline.trim() || undefined, sector: sector.trim(), style, type: logoType, colors };
  const ready = mode === "image" ? prompt.trim().length >= 3 : brief.brandName.length >= 1 && brief.sector.length >= 2;
  const payload = mode === "image" ? { mode, prompt, size, quality } : { mode, prompt, brief };
  const payloadKey = JSON.stringify(payload);

  // Estimativa ao vivo (o backend recalcula sempre na confirmação).
  useEffect(() => {
    if (!ready) { setEstimate(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api<{ data: { cost_credits: number; available_credits: number; can_afford: boolean } }>(`${base}/estimate`, JSON.parse(payloadKey));
        setEstimate({ cost: r.data.cost_credits, available: r.data.available_credits, canAfford: r.data.can_afford });
      } catch { setEstimate(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [payloadKey, ready, base]);

  // Polling até terminar.
  useEffect(() => {
    if (!job || job.status === "succeeded" || job.status === "failed") return;
    const t = setInterval(async () => {
      try {
        const r = await apiGet<{ data: AiJobDto }>(`${base}/jobs/${job.id}`);
        setJob(r.data);
        if (r.data.status === "succeeded" || r.data.status === "failed") {
          setHistory((h) => [r.data, ...h.filter((x) => x.id !== r.data.id)].slice(0, 6));
          const e = ready ? await api<{ data: { cost_credits: number; available_credits: number; can_afford: boolean } }>(`${base}/estimate`, JSON.parse(payloadKey)).catch(() => null) : null;
          if (e) setEstimate({ cost: e.data.cost_credits, available: e.data.available_credits, canAfford: e.data.can_afford });
        }
      } catch { /* tenta no próximo ciclo */ }
    }, 2000);
    return () => clearInterval(t);
  }, [job, base, payloadKey, ready]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!estimate) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ data: AiJobDto }>(`${base}/jobs`, { ...payload, expectedCostCredits: estimate.cost }, "POST", { "Idempotency-Key": keyRef.current });
      setJob(r.data);
      keyRef.current = crypto.randomUUID(); // próximo pedido = nova intenção
    } catch (err) {
      if (err instanceof ApiError && err.code === "cost_changed") {
        const r = await api<{ data: { cost_credits: number; available_credits: number; can_afford: boolean } }>(`${base}/estimate`, payload).catch(() => null);
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
        <div role="tablist" aria-label="Tipo de geração" className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
          {([["image", "Imagem", ImageIcon], ["logo", "Logo", Shapes]] as const).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              disabled={!!running}
              onClick={() => { setMode(m); setError(null); }}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-bold transition ${mode === m ? "bg-white text-nav shadow-sm" : "text-nav/55 hover:text-nav"} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
          <button type="button" role="tab" aria-selected={false} aria-disabled title="Geração de vídeo em breve" disabled className="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-bold text-nav/35">
            <Video size={16} /> Vídeo <Lock size={12} />
          </button>
        </div>

        {mode === "image" ? (
          <>
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
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="mb-1 block text-sm font-semibold">Nome da marca</span>
                <input value={brandName} onChange={(e) => setBrandName(e.target.value)} maxLength={40} required placeholder="Aurora" className="w-full rounded-lg border border-nav/20 px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" /></label>
              <label className="block"><span className="mb-1 block text-sm font-semibold">Setor</span>
                <input value={sector} onChange={(e) => setSector(e.target.value)} maxLength={80} required placeholder="Padaria artesanal" className="w-full rounded-lg border border-nav/20 px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" /></label>
            </div>
            <label className="block"><span className="mb-1 block text-sm font-semibold">Slogan <span className="font-normal text-nav/50">(opcional, vai para o manual)</span></span>
              <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={80} placeholder="O pão de cada manhã" className="w-full rounded-lg border border-nav/20 px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" /></label>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold">Estilo</legend>
              <div className="flex flex-wrap gap-1.5">
                {STYLES.map((st) => (
                  <button key={st.value} type="button" aria-pressed={style === st.value} onClick={() => setStyle(st.value)} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${style === st.value ? "border-brand bg-brand text-white" : "border-nav/20 text-nav/70 hover:border-nav/40"}`}>{st.label}</button>
                ))}
              </div>
            </fieldset>
            <label className="block"><span className="mb-1 block text-sm font-semibold">Tipo de logótipo</span>
              <select value={logoType} onChange={(e) => setLogoType(e.target.value as typeof logoType)} className="w-full rounded-lg border border-nav/20 bg-white px-3 py-2.5 text-sm">{LOGO_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold">Cores <span className="font-normal text-nav/50">(até 3; vazio = a IA escolhe)</span></legend>
              <div className="flex flex-wrap items-center gap-2">
                {COLOR_PRESETS.map((c) => {
                  const on = colors.includes(c);
                  return (
                    <button key={c} type="button" aria-pressed={on} aria-label={`Cor ${c}`} onClick={() => setColors((cur) => (on ? cur.filter((x) => x !== c) : cur.length >= 3 ? cur : [...cur, c]))} className={`h-8 w-8 rounded-full border-2 transition ${on ? "scale-110 border-nav" : "border-white ring-1 ring-nav/15"}`} style={{ backgroundColor: c }} />
                  );
                })}
                {colors.length > 0 && <button type="button" onClick={() => setColors([])} className="text-xs font-bold text-nav/60 underline">Limpar</button>}
              </div>
            </fieldset>
            <label className="block"><span className="mb-1 block text-sm font-semibold">Ideias adicionais <span className="font-normal text-nav/50">(opcional)</span></span>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={500} rows={2} placeholder="Ex.: inspirado em espigas de trigo, transmitir calor e tradição" className="w-full rounded-lg border border-nav/20 px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" /></label>
            <p className="rounded-lg bg-surface px-3 py-2 text-xs text-nav/60">O logo é gerado em alta qualidade, formato quadrado e fundo liso, pronto para o manual da marca.</p>
          </>
        )}
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
          <Sparkles size={17} /> {busy ? "A enviar…" : running ? "A gerar…" : estimate ? `Gerar ${mode === "logo" ? "logo" : "imagem"} (${estimate.cost} créditos)` : mode === "logo" ? "Gerar logo" : "Gerar"}
        </button>
        <p className="text-[11px] text-nav/50">As imagens e logos gerados são privados da sua organização e sinalizadas como conteúdo gerado por IA.</p>
      </form>

      <div className="space-y-4">
        <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[14px] border border-[#e0e3e9] bg-gradient-to-br from-[#2b3440] to-[#11161d]">
          {job?.status === "succeeded" && job.output_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api${job.output_url}`} alt={job.kind === "logo" && job.brief ? `Logo ${job.brief.brandName}` : job.prompt} className={`h-full w-full object-contain ${job.kind === "logo" ? "bg-white p-6" : ""}`} />
              <div className="absolute top-3 left-3"><AiBadge /></div>
              <a href={`/api${job.output_url}?download=1`} className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold hover:bg-surface"><Download size={14} /> Descarregar</a>
            </>
          ) : job?.status === "failed" ? (
            <p className="max-w-xs p-6 text-center text-sm text-white">{codeMessage(job.error_code)}</p>
          ) : running ? (
            <GeneratingVisual mode={job.kind === "logo" ? "logo" : "image"} queued={job.status === "queued"} />
          ) : (
            <p className="max-w-xs p-6 text-center text-sm text-white/60">{mode === "logo" ? "O logo aparece aqui." : "O resultado aparece aqui."}</p>
          )}
        </div>
        {job?.status === "succeeded" && job.kind === "logo" && job.output_url && job.brief && (
          <div className="rounded-[14px] border border-[#e0e3e9] bg-white p-4">
            <h2 className="text-sm font-extrabold">Manual da marca</h2>
            <p className="mt-1 text-xs text-nav/60">PDF com logótipo, área de proteção, versões, paleta de cores, tipografia, usos incorretos e notas legais. Sem custo de créditos.</p>
            <button
              type="button"
              disabled={manualBusy}
              onClick={async () => {
                setManualBusy(true);
                setError(null);
                try { await generateBrandManual(job, `/api${job.output_url}`); }
                catch { setError("Não foi possível criar o PDF. Tente novamente."); }
                finally { setManualBusy(false); }
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-nav px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1a222c] disabled:cursor-wait disabled:opacity-60"
            >
              {manualBusy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} {manualBusy ? "A criar o PDF…" : "Gerar manual da marca (PDF)"}
            </button>
          </div>
        )}
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
