'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Music, Play, RefreshCw, Trash2 } from 'lucide-react';
import { formatAudioLanguage } from '@/lib/audio/client/format';
import { EmptyState } from '@/components/ui/page';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-provider';
import { GridCardsLoading } from '@/components/layout/route-loading';
import type { VoiceItem } from '@/types/audio/tts';
import { formatTtsModelName } from '@/lib/audio/client/tts-options';

const DEFAULT_PREVIEW_TEXT = '这是一段测试音频，用于预览声音效果。';

// 单个声音卡片，独立持有预览文本 state，避免多卡片输入互相串联
function VoiceCard({
  voice,
  playingVoice,
  onPlay,
  onDelete,
}: {
  voice: VoiceItem;
  playingVoice: string | null;
  onPlay: (id: string, voiceId: string, text: string) => void;
  onDelete: (voiceId: string) => void;
}) {
  const [previewText, setPreviewText] = useState(DEFAULT_PREVIEW_TEXT);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>{voice.name}</CardTitle>
        <CardDescription className="truncate">
          {voice.description || '暂无描述'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-4">
        <div className="space-y-2">
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
            <span className="text-muted-foreground">声音ID</span>
            <span className="min-w-0 break-all font-mono sm:text-right">{voice.voiceId}</span>
          </div>
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
            <span className="text-muted-foreground">语言</span>
            <span className="break-words sm:text-right">{formatAudioLanguage(voice.language)}</span>
          </div>
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
            <span className="text-muted-foreground">模型</span>
            <span className="min-w-0 break-all sm:text-right">{formatTtsModelName(voice.model)}</span>
          </div>
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
            <span className="text-muted-foreground">创建时间</span>
            <span className="break-words sm:text-right">{new Date(voice.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor={`preview-${voice.id}`} className="text-sm font-medium">预览文本</label>
          <Input
            id={`preview-${voice.id}`}
            type="text"
            maxLength={200}
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
          />
        </div>

        <div className="mt-auto flex gap-2">
          <Button
            onClick={() => onPlay(voice.id, voice.voiceId, previewText.trim())}
            variant="outline"
            className="flex-1"
            disabled={!previewText.trim() || (playingVoice !== null && playingVoice !== voice.id)}
          >
            <Play className="mr-2 h-4 w-4" />
            试听
          </Button>
          <Button
            onClick={() => onDelete(voice.voiceId)}
            variant="outline"
            size="icon"
            className="text-destructive hover:text-destructive"
            aria-label="删除声音"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MyVoicesPage() {
  const confirmAction = useConfirm();
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  const fetchVoices = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/audio/voices');
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || '获取声音列表失败');
        return;
      }

      setVoices(data.voices || []);
    } catch {
      setError('获取声音列表失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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
  };

  const handlePlay = async (id: string, voiceId: string, text: string) => {
    if (playingVoice === id) {
      stopCurrentAudio();
      setPlayingVoice(null);
      return;
    }

    stopCurrentAudio();
    setPlayingVoice(id);
    setError('');

    try {
      const response = await fetch('/api/audio/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || '预览失败');
        setPlayingVoice(null);
        return;
      }

      if (data.audio) {
        const audio = new Audio(data.audio);

        audio.onended = () => {
          setPlayingVoice(null);
          currentAudioRef.current = null;
        };

        audio.onerror = () => {
          setError('音频播放失败');
          setPlayingVoice(null);
          currentAudioRef.current = null;
        };

        currentAudioRef.current = audio;
        await audio.play();
      } else {
        setError('未返回音频数据');
        setPlayingVoice(null);
      }
    } catch {
      setError('预览失败，请稍后重试');
      setPlayingVoice(null);
    }
  };

  const handleDelete = async (voiceId: string) => {
    const ok = await confirmAction({
      title: '删除声音',
      message: '确定要删除这个声音吗？',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) {
      return;
    }

    try {
      const response = await fetch(`/api/audio/voices/${voiceId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || '删除失败');
        return;
      }

      setVoices(voices.filter(v => v.voiceId !== voiceId));
    } catch {
      setError('删除失败，请稍后重试');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--oa-ink)]">我的声音</h2>
          {!loading ? (
            <p className="text-xs text-[var(--oa-muted)]">共 {voices.length} 个声音</p>
          ) : null}
        </div>
        <Button
          onClick={fetchVoices}
          variant="outline"
          size="icon"
          disabled={loading}
          aria-label="刷新"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="alert-danger" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <GridCardsLoading />
      ) : voices.length === 0 ? (
        <EmptyState
          icon={<Music className="h-6 w-6" />}
          title="还没有创建任何声音"
          description="前往声音克隆页面创建您的第一个声音。"
          action={
            <Link className={buttonVariants()} href="/speech/voice-clone" prefetch={false}>
              前往声音克隆
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {voices.map((voice) => (
            <VoiceCard
              key={voice.id}
              voice={voice}
              playingVoice={playingVoice}
              onPlay={handlePlay}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
