"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { BillingSummary } from "@/lib/server-api";

export interface Catalog {
  plans: { code: string; name: string; monthly_price_cents: number; annual_price_cents: number; included_credits: number; download_quota: number }[];
  credit_packs: { code: string; name: string; credits: number; price_cents: number; validity_months: number }[];
}
export interface InvoiceRow { id: string; number: string | null; amount_cents: number; tax_cents: number; currency: string; hosted_url: string | null; pdf_url: string | null; issued_at: string }

const eur = (cents: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(cents / 100);
const num = (n: number) => new Intl.NumberFormat("pt-PT").format(n);
const card = "rounded-[14px] border border-[#e0e3e9] bg-white p-5 shadow-[0_1px_3px_rgba(12,19,25,.035)]";
const STATUS: Record<string, string> = { active: "Ativa", past_due: "Pagamento em atraso", cancelled: "Cancelada", incomplete: "Incompleta" };

export function BillingManager({ orgId, canManage, summary, catalog, invoices, checkout }: {
  orgId: string; canManage: boolean; summary: BillingSummary; catalog: Catalog; invoices: InvoiceRow[]; checkout: string | null;
}) {
  const router = useRouter();
  const [interval, setInterval] = useState<"month" | "year">(summary.subscription?.interval === "year" ? "year" : "month");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Uma chave por intenção de compra: reenvios do mesmo clique não duplicam a cobrança.
  const [keys] = useState(() => new Map<string, string>());
  const key = (k: string) => { const v = keys.get(k) ?? crypto.randomUUID(); keys.set(k, v); return v; };

  const base = `/v1/organizations/${orgId}/billing`;
  const paying = summary.subscription && (summary.subscription.status === "active" || summary.subscription.status === "past_due");
  const currentIdx = catalog.plans.findIndex((p) => p.code === summary.plan_code);

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try { await fn(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }
  const redirect = (url: string) => window.location.assign(url);

  const choosePlan = (code: string) => run(code, async () => {
    if (!paying) {
      const r = await api<{ data: { url: string } }>(`${base}/checkout`, { type: "subscription", plan: code, interval }, "POST", { "Idempotency-Key": key(`sub:${code}:${interval}`) });
      redirect(r.data.url);
      return;
    }
    const r = await api<{ data: { mode: string; effective_at?: string } }>(`${base}/change-plan`, { plan: code, interval });
    setNotice(r.data.mode === "upgrade" ? "Upgrade pedido: o novo plano fica ativo de imediato, com cobrança proporcional." : `Downgrade agendado para ${new Date(r.data.effective_at!).toLocaleDateString("pt-PT")}: até lá mantém o plano atual.`);
    router.refresh();
  });
  const buyPack = (code: string) => run(code, async () => {
    const r = await api<{ data: { url: string } }>(`${base}/checkout`, { type: "credit_pack", pack: code }, "POST", { "Idempotency-Key": key(`pack:${code}`) });
    redirect(r.data.url);
  });
  const openPortal = () => run("portal", async () => {
    const r = await api<{ data: { url: string } }>(`${base}/portal`);
    redirect(r.data.url);
  });

  return (
    <div className="space-y-6">
      {checkout === "success" && (
        <p className="rounded-lg border border-[#cfe9d6] bg-[#f1faf4] px-4 py-3 text-sm text-[#1f6b3a]">
          Pagamento recebido. A confirmação demora alguns segundos.{" "}
          <button onClick={() => router.refresh()} className="font-bold underline">Atualizar</button>
        </p>
      )}
      {checkout === "cancelled" && <p className="rounded-lg bg-surface px-4 py-3 text-sm text-nav/70">Checkout cancelado. Nada foi cobrado.</p>}
      {error && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
      {notice && <p className="rounded-lg border border-[#cfe9d6] bg-[#f1faf4] px-4 py-3 text-sm text-[#1f6b3a]">{notice}</p>}

      <section className={`${card} grid gap-4 sm:grid-cols-3`}>
        <div>
          <p className="text-xs font-semibold text-nav/60">Plano atual</p>
          <p className="font-heading text-2xl font-extrabold">{summary.plan_name}</p>
          {summary.subscription && (
            <p className="mt-1 text-xs text-nav/60">
              {STATUS[summary.subscription.status] ?? summary.subscription.status} · renova em {new Date(summary.subscription.current_period_end).toLocaleDateString("pt-PT")}
              {summary.subscription.cancel_at_period_end && " (cancela no fim do período)"}
              {summary.subscription.pending_plan_code && ` · mudará para ${catalog.plans.find((p) => p.code === summary.subscription!.pending_plan_code)?.name}`}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-nav/60">Créditos de IA disponíveis</p>
          <p className="font-heading text-2xl font-extrabold">{num(summary.credits.available)}</p>
          <p className="mt-1 text-xs text-nav/60">Meus: {num(summary.credits.own)} · Do plano: {num(summary.credits.plan)} (inclui {num(summary.credits.included_per_period)} por período)</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-nav/60">Licenças neste período</p>
          <p className="font-heading text-2xl font-extrabold">{summary.downloads.used} / {summary.downloads.quota}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eaebef]"><div className="h-full bg-brand" style={{ width: `${Math.min(100, (summary.downloads.used / Math.max(1, summary.downloads.quota)) * 100)}%` }} /></div>
        </div>
        {canManage && summary.has_billing_account && (
          <div className="sm:col-span-3">
            <button onClick={openPortal} disabled={busy === "portal"} className="rounded-lg border border-nav/20 px-4 py-2 text-sm font-bold hover:border-brand disabled:opacity-60">Gerir faturação e método de pagamento</button>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Planos</h2>
          <div className="flex rounded-lg border border-nav/15 bg-white p-0.5 text-sm font-semibold">
            {(["month", "year"] as const).map((i) => (
              <button key={i} onClick={() => setInterval(i)} className={`rounded-md px-3 py-1.5 ${interval === i ? "bg-nav text-white" : ""}`}>{i === "month" ? "Mensal" : "Anual · −20%"}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {catalog.plans.filter((p) => p.code !== "free").map((p) => {
            const idx = catalog.plans.findIndex((x) => x.code === p.code);
            const current = p.code === summary.plan_code && Boolean(paying);
            const price = interval === "year" ? p.annual_price_cents / 12 : p.monthly_price_cents;
            return (
              <div key={p.code} className={`${card} flex flex-col ${current ? "border-brand ring-2 ring-brand/20" : ""}`}>
                <h3 className="text-base font-extrabold">{p.name}</h3>
                <p className="mt-2 font-heading text-3xl font-extrabold">{eur(price)}<span className="text-xs font-medium text-nav/60"> /mês</span></p>
                {interval === "year" && <p className="text-xs text-nav/60">{eur(p.annual_price_cents)} faturados por ano</p>}
                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-brand" />{num(p.included_credits)} créditos de IA por mês</li>
                  <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-brand" />{num(p.download_quota)} licenças por mês</li>
                  <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-brand" />Licença comercial</li>
                </ul>
                <button
                  disabled={!canManage || current || busy === p.code}
                  onClick={() => choosePlan(p.code)}
                  className="mt-4 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-[#bd0024] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {current ? "Plano atual" : busy === p.code ? "A processar…" : !paying ? "Assinar" : idx > currentIdx ? "Fazer upgrade" : "Mudar no próximo ciclo"}
                </button>
              </div>
            );
          })}
        </div>
        {!canManage && <p className="mt-2 text-xs text-nav/60">Só proprietários e responsáveis de faturação podem alterar o plano.</p>}
        <p className="mt-3 text-xs text-nav/50">Valores ilustrativos até à definição comercial; IVA calculado no checkout conforme o país e o NIF/VAT.</p>
      </section>

      <section id="creditos">
        <h2 className="mb-3 text-lg font-extrabold">Comprar créditos de IA</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {catalog.credit_packs.map((p) => (
            <div key={p.code} className={card}>
              <h3 className="font-extrabold">{p.name}</h3>
              <p className="mt-1 font-heading text-2xl font-extrabold">{num(p.credits)} <span className="text-sm font-medium text-nav/60">créditos</span></p>
              <p className="text-sm text-nav/70">{eur(p.price_cents)} · válidos {p.validity_months} meses</p>
              <button disabled={!canManage || busy === p.code} onClick={() => buyPack(p.code)} className="mt-3 w-full rounded-lg border border-nav/20 px-4 py-2 text-sm font-bold hover:border-brand disabled:cursor-not-allowed disabled:opacity-50">
                {busy === p.code ? "A processar…" : "Comprar"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {canManage && (
        <section className={card}>
          <h2 className="mb-3 text-lg font-extrabold">Faturas</h2>
          {invoices.length === 0 ? <p className="text-sm text-nav/60">Ainda sem faturas.</p> : (
            <ul className="divide-y divide-[#eef0f3]">
              {invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <span className="w-28 font-semibold">{i.number ?? "—"}</span>
                  <span className="text-nav/60">{new Date(i.issued_at).toLocaleDateString("pt-PT")}</span>
                  <span className="ml-auto">{eur(i.amount_cents)} <span className="text-xs text-nav/50">(IVA {eur(i.tax_cents)})</span></span>
                  {i.pdf_url && <a href={i.pdf_url} target="_blank" rel="noreferrer" className="font-bold text-[#c5001f] hover:underline">PDF</a>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
