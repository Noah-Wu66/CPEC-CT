"use client";

import type { Route } from "next";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/layout/logout-button";
import { formatRoleLabel } from "@/lib/labels";
import { Menu } from "lucide-react";

const BREADCRUMB_MAP: Record<string, string> = {
  "/": "总览看板",
  "/audio": "音频工具",
  "/audio/text-to-speech": "文本转语音",
  "/audio/tts-history": "生成历史",
  "/audio/voice-clone": "声音克隆",
  "/audio/my-voices": "我的声音",
  "/audio/subtitle-recognition": "录音识别",
  "/audio/subtitle-history": "识别历史",
  "/scraper": "数据采集",
  "/ai": "人工智能",
  "/scraper/sources": "智能任务",
  "/scraper/reports": "采集报告",
  "/settings": "账号信息",
};

type Breadcrumb = {
  label: string;
  href: Route;
};

function buildBreadcrumbs(pathname: string) {
  if (pathname === "/") return [{ label: "总览看板", href: "/" as Route }];

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Breadcrumb[] = [];

  let currentPath = "";
  for (const seg of segments) {
    currentPath += `/${seg}`;
    const label = BREADCRUMB_MAP[currentPath];
    if (label) {
      crumbs.push({ label, href: currentPath as Route });
    }
  }

  return crumbs.length > 0 ? crumbs : [{ label: "总览看板", href: "/" as Route }];
}

interface TopbarProps {
  email: string;
  role: string;
  onMenuClick?: () => void;
}

export function Topbar({ email, role, onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const initials = email.slice(0, 2).toUpperCase();
  const breadcrumbs = buildBreadcrumbs(pathname);
  const pageTitle = breadcrumbs[breadcrumbs.length - 1]?.label || "工作台";

  return (
    <header className="app-topbar md:min-h-[72px] md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenuClick}
          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] text-[var(--oa-ink)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(23,32,51,0.08)] md:hidden"
          aria-label="打开菜单"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <h1 className="app-topbar-title truncate md:text-[21px]">
            {pageTitle}
          </h1>
          <p className="mt-1 hidden truncate text-xs text-[var(--oa-muted)] sm:block">
            智创 AI 工作台 · AI 赋能数字融媒体创制
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--oa-card-border)] bg-[var(--oa-paper-soft)] p-1 pr-3.5 shadow-sm md:flex">
          <div className="app-topbar-tag flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[10px] font-bold">
            {initials}
          </div>
          <div className="flex flex-col">
            <span className="app-topbar-name text-xs font-semibold leading-tight">{email}</span>
            <span className="text-[10px] font-bold leading-tight text-[var(--oa-muted)]">
              {formatRoleLabel(role)}
            </span>
          </div>
        </div>

        <div className="app-topbar-tag flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[10px] font-bold md:hidden">
          {initials}
        </div>

        <LogoutButton />
      </div>
    </header>
  );
}
