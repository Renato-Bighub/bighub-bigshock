import type { MeResponse } from "@bigstock/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Brand } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

async function getMe(): Promise<MeResponse | null> {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;
  const res = await fetch(`${API_URL}/v1/auth/me`, { headers: { cookie }, cache: "no-store" });
  return res.ok ? ((await res.json()) as MeResponse) : null;
}

export default async function Dashboard() {
  const me = await getMe();
  if (!me) redirect("/login");
  const org = me.organizations[0];
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between bg-nav px-6 py-3">
        <Brand dark />
        <div className="flex items-center gap-4 text-sm text-white">
          <span>{me.user.display_name ?? me.user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-extrabold">Olá{me.user.display_name ? `, ${me.user.display_name}` : ""}</h1>
        <p className="mt-1 text-nav/60">{org ? `${org.name} · ${org.role}` : "Sem organização"}</p>
      </main>
    </div>
  );
}
