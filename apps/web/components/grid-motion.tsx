"use client";

import { gsap } from "gsap";
import { useEffect, useMemo, useRef } from "react";

/**
 * Fundo "Grid Motion" (inspirado em reactbits.dev): grelha inclinada de imagens cujas linhas deslizam
 * em sentidos opostos conforme o rato; em repouso faz uma deriva suave. Respeita prefers-reduced-motion.
 * As imagens são cores de fundo CSS: se um ficheiro faltar, o mosaico mantém o tom escuro.
 */
const ROWS = 8;
const COLS = 7;
const MAX_MOVE = 260; // px
const IDLE_AFTER_MS = 2500;
const INERTIA = [0.6, 0.4, 0.3, 0.2];

export function GridMotion({ images, className = "" }: { images: string[]; className?: string }) {
  const rows = useRef<(HTMLDivElement | null)[]>([]);

  // Cada célula escolhe uma imagem com passos coprimos: vizinhos (cima/baixo/lados) quase nunca repetem.
  const cells = useMemo(
    () => Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => images[(r * 3 + c * 5) % images.length]!)),
    [images],
  );

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const setters = rows.current.map((row, i) => (row ? gsap.quickTo(row, "x", { duration: 0.8 + INERTIA[i % INERTIA.length]!, ease: "power3.out" }) : null));
    let mouseRatio = 0.5;
    let lastMove = -Infinity;
    const onMove = (e: MouseEvent) => {
      mouseRatio = e.clientX / window.innerWidth;
      lastMove = performance.now();
    };
    const tick = (time: number) => {
      const idle = performance.now() - lastMove > IDLE_AFTER_MS;
      const ratio = idle ? 0.5 + 0.5 * Math.sin(time * 0.18) : mouseRatio;
      setters.forEach((set, i) => set?.((ratio * MAX_MOVE - MAX_MOVE / 2) * (i % 2 === 0 ? 1 : -1)));
    };
    window.addEventListener("mousemove", onMove);
    gsap.ticker.add(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      gsap.ticker.remove(tick);
    };
  }, []);

  return (
    <div aria-hidden="true" className={`pointer-events-none overflow-hidden ${className}`}>
      <div className="absolute top-1/2 left-1/2 grid w-[170%] -translate-x-1/2 -translate-y-1/2 -rotate-[15deg] gap-3">
        {cells.map((row, r) => (
          <div key={r} ref={(el) => { rows.current[r] = el; }} className="grid grid-cols-7 gap-3 will-change-transform">
            {row.map((src, c) => (
              <div
                key={c}
                className="aspect-[16/10] rounded-[10px] bg-[#11161d] bg-cover bg-center"
                style={{ backgroundImage: `url(${src})` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
