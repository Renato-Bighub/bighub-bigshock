"use client";

import { useState } from "react";
import { AuthShell, Field, SubmitButton } from "@/components/auth-shell";
import { api, errorMessage } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api("/v1/auth/forgot-password", { email: f.get("email") });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="Esqueceu a senha?" subtitle="Indique o seu e-mail e enviamos uma ligação para a redefinir." footer={{ text: "Lembrou-se?", href: "/login", label: "Entrar" }}>
      {sent ? (
        <p role="status" className="rounded-lg border border-[#cfe9d6] bg-[#f1faf4] p-3 text-sm text-[#1f6b3a]">
          Se existir uma conta com esse e-mail, enviámos uma ligação para redefinir a senha. Verifique também o spam. A ligação é válida durante 1 hora.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="E-mail" name="email" type="email" autoComplete="email" required />
          {error && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
          <SubmitButton pending={pending}>Enviar ligação</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
