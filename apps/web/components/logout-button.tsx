"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await api("/v1/auth/logout").catch(() => undefined);
        router.push("/login");
        router.refresh();
      }}
      className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10"
    >
      Sair
    </button>
  );
}
