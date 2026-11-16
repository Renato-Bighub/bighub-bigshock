"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { api, errorMessage } from "@/lib/api";
import { T, useT } from "@/components/i18n/provider";

function VerifyInner() {
  const t = useT();
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "ok" | { error: string }>("working");
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true; // o token é de uso único: não repetir em re-renderizações
    if (!token) { setState({ error: t("Ligação incompleta.") }); return; }
    api("/v1/auth/verify-email", { token }).then(() => setState("ok"), (e) => setState({ error: errorMessage(e) }));
  }, [token]);

  return (
    <AuthShell title={t("Confirmação de e-mail")} subtitle="" footer={{ text: "", href: "/dashboard", label: "Ir para a plataforma" }}>
      {state === "working" && <p className="text-sm text-nav/70"><T>A confirmar…</T></p>}
      {state === "ok" && <p role="status" className="rounded-lg border border-[#cfe9d6] bg-[#f1faf4] p-3 text-sm text-[#1f6b3a]"><T>E-mail confirmado. Obrigado!</T></p>}
      {typeof state === "object" && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{state.error} <T>Pode pedir um novo e-mail de confirmação dentro da plataforma.</T></p>}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
