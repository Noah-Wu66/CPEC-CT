"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface NavigationItem {
  href: string;
  label: string;
  icon: ReactNode;
  external?: boolean;
}

function isActivePath(pathname: string, href: string) {
  if (!href.startsWith("/")) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface NavLinksProps {
  items: NavigationItem[];
  pathname: string;
  layout: "sidebar" | "tabbar";
  onNavigate?: () => void;
  tone?: "light" | "dark" | "sidebar";
  collapsed?: boolean;
}

export function NavLinks({ items, pathname, layout, onNavigate, tone = "light", collapsed }: NavLinksProps) {
  if (layout === "tabbar") {
    return (
      <>
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href as Route}
              onClick={onNavigate}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold whitespace-nowrap transition-all",
                active
                  ? "border border-[rgba(217,74,56,0.22)] bg-[rgba(217,74,56,0.08)] text-[var(--oa-red)]"
                  : "border border-[rgba(221,213,200,0.72)] bg-[rgba(255,253,248,0.72)] text-[var(--oa-muted)] hover:bg-[var(--oa-paper-soft)] hover:text-[var(--oa-ink)]"
              )}
            >
              <span className="h-3.5 w-3.5 shrink-0">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <>
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        const itemClassName = cn(
          "group flex items-center gap-3 rounded-[10px] px-4 py-3 text-sm font-bold transition-all",
          collapsed && "justify-center px-2",
          tone === "sidebar" && "app-sidebar-link",
          tone === "sidebar"
            ? active
              ? "[background:var(--oa-danger-gradient)] text-[#fffaf0] shadow-[0_10px_22px_rgba(217,74,56,0.28)]"
              : "text-[var(--oa-sidebar-item)] hover:bg-[var(--oa-sidebar-hover-bg)] hover:text-[var(--oa-sidebar-text)]"
            : tone === "dark"
            ? active
              ? "[background:linear-gradient(90deg,var(--oa-red),#b73d35)] text-[#fffaf0] shadow-[0_10px_22px_rgba(217,74,56,0.28)]"
              : "text-[#fffaf0]/75 hover:translate-x-[3px] hover:bg-[rgba(255,250,240,0.1)] hover:text-[#fffaf0]"
            : active
              ? "[background:linear-gradient(90deg,var(--oa-red),#b73d35)] text-[#fffaf0] shadow-[0_10px_22px_rgba(217,74,56,0.22)]"
              : "text-[var(--oa-muted)] hover:translate-x-[3px] hover:bg-[var(--oa-paper-soft)] hover:text-[var(--oa-ink)]"
        );

        if (item.external) {
          return (
            <a key={item.href} href={item.href} onClick={onNavigate} className={itemClassName} title={collapsed ? item.label : undefined}>
              <span className={cn("grid h-5 w-5 flex-shrink-0 place-items-center transition-opacity", active ? "opacity-100" : "opacity-75 group-hover:opacity-100")}>
                {item.icon}
              </span>
              {!collapsed && item.label}
            </a>
          );
        }

        return (
          <Link key={item.href} href={item.href as Route} onClick={onNavigate} className={itemClassName} title={collapsed ? item.label : undefined}>
            <span className={cn("grid h-5 w-5 flex-shrink-0 place-items-center transition-opacity", active ? "opacity-100" : "opacity-75 group-hover:opacity-100")}>
              {item.icon}
            </span>
            {!collapsed && item.label}
          </Link>
        );
      })}
    </>
  );
}
