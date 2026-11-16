"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthShell, Field, SubmitButton } from "@/components/auth-shell";
import { api, errorMessage } from "@/lib/api";
import { safeNext } from "@/lib/next-url";
import { T, useT } from "@/components/i18n/provider";

function RegisterPageInner() {
  const t = useT();
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
      await api("/v1/auth/register", {
        email: f.get("email"),
        password: f.get("password"),
        displayName: f.get("displayName") || undefined,
        organizationName: f.get("organizationName"),
      });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <AuthShell
      title={t("Criar conta")}
      subtitle="Comece com a sua organização."
      footer={{ text: "Já tem conta?", href: `/login${suffix}`, label: "Entrar" }}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t("Nome")} name="displayName" autoComplete="name" />
        <Field label={t("Organização")} name="organizationName" required />
        <Field label={t("Email")} name="email" type="email" autoComplete="email" required />
        <Field label={t("Senha (mínimo 12 caracteres)")} name="password" type="password" autoComplete="new-password" minLength={12} required />
        {error && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
        <SubmitButton pending={pending}><T>Criar conta</T></SubmitButton>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterPageInner />
    </Suspense>
  );
}
