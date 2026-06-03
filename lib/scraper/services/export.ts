import * as XLSX from "xlsx";
import type { ScraperRecordDoc } from "@/lib/scraper/types";
import { toScraperExportRow } from "@/lib/scraper/record-view";

export function buildScraperFlatWorkbook(records: ScraperRecordDoc[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(records.map((item) => toScraperExportRow(item))),
    "数据"
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
