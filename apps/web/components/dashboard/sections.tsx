import { ArrowRight, Code2, Image as ImageIcon, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { Photo } from "../photo";
import { categories, newImages } from "./data";

const FEATURES = [
  { icon: ImageIcon, title: "+10 Milhões", sub: "de imagens" },
  { icon: Sparkles, title: "Geração com IA", sub: "Crie imagens únicas" },
  { icon: Code2, title: "Integração via API", sub: "Para sistemas e websites" },
  { icon: ShieldCheck, title: "Licença comercial", sub: "Uso seguro e global" },
];

export function FeatureCards() {
  return (
    <div className="mt-[17px] grid grid-cols-2 gap-[13px] xl:grid-cols-4">
      {FEATURES.map(({ icon: Icon, title, sub }) => (
        <div key={title} className="flex min-h-[78px] items-center gap-3.5 rounded-xl border border-[#e3e6ea] bg-white p-[13px_16px] shadow-[0_1px_2px_rgba(12,15,19,.025)]">
          <Icon strokeWidth={1.8} className="size-[34px] shrink-0 text-brand" />
          <span className="min-w-0">
            <strong className="block font-heading text-[clamp(12px,1vw,16px)] font-extrabold tracking-[-0.045em]">{title}</strong>
            <small className="mt-[3px] block text-xs text-[#353a45]">{sub}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionBar({ title, action, href }: { title: string; action: string; href: string }) {
  return (
    <div className="mb-[15px] flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-[21px] font-extrabold">{title}</h2>
      <Link href={href} className="flex items-center gap-1.5 text-[13px] font-bold whitespace-nowrap text-[#c5001f] hover:underline">
        {action} <ArrowRight size={20} />
      </Link>
    </div>
  );
}

export function Categories() {
  return (
    <section className="mt-[25px]">
      <SectionBar title="Categorias em destaque" action="Ver todas as categorias" href="/explorar" />
      <div className="grid grid-cols-2 gap-[11px] sm:grid-cols-3 xl:grid-cols-6">
        {categories.map((c) => (
          <Link key={c.title} href={`/explorar?category=${c.slug}`} className="relative block h-[125px] overflow-hidden rounded-[10px] transition hover:-translate-y-0.5 hover:shadow-lg">
            <Photo file={c.img} alt={`Categoria ${c.title}`} className="h-full w-full" />
            <div className="pointer-events-none absolute inset-x-0 top-[40%] bottom-0 bg-linear-to-b from-transparent to-black/70" />
            <span className="absolute right-2 bottom-3 left-2.5 text-[13px] font-extrabold text-white [text-shadow:0_1px_2px_#111]">{c.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function NewImages() {
  return (
    <section className="mt-[31px]">
      <SectionBar title="Novas imagens" action="Ver mais" href="/explorar" />
      <div className="grid grid-cols-2 gap-[11px] sm:grid-cols-3 xl:grid-cols-6">
        {newImages.map((p) => (
          <Photo key={p.title} file={p.img} alt={p.title} className="h-[117px] rounded-[10px]" />
        ))}
      </div>
    </section>
  );
}
