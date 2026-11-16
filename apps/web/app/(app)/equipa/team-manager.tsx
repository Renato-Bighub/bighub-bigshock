"use client";

import { assignableRoles, can, roles, type Role } from "@bigstock/contracts";
import { Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";

export interface Member { user_id: string; email: string; display_name: string | null; role: Role }
export interface Invitation { id: string; email: string; role: string; expires_at: string }

const ROLE_LABEL: Record<string, string> = { owner: "Proprietário", admin: "Administrador", member: "Membro", billing: "Faturação" };
const card = "rounded-[14px] border border-[#e0e3e9] bg-white p-5 shadow-[0_1px_3px_rgba(12,19,25,.035)]";

export function TeamManager({ orgId, myUserId, myRole, members, invitations }: {
  orgId: string; myUserId: string; myRole: Role; members: Member[]; invitations: Invitation[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = `/v1/organizations/${orgId}`;
  const inviteRoles = assignableRoles(myRole);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    await run(async () => {
      const res = await api<{ data: { email: string; token: string } }>(`${base}/invitations`, { email: f.get("email"), role: f.get("role") });
      setLink({ email: res.data.email, url: `${window.location.origin}/convites/aceitar?token=${res.data.token}` });
      setCopied(false);
      form.reset();
    });
  }

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}

      {can(myRole, "members:invite") && (
        <section className={card}>
          <h2 className="mb-3 text-lg font-extrabold">Convidar membro</h2>
          <form onSubmit={onInvite} className="flex flex-col gap-3 sm:flex-row">
            <input name="email" type="email" required placeholder="email@exemplo.com" aria-label="Email do convidado"
              className="min-w-0 flex-1 rounded-lg border border-nav/20 px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
            <select name="role" aria-label="Papel" defaultValue="member" className="rounded-lg border border-nav/20 bg-white px-3 py-2.5 text-sm">
              {inviteRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <button disabled={busy} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-60">Convidar</button>
          </form>
          {link && (
            <div className="mt-4 rounded-lg border border-[#f3dfe3] bg-[#fff5f6] p-3 text-sm">
              <p className="mb-2 font-semibold">Convite criado para {link.email}</p>
              <p className="mb-2 text-nav/70">O envio por email ainda não está disponível. Partilhe este link com o convidado (válido 7 dias, mostrado apenas agora):</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 text-xs">{link.url}</code>
                <button
                  type="button"
                  onClick={async () => { await navigator.clipboard.writeText(link.url).catch(() => undefined); setCopied(true); }}
                  className="flex items-center gap-1.5 rounded-lg border border-nav/20 bg-white px-3 py-1.5 text-xs font-semibold"
                >
                  <Copy size={14} /> {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className={card}>
        <h2 className="mb-3 text-lg font-extrabold">Membros ({members.length})</h2>
        <ul className="divide-y divide-[#eef0f3]">
          {members.map((m) => {
            const isMe = m.user_id === myUserId;
            const canRemove = can(myRole, "members:remove") && !isMe && !((m.role === "owner" || m.role === "admin") && myRole !== "owner");
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.display_name ?? m.email}{isMe && <span className="ml-2 text-xs text-nav/50">(você)</span>}</p>
                  <p className="truncate text-xs text-nav/60">{m.email}</p>
                </div>
                {can(myRole, "members:change_role") ? (
                  <select
                    aria-label={`Papel de ${m.email}`}
                    value={m.role}
                    disabled={busy}
                    onChange={(e) => run(() => api(`${base}/members/${m.user_id}`, { role: e.target.value }, "PATCH"))}
                    className="rounded-lg border border-nav/20 bg-white px-2 py-1.5 text-xs"
                  >
                    {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                ) : (
                  <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold">{ROLE_LABEL[m.role]}</span>
                )}
                {canRemove && (
                  <button
                    aria-label={`Remover ${m.email}`}
                    disabled={busy}
                    onClick={() => { if (confirm(`Remover ${m.email} da organização?`)) void run(() => api(`${base}/members/${m.user_id}`, undefined, "DELETE")); }}
                    className="rounded-lg p-2 text-brand hover:bg-brand/10"
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {can(myRole, "members:invite") && (
        <section className={card}>
          <h2 className="mb-3 text-lg font-extrabold">Convites pendentes ({invitations.length})</h2>
          {invitations.length === 0 ? (
            <p className="text-sm text-nav/60">Sem convites pendentes.</p>
          ) : (
            <ul className="divide-y divide-[#eef0f3]">
              {invitations.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{i.email}</p>
                    <p className="text-xs text-nav/60">{ROLE_LABEL[i.role]} · expira em {new Date(i.expires_at).toLocaleDateString("pt-PT")}</p>
                  </div>
                  <button
                    aria-label={`Revogar convite de ${i.email}`}
                    disabled={busy}
                    onClick={() => run(() => api(`${base}/invitations/${i.id}`, undefined, "DELETE"))}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/10"
                  >
                    Revogar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
