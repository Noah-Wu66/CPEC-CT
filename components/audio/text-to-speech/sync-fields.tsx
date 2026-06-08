'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SyncAudioFormat, SyncTTSFormState, VoiceItem } from '@/types/audio/tts';
import { LANGUAGES, PRIMARY_MODELS, SYSTEM_VOICES } from '@/lib/audio/client/tts-options';

export function SyncFields(props: {
  voices: VoiceItem[];
  loadingVoices: boolean;
  form: SyncTTSFormState;
  setForm: (next: SyncTTSFormState) => void;
}) {
  const { voices, loadingVoices, form, setForm } = props;
  const selectableVoices = [
    ...SYSTEM_VOICES.map((voice) => ({
      id: voice.id,
      voiceId: voice.id,
      name: voice.name,
      language: 'system',
      model: '',
      createdAt: '',
    })),
    ...voices,
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>文本输入</CardTitle>
          <CardDescription>输入您要转换为语音的文本内容</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sync-text">文本内容 *</Label>
            <textarea
              id="sync-text"
              placeholder="请输入要转换的文本..."
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              className="flex min-h-[190px] w-full px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sync-voiceId">音色</Label>
            {loadingVoices ? (
              <Input disabled placeholder="加载声音列表中..." />
            ) : (
              <select
                id="sync-voiceId"
                value={form.voiceId}
                onChange={(e) => setForm({ ...form, voiceId: e.target.value })}
                className="flex h-10 w-full px-3 py-2 text-sm"
              >
                {selectableVoices.map((voice) => (
                  <option key={voice.id} value={voice.voiceId}>
                    {voice.language && voice.language !== 'system' ? `${voice.name} (${voice.language})` : voice.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>生成设置</CardTitle>
          <CardDescription>选择百炼语音模型和输出格式</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>模型</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {PRIMARY_MODELS.map((model) => (
                <label
                  key={model.id}
                  className={`flex cursor-pointer flex-col rounded-[var(--radius-md)] border p-4 transition-colors ${
                    form.model === model.id ? 'border-[var(--audio-green)] bg-[var(--soft-green)]' : 'border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] hover:bg-[var(--oa-paper-soft)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="sync-model"
                    value={model.id}
                    checked={form.model === model.id}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="sr-only"
                  />
                  <span className="font-medium">{model.name}</span>
                  <span className="text-xs text-muted-foreground mt-1">{model.description}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sync-language">语言</Label>
              <select
                id="sync-language"
                value={form.languageType}
                onChange={(e) => setForm({ ...form, languageType: e.target.value })}
                className="flex h-10 w-full px-3 py-2 text-sm"
              >
                {LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
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
                <option value="wav">wav</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
