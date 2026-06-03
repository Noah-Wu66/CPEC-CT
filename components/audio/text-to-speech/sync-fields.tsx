'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import type { SyncAudioFormat, SyncTTSFormState, VoiceItem } from '@/types/audio/tts';
import { PRIMARY_MODELS } from '@/lib/audio/client/tts-options';

export function SyncFields(props: {
  voices: VoiceItem[];
  loadingVoices: boolean;
  form: SyncTTSFormState;
  setForm: (next: SyncTTSFormState) => void;
  isAsync: boolean;
  onToggleAsync: (checked: boolean) => void;
}) {
  const { voices, loadingVoices, form, setForm, isAsync, onToggleAsync } = props;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>文本输入</CardTitle>
          <CardDescription>输入您要转换为语音的文本内容（≤10000字符）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sync-text">文本内容 *</Label>
            <textarea
              id="sync-text"
              placeholder="请输入要转换的文本..."
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              className="flex min-h-[170px] w-full px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="tts-async-toggle"
              type="checkbox"
              checked={isAsync}
              onChange={(e) => onToggleAsync(e.target.checked)}
              className="h-4 w-4 accent-[var(--audio-green)]"
            />
            <Label htmlFor="tts-async-toggle">切换为长篇幅模式（支持更长文本，处理时间稍长）</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sync-voiceId">音色（可选）</Label>
            {loadingVoices ? (
              <Input disabled placeholder="加载声音列表中..." />
            ) : voices.length > 0 ? (
              <select
                id="sync-voiceId"
                value={form.voiceId}
                onChange={(e) => setForm({ ...form, voiceId: e.target.value })}
                className="flex h-10 w-full px-3 py-2 text-sm"
              >
                <option value="">使用默认音色</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.voiceId}>
                    {v.name} ({v.language})
                  </option>
                ))}
              </select>
            ) : (
              <Input disabled placeholder="暂无自定义音色" />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>生成设置</CardTitle>
          <CardDescription>调整语音效果的常用参数</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>模型</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {PRIMARY_MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer flex-col rounded-[var(--radius-md)] border p-4 transition-colors ${
                    form.model === m.id ? 'border-[var(--audio-green)] bg-[var(--soft-green)]' : 'border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] hover:bg-[var(--oa-paper-soft)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="sync-model"
                    value={m.id}
                    checked={form.model === m.id}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="sr-only"
                  />
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground mt-1">{m.description}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sync-speed">语速</Label>
              <Input
                id="sync-speed"
                type="number"
                step="0.1"
                value={form.speed}
                onChange={(e) => setForm({ ...form, speed: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-vol">音量</Label>
              <Input
                id="sync-vol"
                type="number"
                step="0.1"
                value={form.vol}
                onChange={(e) => setForm({ ...form, vol: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-pitch">音高</Label>
              <Input
                id="sync-pitch"
                type="number"
                step="1"
                value={form.pitch}
                onChange={(e) => setForm({ ...form, pitch: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-format">格式</Label>
              <select
                id="sync-format"
                value={form.audioFormat}
                onChange={(e) => setForm({ ...form, audioFormat: e.target.value as SyncAudioFormat })}
                className="flex h-10 w-full px-3 py-2 text-sm"
              >
                <option value="mp3">mp3</option>
                <option value="flac">flac</option>
                <option value="wav">wav</option>
              </select>
            </div>
          </div>

          <details className="rounded-[var(--radius-md)] border border-border/80 bg-secondary/40 p-3">
            <summary className="cursor-pointer text-sm font-bold">高级设置</summary>
            <div className="grid gap-4 md:grid-cols-2 mt-3">
              <div className="space-y-2">
                <Label htmlFor="sync-englishNormalization">英文规范化</Label>
                <select
                  id="sync-englishNormalization"
                  value={String(form.englishNormalization)}
                  onChange={(e) => setForm({ ...form, englishNormalization: e.target.value === 'true' })}
                  className="flex h-10 w-full px-3 py-2 text-sm"
                >
                  <option value="false">关闭</option>
                  <option value="true">开启</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sync-sampleRate">采样率</Label>
                <Input
                  id="sync-sampleRate"
                  type="number"
                  step="1"
                  value={form.sampleRate}
                  onChange={(e) => setForm({ ...form, sampleRate: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sync-bitrate">比特率</Label>
                <Input
                  id="sync-bitrate"
                  type="number"
                  step="1"
                  value={form.bitrate}
                  onChange={(e) => setForm({ ...form, bitrate: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sync-channel">声道</Label>
                <Input
                  id="sync-channel"
                  type="number"
                  step="1"
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: Number(e.target.value) })}
                />
              </div>
            </div>
          </details>
        </CardContent>
      </Card>
    </>
  );
}
