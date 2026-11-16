"use client";

import { apiScopes } from "@bigstock/contracts";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { T, useLocale, useT } from "@/components/i18n/provider";
import { intlLocale } from "@/lib/i18n/config";
import { rt } from "@/lib/i18n/runtime";


export interface ApiKeyRow { id: string; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; expires_at: string | null; revoked_at: string | null }
export interface Usage { limits: { requests_per_minute: number; requests_per_month: number }; month: { start: string; requests: number }; last_hour_requests: number }

const SCOPE_LABEL: Record<string, string> = {
  "assets:read": "Catálogo (leitura)", "licenses:read": "Licenças (leitura)", "licenses:write": "Licenciar e descarregar",
  "credits:read": "Créditos (leitura)", "ai:read": "IA (leitura)", "ai:generate": "IA (gerar)", "usage:read": "Consumo da API",
};
const card = "rounded-[14px] border border-[#e0e3e9] bg-white p-5 shadow-[0_1px_3px_rgba(12,19,25,.035)]";

export function ApiManager({ orgId, canManage, keys, usage }: { orgId: string; canManage: boolean; keys: ApiKeyRow[]; usage: Usage | null }) {
  const t = useT();
  const intl = intlLocale(useLocale());
  const num = (n: number) => new Intl.NumberFormat(intl).format(n);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [scopes, setScopes] = useState<string[]>(["assets:read", "credits:read"]);
  const hasApi = (usage?.limits.requests_per_minute ?? 0) > 0;

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const days = Number(f.get("days"));
      const r = await api<{ data: { name: string; key: string } }>(`/v1/organizations/${orgId}/api-keys`, { name: f.get("name"), scopes, ...(days ? { expiresInDays: days } : {}) });
      setSecret({ name: r.data.name, key: r.data.key });
      setCopied(false);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function revoke(k: ApiKeyRow) {
    if (!confirm(rt("Revogar a chave “{name}”? Os sistemas que a usam deixam de funcionar.", { name: k.name }))) return;
    setBusy(true);
    setError(null);
    try { await api(`/v1/organizations/${orgId}/api-keys/${k.id}`, undefined, "DELETE"); router.refresh(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}

      {usage && (
        <section className={`${card} grid gap-4 sm:grid-cols-3`}>
          <div><p className="text-xs font-semibold text-nav/60"><T>Pedidos este mês</T></p><p className="font-heading text-2xl font-extrabold">{num(usage.month.requests)}{hasApi && <span className="text-sm font-medium text-nav/50"> / {num(usage.limits.requests_per_month)}</span>}</p></div>
          <div><p className="text-xs font-semibold text-nav/60"><T>Limite por minuto (por chave)</T></p><p className="font-heading text-2xl font-extrabold">{hasApi ? num(usage.limits.requests_per_minute) : "—"}</p></div>
          <div><p className="text-xs font-semibold text-nav/60"><T>Última hora</T></p><p className="font-heading text-2xl font-extrabold">{num(usage.last_hour_requests)}</p></div>
        </section>
      )}

      {!hasApi && (
        <section className={`${card} border-[#f3dfe3] bg-[#fff5f6]`}>
          <h2 className="text-lg font-extrabold"><T>O seu plano não inclui acesso à API</T></h2>
          <p className="mt-1 text-sm text-nav/70"><T>Planos Business e API Platform incluem chaves de API, limites de pedidos e consumo medido.</T></p>
          <Link href="/planos" className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-[#bd0024]"><T>Ver planos</T></Link>
        </section>
      )}

      {canManage && hasApi && (
        <section className={card}>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold"><KeyRound size={18} /> <T>Chaves de API</T></h2>
          {secret && (
            <div className="mb-4 rounded-lg border border-[#f3dfe3] bg-[#fff5f6] p-3 text-sm">
              <p className="font-semibold"><T>Chave “</T>{secret.name}<T>” criada. Copie-a agora: não voltará a ser mostrada.</T></p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 text-xs">{secret.key}</code>
                <button type="button" onClick={async () => { await navigator.clipboard.writeText(secret.key).catch(() => undefined); setCopied(true); }} className="flex items-center gap-1.5 rounded-lg border border-nav/20 bg-white px-3 py-1.5 text-xs font-semibold"><Copy size={14} /> {copied ? t("Copiada") : t("Copiar")}</button>
              </div>
              <button type="button" onClick={() => setSecret(null)} className="mt-2 text-xs font-bold underline"><T>Já guardei a chave</T></button>
            </div>
          )}
          <form onSubmit={create} className="space-y-3 border-b border-[#eef0f3] pb-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <input name="name" required maxLength={80} placeholder={t("Nome (ex.: Website produção)")} aria-label={t("Nome da chave")} className="rounded-lg border border-nav/20 px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
              <select name="days" aria-label={t("Validade")} defaultValue="" className="rounded-lg border border-nav/20 bg-white px-3 py-2.5 text-sm"><option value="">{t("Sem expiração")}</option><option value="30">{t("30 dias")}</option><option value="90">{t("90 dias")}</option><option value="365">{t("1 ano")}</option></select>
            </div>
            <fieldset className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              <legend className="mb-1 text-xs font-semibold text-nav/60"><T>Escopos (dê só o necessário)</T></legend>
              {apiScopes.map((s) => (
                <label key={s} className="flex items-center gap-1.5"><input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))} /> {t(SCOPE_LABEL[s] ?? s)}</label>
              ))}
            </fieldset>
            <button disabled={busy || scopes.length === 0} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-[#bd0024] disabled:opacity-50"><T>Criar chave</T></button>
          </form>
          {keys.length === 0 ? <p className="pt-4 text-sm text-nav/60"><T>Ainda sem chaves.</T></p> : (
            <ul className="divide-y divide-[#eef0f3]">
              {keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{k.name} {k.revoked_at && <span className="ml-1 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-nav/60 uppercase"><T>Revogada</T></span>}</p>
                    <p className="font-mono text-xs text-nav/60">{k.prefix}…</p>
                    <p className="text-xs text-nav/50">{k.scopes.join(", ")} · {k.last_used_at ? t("usada {date}", { date: new Date(k.last_used_at).toLocaleString(intl) }) : t("nunca usada")}{k.expires_at && ` · ${t("expira {date}", { date: new Date(k.expires_at).toLocaleDateString(intl) })}`}</p>
                  </div>
                  {!k.revoked_at && <button aria-label={t("Revogar {name}", { name: k.name })} disabled={busy} onClick={() => revoke(k)} className="rounded-lg p-2 text-brand hover:bg-brand/10"><Trash2 size={17} /></button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {!canManage && <p className="text-sm text-nav/60"><T>Só proprietários e administradores gerem chaves de API.</T></p>}

      <section className={card}>
        <h2 className="mb-2 text-lg font-extrabold"><T>Primeiros passos</T></h2>
        <pre className="overflow-x-auto rounded-lg bg-nav p-3 text-xs text-white"><code>{`curl 'https://<a-sua-api>/v1/assets?q=natureza' \\
  -H 'Authorization: Bearer SUA_CHAVE'

curl -X POST 'https://<a-sua-api>/v1/licenses' \\
  -H 'Authorization: Bearer SUA_CHAVE' \\
  -H 'Idempotency-Key: pedido-0001' \\
  -H 'Content-Type: application/json' \\
  -d '{"assetId":"<id-do-ativo>"}'`}</code></pre>
        <p className="mt-3 text-sm text-nav/70"><T>Operações pagas exigem</T> <code><T>Idempotency-Key</T></code><T>; os cabeçalhos</T> <code><T>X-RateLimit-*</T></code> <T>indicam o seu limite e excesso devolve</T> <code>429</code> <T>com</T> <code><T>Retry-After</T></code>.</p>
        <p className="mt-3"><a href="/docs" target="_blank" rel="noreferrer" className="text-sm font-bold text-[#c5001f] hover:underline"><T>Abrir a documentação completa (OpenAPI) →</T></a></p>
      </section>
    </div>
  );
}
