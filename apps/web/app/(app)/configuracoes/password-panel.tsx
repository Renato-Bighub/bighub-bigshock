"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";

export function PasswordPanel() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("next") !== f.get("confirm")) { setError("As senhas não coincidem."); setOk(false); return; }
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await api("/v1/auth/change-password", { currentPassword: f.get("current"), newPassword: f.get("next") });
      setOk(true);
      form.reset();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-nav/20 px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
  return (
    <section className="mb-6 rounded-[14px] border border-[#e0e3e9] bg-white p-5">
      <h2 className="mb-1 text-lg font-extrabold">Senha</h2>
      <p className="mb-3 text-sm text-nav/70">Ao alterar, as outras sessões terminam e enviamos-lhe um aviso por e-mail.</p>
      {ok && <p role="status" className="mb-3 rounded-lg border border-[#cfe9d6] bg-[#f1faf4] px-3 py-2 text-sm text-[#1f6b3a]">Senha alterada.</p>}
      {error && <p role="alert" className="mb-3 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <input name="current" type="password" required autoComplete="current-password" placeholder="Senha atual" aria-label="Senha atual" className={input} />
        <input name="next" type="password" required minLength={12} autoComplete="new-password" placeholder="Nova senha (mín. 12)" aria-label="Nova senha" className={input} />
        <input name="confirm" type="password" required minLength={12} autoComplete="new-password" placeholder="Repita a nova senha" aria-label="Repetir nova senha" className={input} />
        <button disabled={busy} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-[#bd0024] disabled:opacity-60 sm:col-span-3">{busy ? "A guardar…" : "Alterar senha"}</button>
      </form>
    </section>
  );
}
