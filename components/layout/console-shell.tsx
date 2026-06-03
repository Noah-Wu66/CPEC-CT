"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Sidebar, MobileDrawer } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { Role } from "@/types/domain";

interface ConsoleShellProps {
  email: string;
  role: Role;
  children: ReactNode;
  fullBleed?: boolean;
}

export function ConsoleShell({ email, role, children, fullBleed = false }: ConsoleShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <main className="app-main flex flex-col">
        <Topbar email={email} role={role} onMenuClick={() => setDrawerOpen(true)} />
        <div className="app-content">
          <div className={fullBleed ? "site-layout-content-full animate-fade-in" : "site-layout-content animate-fade-in"}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
