"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SubmitButton } from "@/components/auth-shell";
import { api, errorMessage } from "@/lib/api";

export function AcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/v1/invitations/accept", { token });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <p role="alert" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>}
      <SubmitButton pending={pending}>Aceitar convite</SubmitButton>
    </form>
  );
}
