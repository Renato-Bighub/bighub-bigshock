"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell, Field, SubmitButton } from "@/components/auth-shell";
import { api, errorMessage } from "@/lib/api";

function ResetInner() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) {
      setError("As senhas não coincidem.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api("/v1/auth/reset-password", { token, password: f.get("password") });
      router.push("/login?reset=1");
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <AuthShell title="Nova senha" subtitle="Escolha uma senha com pelo menos 12 caracteres." footer={{ text: "Ligação expirou?", href: "/esqueci-senha", label: "Pedir outra" }}>
      {!token ? (
        <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">Ligação incompleta. Peça uma nova.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nova senha" name="password" type="password" autoComplete="new-password" minLength={12} required />
          <Field label="Repita a senha" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
          {error && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
          <SubmitButton pending={pending}>Guardar senha</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
