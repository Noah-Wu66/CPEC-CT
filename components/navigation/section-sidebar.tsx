"use client";

import { usePathname } from "next/navigation";
import type { NavigationItem } from "@/components/navigation/nav-links";
import { NavLinks } from "@/components/navigation/nav-links";

interface SectionSidebarProps {
  title: string;
  subtitle: string;
  items: NavigationItem[];
}

export function SectionSidebar({ title, subtitle, items }: SectionSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none lg:hidden">
        <NavLinks items={items} pathname={pathname} layout="tabbar" />
      </nav>

      <div className="section-sidebar-panel sticky top-20 hidden w-full flex-col overflow-hidden lg:flex">
        <div className="border-b border-[var(--oa-card-head-border)] px-5 py-4">
          <div className="font-heading text-sm font-bold text-[var(--oa-ink)]">{title}</div>
          <p className="mt-1 text-xs leading-5 text-[var(--oa-muted)]">{subtitle}</p>
        </div>

        <nav className="space-y-1 px-2.5 py-3">
          <NavLinks items={items} pathname={pathname} layout="sidebar" />
        </nav>
      </div>
    </>
  );
}
