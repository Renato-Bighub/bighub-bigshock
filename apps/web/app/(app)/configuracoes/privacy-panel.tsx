"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";

const card = "rounded-[14px] border border-[#e0e3e9] bg-white p-5 shadow-[0_1px_3px_rgba(12,19,25,.035)]";

export function PrivacyPanel() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function erase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!confirm("Eliminar a sua conta é irreversível. Continuar?")) return;
    setBusy(true);
    setError(null);
    try {
      await api("/v1/me/erase", { password: f.get("password"), confirm: f.get("confirm") });
      router.push("/login");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={card}>
        <h2 className="mb-1 text-lg font-extrabold">Privacidade e dados</h2>
        <p className="text-sm text-nav/70">Os seus direitos de acesso e portabilidade. Veja a <Link href="/privacidade" className="font-bold text-[#c5001f] underline">Política de Privacidade</Link>.</p>
        <a href="/api/v1/me/export" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-nav/20 px-4 py-2.5 text-sm font-bold hover:border-brand">
          <Download size={16} /> Descarregar os meus dados (JSON)
        </a>
      </section>

      <section className={`${card} border-[#f3dfe3]`}>
        <h2 className="mb-1 text-lg font-extrabold text-brand">Eliminar a conta</h2>
        <ul className="mb-3 list-disc pl-5 text-sm text-nav/70">
          <li>Os seus dados pessoais são anonimizados e a sessão termina em todos os dispositivos.</li>
          <li>Organizações onde é o único membro são <strong>encerradas</strong>: a assinatura é cancelada, as chaves de API revogadas e as descrições e imagens de IA removidas.</li>
          <li>Registos financeiros e de auditoria são conservados por obrigação legal, sem o ligar a si.</li>
          <li>Se for o único proprietário de uma organização com outros membros, transfira primeiro a propriedade.</li>
        </ul>
        {error && <p role="alert" className="mb-3 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
        <form onSubmit={erase} className="grid gap-3 sm:grid-cols-2">
          <input name="password" type="password" required autoComplete="current-password" placeholder="A sua senha" aria-label="Senha" className="rounded-lg border border-nav/20 px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
          <input name="confirm" required placeholder='Escreva "ELIMINAR"' aria-label="Confirmação" pattern="ELIMINAR" className="rounded-lg border border-nav/20 px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
          <button disabled={busy} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-[#bd0024] disabled:opacity-60 sm:col-span-2">{busy ? "A eliminar…" : "Eliminar conta definitivamente"}</button>
        </form>
      </section>
    </div>
  );
}
