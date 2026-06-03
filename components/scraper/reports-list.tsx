"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { formatScraperDateTime } from "@/lib/scraper/utils";
import { CalendarDays, FileText, Link2, Trash2, X } from "lucide-react";
import type { ScraperRunReportItem } from "@/lib/scraper/services/runs";

type ReportItem = Omit<ScraperRunReportItem, "createdAt" | "completedAt"> & {
  createdAt: string;
  completedAt: string | null;
};

const statusConfig = {
  completed: { label: "已完成", variant: "success" as const },
  failed: { label: "失败", variant: "destructive" as const },
  running: { label: "运行中", variant: "warning" as const },
  queued: { label: "排队中", variant: "warning" as const }
} as const;

function shortText(value: string, max = 120) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatDateLabel(value?: string | null) {
  if (!value) {
    return "-";
  }

  return formatScraperDateTime(new Date(value));
}

export function ReportsList({ initialReports }: { initialReports: ReportItem[] }) {
  const router = useRouter();
  const [reports, setReports] = useState(initialReports);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const activeReport = useMemo(
    () => reports.find((item) => item.id === activeReportId) ?? null,
    [activeReportId, reports]
  );

  useEffect(() => {
    setReports(initialReports);
  }, [initialReports]);

  useEffect(() => {
    if (!activeReport) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveReportId(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeReport]);

  async function removeReport(reportId: string) {
    if (!confirm("确定删除这次采集报告吗？删除后无法恢复。")) {
      return;
    }

    setDeletingId(reportId);
    setError("");

    try {
      const response = await fetch(`/api/scraper/reports/${reportId}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        setError(json.message ?? "删除失败");
        return;
      }

      setReports((current) => current.filter((item) => item.id !== reportId));
      setActiveReportId((current) => (current === reportId ? null : current));
      router.refresh();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setDeletingId(null);
    }
  }

  if (reports.length === 0) {
    return (
      <>
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="还没有采集报告"
          description="去数据采集发起一次采集，完成后报告会出现在这里。"
          action={<Button asChild><Link href="/scraper/sources">前往数据采集</Link></Button>}
        />
        {error ? <p className="alert-danger mt-4">{error}</p> : null}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {error ? (
          <div className="rounded-[var(--radius-md)] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {reports.map((report) => {
          const status = statusConfig[report.status as keyof typeof statusConfig] ?? statusConfig.queued;
          const preview = report.finalText || report.records[0]?.summary || report.records[0]?.markdown || report.goal;
          const createdAt = formatDateLabel(report.createdAt);

          return (
            <Card
              key={report.id}
              className="cursor-pointer border-border/80 transition-all hover:-translate-y-0.5 hover:border-[var(--data-cyan)]"
              onClick={() => setActiveReportId(report.id)}
            >
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-foreground">{report.sourceName || "采集任务"}</h2>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <Badge variant="secondary" className="font-normal">
                        {report.records.length} 条内容
                      </Badge>
                    </div>

                    {report.goal ? (
                      <p className="mt-2 text-sm text-muted-foreground">{shortText(report.goal, 140)}</p>
                    ) : null}

                    {preview ? (
                      <p className="mt-3 text-sm leading-6 text-foreground/80">{shortText(preview, 220)}</p>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">点击查看这次采集的完整报告。</p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {createdAt}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        工具调用 {report.toolCalls} 次
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2" onClick={(event) => event.stopPropagation()}>
                    <Button variant="secondary" size="sm" onClick={() => setActiveReportId(report.id)}>
                      查看详情
                    </Button>
                    {report.canDelete ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deletingId === report.id}
                        onClick={() => removeReport(report.id)}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        {deletingId === report.id ? "删除中..." : "删除报告"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {activeReport ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(23,32,51,0.42)] p-4 backdrop-blur-sm"
          onClick={() => setActiveReportId(null)}
        >
          <Card
            className="custom-scrollbar my-0 max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-y-auto sm:my-2"
            onClick={(event) => event.stopPropagation()}
          >
            <CardHeader className="sticky top-0 z-10 flex flex-col items-stretch justify-between gap-4 border-b bg-card/95 pb-4 backdrop-blur sm:flex-row sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl">{activeReport.sourceName || "采集任务"}</CardTitle>
                  <Badge variant={(statusConfig[activeReport.status as keyof typeof statusConfig] ?? statusConfig.queued).variant}>
                    {(statusConfig[activeReport.status as keyof typeof statusConfig] ?? statusConfig.queued).label}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>发起时间 {formatDateLabel(activeReport.createdAt)}</span>
                  <span>完成时间 {formatDateLabel(activeReport.completedAt)}</span>
                  <span>采集内容 {activeReport.records.length} 条</span>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {activeReport.canDelete ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deletingId === activeReport.id}
                    onClick={() => removeReport(activeReport.id)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    {deletingId === activeReport.id ? "删除中..." : "删除报告"}
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon" onClick={() => setActiveReportId(null)} aria-label="关闭弹窗">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-6">
              {activeReport.goal ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">采集目标</h3>
                  <div className="rounded-[var(--radius-md)] border border-border bg-muted/40 px-4 py-3 text-sm leading-6 text-foreground">
                    {activeReport.goal}
                  </div>
                </section>
              ) : null}

              {activeReport.errorMessage ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">异常信息</h3>
                  <div className="rounded-[var(--radius-md)] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">
                    {activeReport.errorMessage}
                  </div>
                </section>
              ) : null}

              {activeReport.finalText ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">AI 总结</h3>
                  <div className="rounded-[var(--radius-md)] border border-border bg-muted/40 px-4 py-3 text-sm whitespace-pre-wrap leading-6 text-foreground">
                    {activeReport.finalText}
                  </div>
                </section>
              ) : null}

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">采集内容</h3>
                {activeReport.records.length === 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                    当前报告还没有生成内容。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeReport.records.map((record, index) => {
                      const excerpt = record.summary || record.markdown;
                      return (
                        <div key={record.id} className="rounded-[var(--radius-md)] border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                                <h4 className="text-sm font-semibold text-foreground">{record.title || "无标题"}</h4>
                              </div>
                              <a
                                href={record.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex max-w-full items-center gap-1.5 break-all text-xs text-primary hover:underline"
                              >
                                <Link2 className="h-3.5 w-3.5 shrink-0" />
                                {record.url}
                              </a>
                            </div>
                            <Badge variant="outline" className="shrink-0 font-normal">
                              {record.kind.replace("_result", "")}
                            </Badge>
                          </div>

                          {excerpt ? (
                            <div className="mt-3 rounded-[var(--radius-md)] bg-muted/40 px-3 py-3 text-sm leading-6 text-foreground">
                              {excerpt}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
