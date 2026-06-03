'use client';

import type { Route } from 'next';
import { SectionSidebar } from '@/components/navigation/section-sidebar';
import {
  Mic,
  FileAudio,
  Music,
  History,
  Captions,
  FileText,
} from 'lucide-react';

const navigation: Array<{ name: string; href: Route; icon: typeof FileAudio }> = [
  { name: '文本转语音', href: '/audio/text-to-speech', icon: FileAudio },
  { name: '生成历史', href: '/audio/tts-history', icon: History },
  { name: '声音克隆', href: '/audio/voice-clone', icon: Mic },
  { name: '我的声音', href: '/audio/my-voices', icon: Music },
  { name: '录音识别', href: '/audio/subtitle-recognition', icon: Captions },
  { name: '识别历史', href: '/audio/subtitle-history', icon: FileText },
];

export function Sidebar() {
  return (
    <SectionSidebar
      title="声音工作台"
      subtitle="配音 · 克隆 · 字幕"
      items={navigation.map((item) => ({ ...item, label: item.name, icon: <item.icon className="h-4 w-4" /> }))}
    />
  );
}
