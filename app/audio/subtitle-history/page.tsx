'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Captions, Clock, Download, RefreshCw, Trash2 } from 'lucide-react';
import {
  getSentenceDisplayText,
  msToSrtTime,
  sentencesToSrt,
  sentencesToTxt,
  type SubtitleSentence,
} from '@/lib/audio/subtitle/format';
import { formatDurationMs, formatRelativeTime } from '@/lib/client/date';
import { downloadTextFile, safeFileStem } from '@/lib/client/download';
import { EmptyState } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface SubtitleHistoryItem {
  id: string;
  fileName: string;
  fileUrl: string;
  sentencesUrl: string;
  sentenceCount: number;
  durationMs: number;
  createdAt: string;
}

export default function SubtitleHistoryPage() {
  const [history, setHistory] = useState<SubtitleHistoryItem[]>([]);
  const [details, setDetails] = useState<Record<string, SubtitleSentence[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/audio/subtitle/history');
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || '获取历史记录失败');
        return;
      }

      setHistory(data.history || []);
    } catch {
      setError('获取历史记录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const loadSentences = async (item: SubtitleHistoryItem) => {
    if (details[item.id]) return details[item.id];

    setLoadingDetailId(item.id);
    try {
      const response = await fetch(item.sentencesUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`加载字幕内容失败 (${response.status})`);
      }

      const data = await response.json();
      const sentences = Array.isArray(data) ? data : [];
      setDetails((prev) => ({ ...prev, [item.id]: sentences }));
      return sentences;
    } finally {
      setLoadingDetailId((current) => (current === item.id ? null : current));
    }
  };

  const handleToggleExpand = async (item: SubtitleHistoryItem) => {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }

    try {
      await loadSentences(item);
      setExpandedId(item.id);
    } catch {
      setError('加载字幕详情失败，请稍后重试');
    }
  };

  const handleDownloadTxt = async (item: SubtitleHistoryItem) => {
    try {
      const sentences = await loadSentences(item);
      const content = sentencesToTxt(sentences);
      downloadTextFile(`${safeFileStem(item.fileName)}.txt`, content);
    } catch {
      setError('下载 TXT 失败，请稍后重试');
    }
  };

  const handleDownloadSrt = async (item: SubtitleHistoryItem) => {
    try {
      const sentences = await loadSentences(item);
      const content = sentencesToSrt(sentences);
      downloadTextFile(`${safeFileStem(item.fileName)}.srt`, content);
    } catch {
      setError('下载 SRT 失败，请稍后重试');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条记录吗？')) {
      return;
    }

    try {
      const response = await fetch(`/api/audio/subtitle/history/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || '删除失败');
        return;
      }

      setHistory((prev) => prev.filter((item) => item.id !== id));
      setDetails((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setExpandedId((current) => (current === id ? null : current));
    } catch {
      setError('删除失败，请稍后重试');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex justify-end">
        <Button
          onClick={fetchHistory}
          variant="outline"
          size="icon"
          disabled={loading}
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="alert-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          加载中...
        </div>
      ) : history.length === 0 ? (
        <EmptyState
          icon={<Captions className="h-6 w-6" />}
          title="还没有识别记录"
          description="前往录音识别页面识别您的第一个文件。"
          action={<Button asChild>
            <Link href="/audio/subtitle-recognition">
              前往录音识别
            </Link>
          </Button>}
        />
      ) : (
        <div className="space-y-4">
          {history.map((item) => {
            const sentences = details[item.id] || [];
            const isExpanded = expandedId === item.id;
            const isLoadingDetail = loadingDetailId === item.id;

            return (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{item.fileName}</CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(item.createdAt)}
                        </span>
                        <span>{item.sentenceCount} 句</span>
                        <span>{formatDurationMs(item.durationMs)}</span>
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:ml-4">
                      <Button
                        onClick={() => handleDownloadTxt(item)}
                        variant="outline"
                        size="sm"
                        disabled={isLoadingDetail}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        TXT
                      </Button>
                      <Button
                        onClick={() => handleDownloadSrt(item)}
                        variant="outline"
                        size="sm"
                        disabled={isLoadingDetail}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        SRT
                      </Button>
                      <Button
                        onClick={() => handleDelete(item.id)}
                        variant="outline"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleExpand(item)}
                      className="text-foreground"
                      disabled={isLoadingDetail}
                    >
                      {isLoadingDetail ? '加载内容中...' : isExpanded ? '收起内容' : '展开内容'}
                    </Button>

                    {isExpanded && (
                      <div className="custom-scrollbar max-h-80 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-muted/30 p-4 font-mono text-sm">
                        {sentences.map((s, i) => (
                          <div key={i} className="mb-4 last:mb-0">
                            <div className="text-primary font-bold">{i + 1}</div>
                            <div className="text-muted-foreground">
                              {msToSrtTime(s.begin_time)} --&gt; {msToSrtTime(s.end_time)}
                            </div>
                            <div className="mt-1">{getSentenceDisplayText(s)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
