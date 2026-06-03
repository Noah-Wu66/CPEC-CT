"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, CheckCircle2, FileText, Loader2, Search, TriangleAlert, Wrench } from "lucide-react";

type ProgressStep = {
  type: string;
  message?: string;
  toolName?: string;
  skillKey?: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  text?: string;
  finalText?: string;
  stats?: Record<string, unknown>;
  step?: number;
};

function toolLabel(name: string) {
  const map: Record<string, string> = {
    xcrawl_search: "搜索",
    xcrawl_map: "站点地图",
    xcrawl_scrape: "抓取网页",
    xcrawl: "抓取网页",
    xcrawl_crawl: "批量爬取",
  };
  return map[name] || name;
}

function RunPanel({ steps, running, error: runError }: { steps: ProgressStep[]; running: boolean; error: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps.length]);

  return (
    <div className="custom-scrollbar max-h-[60vh] space-y-3 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] p-4">
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-3 text-sm">
          {s.type === "thinking" && (
            <>
              <Brain className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-cyan)]" />
              <span className="text-muted-foreground">{s.message}</span>
            </>
          )}
          {s.type === "tool_start" && (
            <>
              <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-gold)]" />
              <span>
                <span className="font-medium">步骤 {s.step}：{toolLabel(s.toolName || "")}</span>
                {s.args && Object.keys(s.args).length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {Object.entries(s.args).filter(([, v]) => v).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ")}
                  </span>
                )}
              </span>
            </>
          )}
          {s.type === "tool_done" && (
            <>
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--audio-green)]" />
              <span>
                <span className="font-medium">{toolLabel(s.toolName || "")} 完成</span>
                {s.result && typeof (s.result as any).records_stored === "number" && (
                  <span className="ml-2 text-xs text-muted-foreground">入库 {(s.result as any).records_stored} 条</span>
                )}
              </span>
            </>
          )}
          {s.type === "model_text" && (
            <>
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="whitespace-pre-wrap">{s.text}</span>
            </>
          )}
          {s.type === "done" && (
            <>
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--audio-green)]" />
              <span className="font-medium text-green-700 dark:text-green-400">采集完成</span>
            </>
          )}
          {s.type === "error" && (
            <>
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span className="text-destructive">{s.message}</span>
            </>
          )}
        </div>
      ))}
      {running && steps.length > 0 && steps[steps.length - 1].type !== "done" && steps[steps.length - 1].type !== "error" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          执行中…
        </div>
      )}
      {runError && (
        <div className="text-sm text-destructive font-medium">{runError}</div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

export function SourceManager() {
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [error, setError] = useState("");

  const startRun = useCallback(async () => {
    const trimmed = goal.trim();
    if (!trimmed) {
      setError("请输入采集目标");
      return;
    }

    setError("");
    setSteps([]);
    setRunning(true);

    try {
      const res = await fetch("/api/scraper/run-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: trimmed }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setError(data?.message || `请求失败 (${res.status})`);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6)) as ProgressStep;
              setSteps((prev) => [...prev, event]);
            } catch {
              continue;
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "连接失败");
    } finally {
      setRunning(false);
    }
  }, [goal]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold">采集目标</label>
              <textarea
                className="min-h-[120px] px-3 py-2 text-sm"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="例如：搜索 2026 年中国新能源出海政策，找到权威来源，抓取正文并提炼关键结论。"
                disabled={running}
              />
            </div>
            {error && <p className="alert-danger">{error}</p>}
            <Button type="button" disabled={running} onClick={startRun} className="w-fit gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {running ? "采集中…" : "开始采集"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {steps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              采集进度
              {running && <Loader2 className="h-4 w-4 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RunPanel steps={steps} running={running} error="" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
