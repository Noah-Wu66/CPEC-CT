import type { ReactNode } from "react";
import { ScraperSidebar } from "@/components/scraper/scraper-sidebar";

export default function ScraperLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
      <ScraperSidebar />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
