import type { ReactNode } from "react";
import { connection } from "next/server";
import { Suspense } from "react";
import { ConsoleShell } from "@/components/layout/console-shell";
import { requirePageSession } from "@/lib/auth";

function DashboardLayoutFallback() {
  return (
    <div className="app-shell-bg flex min-h-screen">
      <div className="hidden w-[var(--sidebar-width)] border-r border-[var(--oa-sidebar-border)] bg-[var(--oa-sidebar-bg)] md:block">
        <div className="flex h-[72px] items-center gap-3 border-b border-[var(--oa-sidebar-border)] px-4">
          <div className="h-10 w-10 animate-skeleton-pulse rounded-[10px] bg-[var(--oa-sidebar-hover-bg)]" />
          <div className="h-5 w-32 animate-skeleton-pulse rounded-[var(--radius-md)] bg-[var(--oa-sidebar-hover-bg)]" />
        </div>
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 animate-skeleton-pulse rounded-[var(--radius-md)] bg-[var(--oa-sidebar-hover-bg)]" />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col min-w-0">
        <div className="h-[72px] border-b border-[rgba(221,213,200,0.78)] bg-[rgba(255,253,248,0.86)]" />
        <div className="flex-1 p-4 md:p-8">
          <div className="space-y-4">
            <div className="h-7 w-56 animate-skeleton-pulse rounded-[var(--radius-md)] bg-muted" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-skeleton-pulse rounded-[var(--radius-lg)] bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function DashboardLayoutContent({ children }: { children: ReactNode }) {
  await connection();
  const current = await requirePageSession();

  return (
    <ConsoleShell email={current.user.email} role={current.user.role}>
      {children}
    </ConsoleShell>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<DashboardLayoutFallback />}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}
