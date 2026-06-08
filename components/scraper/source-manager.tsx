"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/page";
import { formatScraperDateTime } from "@/lib/scraper/utils";
import {
  Brain,
  CheckCircle2,
  Database,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Play,
  Plus,
  Power,
  Search,
  Trash2,
  TriangleAlert,
  Wrench,
  X
} from "lucide-react";

const AVAILABLE_SKILLS = ["xcrawl", "xcrawl-search", "xcrawl-map", "xcrawl-scrape", "xcrawl-crawl"];
const DEFAULT_MODEL = "qwen3.7-plus";

type AgentConfig = {
  goal?: string;
  model?: string;
  enabledSkills?: string[];
  defaultInputs?: Record<string, unknown>;
  constraints?: {
    maxToolCalls?: number;
    allowAsync?: boolean;
  };
};

type SourceItem = {
  id: string;
  kind: "agent";
  name: string;
  scope: "private" | "system";
  enabled: boolean;
  config: AgentConfig | Record<string, unknown>;
  lastRunAt: string | null;
};

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

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  message?: string;
};

function buildAgentConfig(goal: string): AgentConfig {
  return {
    goal: goal.trim(),
    model: DEFAULT_MODEL,
    enabledSkills: AVAILABLE_SKILLS,
    defaultInputs: {},
    constraints: { maxToolCalls: 50, allowAsync: true }
  };
}

function getGoal(source: SourceItem) {
  return typeof source.config?.goal === "string" ? source.config.goal : "";
}

function formatDateLabel(value?: string | null) {
  if (!value) {
    return "尚未运行";
  }

  return formatScraperDateTime(new Date(value));
}

function shortText(value: string, max = 180) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function toolLabel(name: string) {
  const map: Record<string, string> = {
    xcrawl_search: "搜索",
    xcrawl_map: "站点地图",
    xcrawl_scrape: "抓取网页",
    xcrawl: "抓取网页",
    xcrawl_crawl: "批量爬取"
  };
  return map[name] || name;
}

async function apiJson<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const json = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !json?.ok) {
    throw new Error(json?.message || `请求失败 (${response.status})`);
  }
  return (json.data ?? json) as T;
}

function RunPanel({ steps, running, error: runError }: { steps: ProgressStep[]; running: boolean; error: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps.length]);

  return (
    <div className="custom-scrollbar max-h-[60vh] space-y-3 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] p-4">
      {steps.map((s, i) => (
        <div key={`${s.type}-${i}`} className="flex items-start gap-3 text-sm">
          {s.type === "thinking" && (
            <>
              <Brain className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-cyan)]" />
              <span className="text-muted-foreground">{s.message}</span>
            </>
          )}
          {s.type === "tool_start" && (
            <>
              <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-gold)]" />
              <span className="min-w-0">
                <span className="font-medium">步骤 {s.step}：{toolLabel(s.toolName || "")}</span>
                {s.args && Object.keys(s.args).length > 0 ? (
                  <span className="ml-2 break-words text-xs text-muted-foreground">
                    {Object.entries(s.args).filter(([, v]) => v).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ")}
                  </span>
                ) : null}
              </span>
            </>
          )}
          {s.type === "tool_done" && (
            <>
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--audio-green)]" />
              <span>
                <span className="font-medium">{toolLabel(s.toolName || "")} 完成</span>
                {s.result && typeof (s.result as { records_stored?: unknown }).records_stored === "number" ? (
                  <span className="ml-2 text-xs text-muted-foreground">入库 {(s.result as { records_stored: number }).records_stored} 条</span>
                ) : null}
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
      {running && steps.length > 0 && steps[steps.length - 1].type !== "done" && steps[steps.length - 1].type !== "error" ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          执行中...
        </div>
      ) : null}
      {runError ? <div className="text-sm font-medium text-destructive">{runError}</div> : null}
      <div ref={bottomRef} />
    </div>
  );
}

