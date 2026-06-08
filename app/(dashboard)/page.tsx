import { requirePageSession } from "@/lib/auth";
import { subtitleHistoryCollection, ttsHistoryCollection, usersCollection, voicesCollection } from "@/lib/db";
import { ensureScraperBootstrap } from "@/lib/scraper/bootstrap";
import { scraperRecordsCollection, scraperSourcesCollection } from "@/lib/scraper/db";
import Link from "next/link";
import { UserCircle, AudioLines, Database, Music, Sparkles, ArrowUpRight, FolderKanban } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/page";
import { CHAT_MODELS } from "@/lib/ai/shared/models";

export default async function DashboardPage() {
  await requirePageSession();
  await ensureScraperBootstrap();

  const users = await usersCollection();
  const voices = await voicesCollection();
  const ttsHistory = await ttsHistoryCollection();
  const subtitleHistory = await subtitleHistoryCollection();
  const scraperSources = await scraperSourcesCollection();
  const scraperRecords = await scraperRecordsCollection();
  const scraperSourceIds = await scraperSources.find({ kind: "agent" }).map((item) => item._id).toArray();

  const [totalUsers, totalVoices, totalTtsHistory, totalSubtitleHistory, totalScraperSources, totalScraperRecords] = await Promise.all([
    users.countDocuments({}),
    voices.countDocuments({}),
    ttsHistory.countDocuments({}),
    subtitleHistory.countDocuments({}),
    Promise.resolve(scraperSourceIds.length),
    scraperSourceIds.length > 0 ? scraperRecords.countDocuments({ sourceId: { $in: scraperSourceIds } }) : 0
  ]);

  const chatModelCount = CHAT_MODELS.filter((m) => !m.isImageGen).length;

  const modules = [
    {
      href: "/ai",
      title: "人工智能",
      description: "Qwen 对话、文件理解、联网搜索与 Wan 图像生成。",
      icon: <Sparkles className="h-5 w-5" />,
      tone: "plum",
      stats: [
        ["对话模型", chatModelCount],
        ["核心能力", 4]
      ]
    },
    {
      href: "/audio/text-to-speech",
      title: "音频工具",
      description: "把文案快速变成配音，沉淀声音库和识别结果。",
      icon: <Music className="h-5 w-5" />,
      tone: "green",
      stats: [
        ["声音", totalVoices],
        ["TTS", totalTtsHistory],
        ["字幕", totalSubtitleHistory]
      ]
    },
    {
      href: "/scraper/sources",
      title: "数据采集",
      description: "描述采集目标，追踪搜索、抓取和报告产出。",
      icon: <Database className="h-5 w-5" />,
      tone: "cyan",
      stats: [
        ["任务", totalScraperSources],
        ["记录", totalScraperRecords]
      ]
    }
  ] as const;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <section className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="对话模型"
          value={chatModelCount}
          description="Qwen 3.7 Plus · 百炼新加坡端点"
          icon={<Sparkles className="h-5 w-5" />}
          tone="plum"
        />
        <MetricCard
          label="音频记录"
          value={totalTtsHistory + totalSubtitleHistory}
          description={`声音 ${totalVoices} · TTS ${totalTtsHistory} · 字幕 ${totalSubtitleHistory}`}
          icon={<AudioLines className="h-5 w-5" />}
          tone="green"
        />
        <MetricCard
          label="采集记录"
          value={totalScraperRecords}
          description={`任务 ${totalScraperSources} · 记录 ${totalScraperRecords}`}
          icon={<Database className="h-5 w-5" />}
          tone="cyan"
        />
        <MetricCard
          label="注册用户"
          value={totalUsers}
          description="邮箱注册 · 独立账号"
          icon={<UserCircle className="h-5 w-5" />}
          tone="blue"
        />
      </section>

      <section className="grid grid-cols-1 gap-4">
        <Card className="overflow-hidden">
          <CardContent className="p-0 md:p-0">
            <div className="border-b border-[var(--oa-card-head-border)] bg-[var(--oa-paper-soft)] px-5 py-5 text-[var(--oa-ink)] md:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--oa-red-soft-bg)] text-[var(--oa-red)]">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-heading text-xl font-bold">创制工作入口</h2>
                  <p className="mt-1 text-sm text-[var(--oa-muted)]">三大核心能力按创制流程排布，点开即可进入对应工作台。</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-3 md:p-5">
              {modules.map((item) => (
                <Link
                  href={item.href}
                  key={item.href}
                  className="group rounded-[var(--radius-lg)] border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--oa-red-soft-border)] hover:bg-[var(--oa-card-bg)] hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] ${
                        item.tone === "green" ? "bg-[var(--soft-green)] text-[var(--audio-green)]" :
                        item.tone === "plum" ? "bg-[var(--soft-plum)] text-[var(--ai-plum)]" :
                        "bg-[var(--soft-cyan)] text-[var(--data-cyan)]"
                      }`}>
                        {item.icon}
                      </div>
                      <div>
                        <h3 className="font-heading text-base font-bold text-foreground">{item.title}</h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {item.stats.map(([label, value]) => (
                      <div key={label} className="rounded-[var(--radius-md)] bg-secondary/60 px-3 py-2">
                        <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
                        <p className="mt-0.5 font-heading text-lg font-bold leading-none">{value}</p>
                      </div>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
