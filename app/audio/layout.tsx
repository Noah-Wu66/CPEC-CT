import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/layout/console-shell";
import { Sidebar } from "@/components/audio/layout/audio-sidebar";
import { requirePageSession } from "@/lib/auth";

export default async function AudioLayout({ children }: { children: ReactNode }) {
  const current = await requirePageSession();

  return (
    <ConsoleShell email={current.user.email} role={current.user.role}>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
        <Sidebar />
        <div className="min-w-0">{children}</div>
      </div>
    </ConsoleShell>
  );
}
