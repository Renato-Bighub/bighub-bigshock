import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getMe } from "@/lib/server-api";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  const org = me.organizations[0];
  return (
    <AppShell user={{ name: me.user.display_name ?? me.user.email, orgName: org?.name ?? "Sem organização", role: org?.role ?? "" }}>
      {children}
    </AppShell>
  );
}
