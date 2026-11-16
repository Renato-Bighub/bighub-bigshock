"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { VerifyBanner } from "./verify-banner";
import { Topbar } from "./topbar";
import { useT } from "@/components/i18n/provider";

export interface ShellUser {
  name: string;
  orgName: string;
  role: string;
  orgId: string;
  organizations: { id: string; name: string; role: string }[];
  emailVerified: boolean;
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const t = useT();
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="min-h-screen">
      {drawer && (
        <button aria-label={t("Fechar menu")} onClick={() => setDrawer(false)} className="fixed inset-0 z-60 bg-black/50 lg:hidden" />
      )}
      <Sidebar open={drawer} onClose={() => setDrawer(false)} />
      <div className="min-w-0 lg:ml-62">
        <Topbar user={user} onMenu={() => setDrawer(true)} />
        {!user.emailVerified && <VerifyBanner />}
        {children}
      </div>
    </div>
  );
}