export function SourceManager({
  initialSources,
  canManageSystem
}: {
  initialSources: SourceItem[];
  canManageSystem: boolean;
}) {
  const router = useRouter();
  const [sources, setSources] = useState(initialSources);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [activeRunName, setActiveRunName] = useState("");
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [error, setError] = useState("");
  const [runError, setRunError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setSources(initialSources);
  }, [initialSources]);

  const editingSource = useMemo(
    () => sources.find((item) => item.id === editingId) || null,
    [editingId, sources]
  );

  function resetForm() {
    setEditingId(null);
    setName("");
    setGoal("");
    setError("");
  }

  function startEdit(source: SourceItem) {
    setEditingId(source.id);
    setName(source.name);
    setGoal(getGoal(source));
    setError("");
  }

  async function saveSource() {
    const trimmedName = name.trim();
    const trimmedGoal = goal.trim();
    if (!trimmedName) {
      setError("请输入任务名称");
      return;
    }
    if (!trimmedGoal) {
      setError("请输入采集目标");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (editingSource) {
        const updated = await apiJson<SourceItem>(`/api/scraper/sources/${editingSource.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: trimmedName,
            config: buildAgentConfig(trimmedGoal)
          })
        });
        setSources((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await apiJson<SourceItem>("/api/scraper/sources", {
          method: "POST",
          body: JSON.stringify({
            kind: "agent",
            name: trimmedName,
            config: buildAgentConfig(trimmedGoal)
          })
        });
        setSources((current) => [created, ...current]);
      }
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(source: SourceItem) {
    setError("");
    try {
      const updated = await apiJson<SourceItem>(`/api/scraper/sources/${source.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !source.enabled })
      });
      setSources((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    }
  }

  async function deleteSource(source: SourceItem) {
    if (!confirm("确定删除这个采集任务吗？相关报告和采集内容也会一起删除。")) {
      return;
    }

    setDeletingId(source.id);
    setError("");
    try {
      await apiJson<{ success: boolean }>(`/api/scraper/sources/${source.id}`, { method: "DELETE" });
      setSources((current) => current.filter((item) => item.id !== source.id));
      if (editingId === source.id) {
        resetForm();
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  const runSource = useCallback(async (source: SourceItem) => {
    if (!source.enabled) {
      setRunError("这个采集任务已停用");
      return;
    }

    setRunningId(source.id);
    setActiveRunName(source.name);
    setRunError("");
    setSteps([]);

    try {
      const res = await fetch(`/api/scraper/sources/${source.id}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setRunError(data?.message || `请求失败 (${res.status})`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) {
            continue;
          }
          try {
            const event = JSON.parse(line.slice(6)) as ProgressStep;
            if (event.type === "done") {
              completed = true;
            }
            if (event.type === "error") {
              setRunError(event.message || "采集失败");
            }
            setSteps((prev) => [...prev, event]);
          } catch {
            continue;
          }
        }
      }

      if (completed) {
        setSources((current) =>
          current.map((item) => (item.id === source.id ? { ...item, lastRunAt: new Date().toISOString() } : item))
        );
      }
      router.refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "连接失败");
    } finally {
      setRunningId(null);
    }
  }, [router]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {editingSource ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingSource ? "编辑采集任务" : "新建采集任务"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="scraper-source-name">任务名称</Label>
              <Input
                id="scraper-source-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：新能源出海政策监测"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scraper-source-goal">采集目标</Label>
              <textarea
                id="scraper-source-goal"
                className="min-h-[112px] w-full rounded-[var(--radius-md)] border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-3 py-2 text-sm leading-6 text-[var(--oa-ink)] shadow-sm outline-none transition-all placeholder:text-[var(--oa-muted)] hover:border-[var(--oa-control-hover-border)] focus:border-[var(--oa-blue)] focus:ring-2 focus:ring-[rgba(29,79,115,0.18)] disabled:cursor-not-allowed disabled:bg-[var(--oa-paper-soft)] disabled:opacity-60"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="例如：搜索 2026 年中国新能源出海政策，找到权威来源，抓取正文并提炼关键结论。"
                disabled={saving}
              />
            </div>
          </div>

          {error ? <div className="alert-danger">{error}</div> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={saveSource} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {editingSource ? "保存任务" : "创建任务"}
            </Button>
            {editingSource ? (
              <Button type="button" variant="secondary" onClick={resetForm} disabled={saving} className="gap-2">
                <X className="h-4 w-4" />
                取消编辑
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">采集任务</h2>
            <p className="text-sm text-muted-foreground">保存常用采集目标，后续可以反复运行并沉淀报告。</p>
          </div>
          <Badge variant="secondary">{sources.length} 个任务</Badge>
        </div>

        {sources.length === 0 ? (
          <EmptyState
            icon={<Database className="h-6 w-6" />}
            title="还没有采集任务"
            description="先创建一个任务，再点击运行开始采集。"
          />
        ) : (
          <div className="grid gap-4">
            {sources.map((source) => {
              const sourceGoal = getGoal(source);
              const isRunning = runningId === source.id;
              const canManageSource = source.scope === "private" || canManageSystem;
              return (
                <Card key={source.id} className="border-border/80">
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">{source.name}</h3>
                          <Badge variant={source.enabled ? "success" : "warning"}>
                            {source.enabled ? "已启用" : "已停用"}
                          </Badge>
                          {source.scope === "system" ? <Badge variant="outline">系统任务</Badge> : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{shortText(sourceGoal || "未设置采集目标", 220)}</p>
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>最近运行：{formatDateLabel(source.lastRunAt)}</span>
                          <span>模型：{typeof source.config?.model === "string" ? source.config.model : DEFAULT_MODEL}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={Boolean(runningId) || !source.enabled}
                          onClick={() => runSource(source)}
                          className="gap-2"
                        >
                          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                          {isRunning ? "运行中" : "运行"}
                        </Button>
                        <Button asChild variant="secondary" size="sm" className="gap-2">
                          <Link href={`/scraper/reports?sourceId=${source.id}`}>
                            <Eye className="h-4 w-4" />
                            报告
                          </Link>
                        </Button>
                        {canManageSource ? (
                          <>
                            <Button type="button" variant="outline" size="sm" onClick={() => startEdit(source)} className="gap-2">
                              <Pencil className="h-4 w-4" />
                              编辑
                            </Button>
                            <Button type="button" variant="secondary" size="sm" onClick={() => toggleEnabled(source)} className="gap-2">
                              <Power className="h-4 w-4" />
                              {source.enabled ? "停用" : "启用"}
                            </Button>
                            {source.scope === "private" ? (
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                disabled={deletingId === source.id || Boolean(runningId)}
                                onClick={() => deleteSource(source)}
                                className="gap-2"
                              >
                                {deletingId === source.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                删除
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {(steps.length > 0 || runError) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {runningId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {activeRunName ? `${activeRunName} · 运行进度` : "运行进度"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RunPanel steps={steps} running={Boolean(runningId)} error={runError} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
