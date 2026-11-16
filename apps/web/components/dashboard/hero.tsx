"use client";

import { Search } from "lucide-react";
import { heroChips } from "./data";

export function Hero() {
  return (
    <div
      className="relative isolate flex h-auto min-h-[334px] w-full items-center overflow-hidden rounded-[14px] bg-[#3c454b] bg-cover bg-[position:center_49%] shadow-[0_6px_16px_rgba(0,0,0,.06)]"
      style={{ backgroundImage: "linear-gradient(90deg, rgba(8,12,16,.82) 0%, rgba(8,12,16,.6) 42%, rgba(8,12,16,.08) 100%), url('/images/hero-city.jpg')" }}
    >
      <div className="w-full p-[28px_30px] text-white">
        <h1 className="mb-[13px] max-w-[790px] text-[clamp(24px,2.35vw,35px)] leading-[1.15] font-extrabold tracking-[-0.047em] [text-shadow:0_2px_8px_rgba(0,0,0,.35)]">
          Milhões de imagens profissionais <br className="hidden xl:block" />
          para os seus projetos
        </h1>
        <p className="mb-[22px] text-[clamp(14px,1.25vw,18px)] leading-[1.35] font-medium text-[#f7f7f8]">
          Fotos, vetores, ilustrações e imagens geradas por IA, <br className="hidden xl:block" />
          com licença segura e comercial.
        </p>
        <form role="search" onSubmit={(e) => e.preventDefault()} className="flex h-[52px] max-w-[640px] items-center gap-3 rounded-[9px] bg-white p-[5px_5px_5px_17px] text-[#79808b] shadow-[0_6px_20px_rgba(0,0,0,.14)]">
          <Search size={21} className="shrink-0" />
          <input aria-label="Pesquisar no banco de imagens" placeholder="Pesquisar imagens, vetores, ilustrações..." className="min-w-0 flex-1 bg-transparent text-sm text-[#222832] outline-0" />
          <button type="submit" className="self-stretch rounded-[7px] bg-[#e0002c] px-[27px] text-sm font-extrabold text-white transition hover:bg-[#bd0024]">
            Pesquisar
          </button>
        </form>
        <div className="mt-3.5 flex flex-wrap gap-[9px]">
          {heroChips.map((c) => (
            <span key={c} className="rounded-full border border-white/85 bg-[rgba(11,14,18,.27)] px-[15px] py-1.5 text-xs font-semibold">{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
