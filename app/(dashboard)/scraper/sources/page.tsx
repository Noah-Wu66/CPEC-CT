import { connection } from "next/server";
import { SourceManager } from "@/components/scraper/source-manager";
import { requirePageSession } from "@/lib/auth";

export default async function ScraperSourcesPage() {
  await connection();
  await requirePageSession();

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <SourceManager />
    </div>
  );
}
