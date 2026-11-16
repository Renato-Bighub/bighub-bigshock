import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getActiveOrg } from "@/lib/server-api";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, org } = await getActiveOrg();
  if (!me) redirect("/login");
  return (
    <AppShell user={{ name: me.user.display_name ?? me.user.email, orgName: org?.name ?? "Sem organização", role: org?.role ?? "", orgId: org?.id ?? "", organizations: me.organizations }}>
      {children}
    </AppShell>
  );
}
