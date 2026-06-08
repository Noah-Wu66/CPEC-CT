'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Clock, Download, FileAudio, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { formatAudioLanguage, getAudioExtension } from '@/lib/audio/client/format';
import { formatPlaybackTime, formatRelativeTime } from '@/lib/client/date';
import { downloadUrlFile, safeFileStem } from '@/lib/client/download';
import { EmptyState } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import type { VoiceItem } from '@/types/audio/tts';

interface TtsHistoryItem {
  id: string;
  voiceId: string;
  text: string;
  audioUrl: string;
  model: string;
  parameters?: Record<string, unknown>;
  createdAt: string;
}

export default function TTSHistoryPage() {
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [history, setHistory] = useState<TtsHistoryItem[]>([]);
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const fetchHistory = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/audio/tts/history');
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

  const fetchVoices = async () => {
    try {
      const response = await fetch('/api/audio/voices');
      const data = await response.json();

      if (response.ok && data.voices) {
        setVoices(data.voices);
      }
    } catch {
      setError('声音列表加载失败，请稍后刷新');
    }
  };

  const getVoiceName = (voiceId: string) => {
    const voice = voices.find(v => v.voiceId === voiceId);
    if (!voice) return voiceId || '未知声音';
    return voice.language ? `${voice.name} · ${formatAudioLanguage(voice.language)}` : voice.name;
  };

  useEffect(() => {
    fetchHistory();
    fetchVoices();

    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  const stopCurrentAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setCurrentTime(0);
    setDuration(0);
    setIsPaused(false);
  };

  const handlePlay = async (id: string, audioUrl: string) => {
    if (playingId === id) {
      if (currentAudioRef.current) {
        if (isPaused) {
          await currentAudioRef.current.play();
          setIsPaused(false);
        } else {
          currentAudioRef.current.pause();
          setIsPaused(true);
        }
      }
      return;
    }

    stopCurrentAudio();
    setPlayingId(id);
    setError('');

    try {
      const audio = new Audio(audioUrl);

      audio.onloadedmetadata = () => {
        setDuration(audio.duration);
      };

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
      };

      audio.onended = () => {
        setPlayingId(null);
        setCurrentTime(0);
        setDuration(0);
        setIsPaused(false);
        currentAudioRef.current = null;
      };

      audio.onerror = () => {
        setError('音频播放失败');
        setPlayingId(null);
        setCurrentTime(0);
        setDuration(0);
        setIsPaused(false);
        currentAudioRef.current = null;
      };

      currentAudioRef.current = audio;
      await audio.play();
    } catch {
      setError('播放失败，请稍后重试');
      setPlayingId(null);
      setCurrentTime(0);
      setDuration(0);
      setIsPaused(false);
    }
  };

  const handleSeek = (value: number[]) => {
    if (currentAudioRef.current) {
      currentAudioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleDownload = (audioUrl: string, text: string) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const truncatedText = safeFileStem(text.slice(0, 20));
      const extension = getAudioExtension(audioUrl);
      downloadUrlFile(audioUrl, `tts-${truncatedText}-${timestamp}.${extension}`);
    } catch {
      setError('下载失败，请稍后重试');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条记录吗？')) {
      return;
    }

    try {
      const response = await fetch(`/api/audio/tts/history/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || '删除失败');
        return;
      }

      setHistory(history.filter(h => h.id !== id));
    } catch {
      setError('删除失败，请稍后重试');
    }
  };

  const truncateText = (text: string, maxLength = 100) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
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
          icon={<FileAudio className="h-6 w-6" />}
          title="还没有生成记录"
          description="前往文本转语音页面生成您的第一个音频。"
          action={<Button asChild>
            <Link href="/audio/text-to-speech">
              前往文本转语音
            </Link>
          </Button>}
        />
      ) : (
        <div className="space-y-4">
          {history.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base">文本转语音</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(item.createdAt)}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handlePlay(item.id, item.audioUrl)}
                      variant="outline"
                      size="icon"
                      disabled={playingId !== null && playingId !== item.id}
                    >
                      {playingId === item.id && !isPaused ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      onClick={() => handleDownload(item.audioUrl, item.text)}
                      variant="outline"
                      size="icon"
                    >
                      <Download className="h-4 w-4" />
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
                <div className="space-y-3">
                  {playingId === item.id && (
                    <div className="space-y-2">
                      <Slider
                        value={[currentTime]}
                        max={duration || 100}
                        step={0.1}
                        onValueChange={handleSeek}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatPlaybackTime(currentTime)}</span>
                        <span>{formatPlaybackTime(duration)}</span>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="mb-1 text-sm font-bold">生成文本</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                      {truncateText(item.text, 200)}
                    </p>
                  </div>
                  <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-[var(--radius-md)] bg-secondary/50 p-3">
                      <span className="text-muted-foreground">模型</span>
                      <p className="break-words font-medium">{item.model}</p>
                    </div>
                    <div className="rounded-[var(--radius-md)] bg-secondary/50 p-3">
                      <span className="text-muted-foreground">声音名称</span>
                      <p className="break-words font-medium">{getVoiceName(item.voiceId)}</p>
                    </div>
                    <div className="rounded-[var(--radius-md)] bg-secondary/50 p-3">
                      <span className="text-muted-foreground">语言</span>
                      <p className="font-medium">{String(item.parameters?.languageType || 'auto')}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
