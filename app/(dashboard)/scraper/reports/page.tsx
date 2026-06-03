import { connection } from "next/server";
import { requirePageSession } from "@/lib/auth";
import { listScraperRunReports } from "@/lib/scraper/services/runs";
import { toScraperActor } from "@/lib/scraper/types";
import { Button } from "@/components/ui/button";
import { ReportsList } from "@/components/scraper/reports-list";
import { Download } from "lucide-react";

export default async function ScraperReportsPage() {
  await connection();
  const current = await requirePageSession();
  const actor = toScraperActor(current.user);
  const reports = await listScraperRunReports(actor, 50);
  const serializedReports = reports.map((report) => ({
    ...report,
    createdAt: report.createdAt.toISOString(),
    completedAt: report.completedAt ? report.completedAt.toISOString() : null
  }));

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex justify-end">
        <Button asChild className="shrink-0 gap-2">
          <a href="/api/scraper/records/export">
            <Download className="h-4 w-4" />
            导出全部
          </a>
        </Button>
      </div>
      <ReportsList initialReports={serializedReports} />
    </div>
  );
}
