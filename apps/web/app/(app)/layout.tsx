import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getActiveOrg } from "@/lib/server-api";
import { getT } from "@/lib/i18n/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, org } = await getActiveOrg();
  const { t } = await getT();
  if (!me) redirect("/login");
  return (
    <AppShell user={{ name: me.user.display_name ?? me.user.email, orgName: org?.name ?? t("Sem organização"), role: org?.role ?? "", orgId: org?.id ?? "", organizations: me.organizations, emailVerified: me.user.email_verified }}>
      {children}
    </AppShell>
  );
}
