'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play } from 'lucide-react';

interface AudioResultCardProps {
  audioUrl: string;
  autoPlay?: boolean;
}

export function AudioResultCard({ audioUrl, autoPlay = false }: AudioResultCardProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (autoPlay && audioUrl && audioRef.current) {
      audioRef.current.play().catch(() => undefined);
    }
  }, [audioUrl, autoPlay]);

  if (!audioUrl) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          生成的语音
        </CardTitle>
      </CardHeader>
      <CardContent>
        <audio ref={audioRef} controls className="w-full rounded-[var(--radius-md)]" src={audioUrl}>
          您的浏览器不支持音频播放。
        </audio>
      </CardContent>
    </Card>
  );
}
