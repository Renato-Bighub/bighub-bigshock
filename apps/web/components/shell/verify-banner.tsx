"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";

export function VerifyBanner() {
  const [state, setState] = useState<"idle" | "sent" | string>("idle");
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      await api("/v1/auth/verify-email/send");
      setState("sent");
    } catch (e) {
      setState(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#fff5f6] px-6 py-2 text-xs text-[#aa3450]">
      <span className="font-semibold">Confirme o seu e-mail para proteger a conta e poder aceitar convites.</span>
      {state === "sent" ? <span>Enviámos uma nova ligação.</span> : (
        <button onClick={resend} disabled={busy} className="font-bold underline disabled:opacity-60">Reenviar e-mail</button>
      )}
      {state !== "idle" && state !== "sent" && <span>{state}</span>}
    </div>
  );
}
