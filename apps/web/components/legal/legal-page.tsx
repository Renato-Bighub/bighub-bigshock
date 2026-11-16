import Link from "next/link";
import { Brand } from "@/components/auth-shell";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="bg-nav px-6 py-3"><Link href="/"><Brand dark /></Link></header>
      <main className="mx-auto max-w-3xl px-6 py-10 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-extrabold [&_li]:mt-1 [&_p]:mt-3 [&_table]:mt-3 [&_table]:w-full [&_td]:border [&_td]:border-nav/15 [&_td]:p-2 [&_th]:border [&_th]:border-nav/15 [&_th]:bg-surface [&_th]:p-2 [&_th]:text-left [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        <p className="mt-2 rounded-lg border border-[#f3dfe3] bg-[#fff5f6] px-3 py-2 text-sm text-[#aa3450]">
          Rascunho sujeito a revisão jurídica antes do lançamento comercial. Última atualização: {updated}.
        </p>
        {children}
        <p className="mt-10 text-sm text-nav/60"><Link href="/termos" className="underline">Termos</Link> · <Link href="/privacidade" className="underline">Privacidade</Link></p>
      </main>
    </div>
  );
}
