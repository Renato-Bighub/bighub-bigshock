"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell, Field, SubmitButton } from "@/components/auth-shell";
import { api, errorMessage } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api("/v1/auth/register", {
        email: f.get("email"),
        password: f.get("password"),
        displayName: f.get("displayName") || undefined,
        organizationName: f.get("organizationName"),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Criar conta"
      subtitle="Comece com a sua organização."
      footer={{ text: "Já tem conta?", href: "/login", label: "Entrar" }}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nome" name="displayName" autoComplete="name" />
        <Field label="Organização" name="organizationName" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Senha (mínimo 12 caracteres)" name="password" type="password" autoComplete="new-password" minLength={12} required />
        {error && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
        <SubmitButton pending={pending}>Criar conta</SubmitButton>
      </form>
    </AuthShell>
  );
}
