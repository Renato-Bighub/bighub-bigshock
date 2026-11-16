"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export interface ShellUser {
  name: string;
  orgName: string;
  role: string;
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="min-h-screen">
      {drawer && (
        <button aria-label="Fechar menu" onClick={() => setDrawer(false)} className="fixed inset-0 z-60 bg-black/50 lg:hidden" />
      )}
      <Sidebar open={drawer} onClose={() => setDrawer(false)} />
      <div className="min-w-0 lg:ml-62">
        <Topbar user={user} onMenu={() => setDrawer(true)} />
        {children}
      </div>
    </div>
  );
}
