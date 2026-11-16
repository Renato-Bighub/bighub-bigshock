"use client";

import { useEffect, useState } from "react";

const MESSAGES = {
  image: [
    "A interpretar a sua descrição…",
    "A compor luz e perspetiva…",
    "A misturar cores e texturas…",
    "A refinar os detalhes…",
    "A aplicar o acabamento final…",
  ],
  logo: [
    "A estudar a sua marca e o setor…",
    "A explorar conceitos de símbolo…",
    "A equilibrar formas e proporções…",
    "A afinar tipografia e espaçamento…",
    "A testar legibilidade em tamanho pequeno…",
    "A preparar o logótipo final…",
  ],
};

/** Estado de espera animado: mostra progresso percebido e mensagens rotativas enquanto a IA trabalha. */
export function GeneratingVisual({ mode, queued }: { mode: "image" | "logo"; queued?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const msgs = MESSAGES[mode];
  const msg = queued && elapsed < 4 ? "Pedido na fila…" : msgs[Math.floor(elapsed / 3) % msgs.length]!;
  // Progresso percebido: aproxima-se de 92% sem nunca chegar a 100% até o resultado existir.
  const pct = Math.round(92 * (1 - Math.exp(-elapsed / 22)));
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0"), ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="bs-anim absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#0e131a]" role="status" aria-live="polite" aria-label={msg}>
      <div aria-hidden className="absolute -top-1/4 -left-1/4 h-3/4 w-3/4 rounded-full bg-brand/40 blur-3xl" style={{ animation: "bs-drift 7s ease-in-out infinite" }} />
      <div aria-hidden className="absolute -right-1/4 -bottom-1/4 h-3/4 w-3/4 rounded-full bg-[#3b6cff]/35 blur-3xl" style={{ animation: "bs-drift 9s ease-in-out infinite reverse" }} />
      <div aria-hidden className="absolute top-1/3 left-1/2 h-1/3 w-1/3 rounded-full bg-[#ffb02e]/25 blur-3xl" style={{ animation: "bs-drift 11s ease-in-out infinite" }} />

      <div className="relative mb-6 h-36 w-36">
        {mode === "logo" ? <LogoDraw /> : <PixelGrid />}
      </div>

      <p key={msg} className="relative px-6 text-center text-sm font-semibold text-white" style={{ animation: "bs-fade .5s ease both" }}>{msg}</p>
      <p className="relative mt-1 text-xs text-white/50">{mm}:{ss} · normalmente demora cerca de 30 a 60 segundos</p>

      <div className="relative mt-5 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-brand to-[#ff7a45] transition-[width] duration-1000" style={{ width: `${Math.max(pct, 4)}%` }} />
        <div aria-hidden className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent" style={{ animation: "bs-bar 1.6s linear infinite" }} />
      </div>
    </div>
  );
}

/** Imagem: grelha de pontos a “acender” em onda, como píxeis a formar a cena. */
function PixelGrid() {
  const cells = Array.from({ length: 36 }, (_, i) => i);
  return (
    <div className="grid h-full w-full grid-cols-6 gap-1.5">
      {cells.map((i) => {
        const x = i % 6, y = Math.floor(i / 6);
        return (
          <span
            key={i}
            className="rounded-[5px] bg-gradient-to-br from-white/90 to-brand/80"
            style={{ animation: "bs-pop 2.4s ease-in-out infinite", animationDelay: `${(x + y) * 0.16}s` }}
          />
        );
      })}
    </div>
  );
}

/** Logo: formas que se “desenham” e preenchem, em ciclo. */
function LogoDraw() {
  const stroke = { fill: "none", stroke: "white", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, pathLength: 1, strokeDasharray: 1 };
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden>
      <circle cx="60" cy="60" r="46" {...stroke} style={{ animation: "bs-draw 3.6s ease-in-out infinite", strokeDashoffset: 1 }} />
      <path d="M60 24 L92 78 H28 Z" {...stroke} style={{ animation: "bs-draw 3.6s ease-in-out .4s infinite", strokeDashoffset: 1 }} />
      <path d="M38 78 Q60 40 82 78" {...stroke} stroke="#ff7a45" style={{ animation: "bs-draw 3.6s ease-in-out .8s infinite", strokeDashoffset: 1 }} />
      <circle cx="60" cy="60" r="7" fill="#e4072d" fillOpacity="0" style={{ animation: "bs-fillin 3.6s ease-in-out 1s infinite" }} />
      <line x1="14" y1="60" x2="106" y2="60" stroke="white" strokeOpacity=".25" strokeDasharray="2 4" />
      <line x1="60" y1="14" x2="60" y2="106" stroke="white" strokeOpacity=".25" strokeDasharray="2 4" />
    </svg>
  );
}
