"use client";

import type { Route } from "next";
import { SectionSidebar } from "@/components/navigation/section-sidebar";
import { Database, FileSpreadsheet } from "lucide-react";

const navigation: Array<{ name: string; href: Route; icon: typeof Database }> = [
  { name: "数据采集", href: "/scraper/sources", icon: Database },
  { name: "采集报告", href: "/scraper/reports", icon: FileSpreadsheet }
];

export function ScraperSidebar() {
  return (
    <SectionSidebar
      title="智能素材采集"
      subtitle="AI 搜索 · 网页采集"
      items={navigation.map((item) => ({ ...item, label: item.name, icon: <item.icon className="h-4 w-4" /> }))}
    />
  );
}
