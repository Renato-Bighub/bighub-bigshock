"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthShell, Field, SubmitButton } from "@/components/auth-shell";
import { api, errorMessage } from "@/lib/api";
import { safeNext } from "@/lib/next-url";

function LoginPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNext(search.get("next"));
  const suffix = search.get("next") ? `?next=${encodeURIComponent(next)}` : "";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api("/v1/auth/login", { email: f.get("email"), password: f.get("password") });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Entrar"
      subtitle="Aceda à sua conta BIGstock."
      footer={{ text: "Ainda não tem conta?", href: `/register${suffix}`, label: "Criar conta" }}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
        {error && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
        <SubmitButton pending={pending}>Entrar</SubmitButton>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}
