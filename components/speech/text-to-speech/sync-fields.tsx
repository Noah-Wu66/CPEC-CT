'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SyncAudioFormat, SyncTTSFormState, VoiceItem } from '@/types/audio/tts';
import { LANGUAGES, TTS_MODEL_NAME } from '@/lib/audio/client/tts-options';
import {
  SYSTEM_VOICES,
  type SystemVoiceCategory,
  type SystemVoiceGender,
  type SystemVoiceLanguage,
} from '@/lib/audio/client/system-voices';
import { formatAudioLanguage } from '@/lib/audio/client/format';

type VoiceCategory = SystemVoiceCategory | 'cloned';
type CategoryFilter = VoiceCategory | 'all';
type GenderFilter = SystemVoiceGender | 'all';

interface VoiceChoice {
  key: string;
  id: string;
  name: string;
  characteristic: string;
  scene: string;
  gender?: SystemVoiceGender;
  languages: readonly string[];
  category: VoiceCategory;
}

const CATEGORY_LABELS: Record<VoiceCategory, string> = {
  cloned: '我的克隆',
  flagship: '旗舰',
  featured: '精选',
};

const GENDER_LABELS: Record<SystemVoiceGender, string> = {
  female: '女声',
  male: '男声',
};

function VoiceSelector({
  voices,
  loading,
  value,
  onChange,
}: {
  voices: VoiceItem[];
  loading: boolean;
  value: string;
  onChange: (voiceId: string) => void;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [language, setLanguage] = useState('all');
  const [scene, setScene] = useState('all');
  const [gender, setGender] = useState<GenderFilter>('all');
  const [activeIndex, setActiveIndex] = useState(0);

  const choices = useMemo<VoiceChoice[]>(() => {
    const clonedChoices: VoiceChoice[] = voices.map((voice) => ({
      key: `cloned-${voice.id}`,
      id: voice.voiceId,
      name: voice.name,
      characteristic: voice.description || '专属克隆音色',
      scene: '我的克隆',
      languages: [voice.language || 'zh'],
      category: 'cloned',
    }));

    const systemChoices: VoiceChoice[] = SYSTEM_VOICES.map((voice) => ({
      key: `system-${voice.id}`,
      id: voice.id,
      name: voice.name,
      characteristic: voice.characteristic,
      scene: voice.scene,
      gender: voice.gender,
      languages: voice.languages,
      category: voice.category,
    }));

    return [...clonedChoices, ...systemChoices];
  }, [voices]);

  const availableLanguageOptions = useMemo(() => {
    const availableCodes = new Set(choices.flatMap((voice) => [...voice.languages]));
    return LANGUAGES.filter(
      (item) => item.code !== 'auto' && availableCodes.has(item.code)
    );
  }, [choices]);

  const sceneOptions = useMemo(
    () => [...new Set(SYSTEM_VOICES.map((voice) => voice.scene))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    []
  );

  const filteredChoices = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return choices.filter((voice) => {
      if (category !== 'all' && voice.category !== category) return false;
      if (language !== 'all' && !voice.languages.includes(language)) return false;
      if (scene !== 'all' && voice.scene !== scene) return false;
      if (gender !== 'all' && voice.gender !== gender) return false;

      if (!normalizedQuery) return true;

      const searchable = [
        voice.name,
        voice.id,
        voice.characteristic,
        voice.scene,
        CATEGORY_LABELS[voice.category],
        voice.gender ? GENDER_LABELS[voice.gender] : '',
        ...voice.languages.map(formatAudioLanguage),
      ]
        .join(' ')
        .toLocaleLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [category, choices, gender, language, query, scene]);

  const selectedVoice = choices.find((voice) => voice.id === value);
  const resolvedActiveIndex = Math.min(activeIndex, Math.max(filteredChoices.length - 1, 0));
  const hasFilters = Boolean(
    query || category !== 'all' || language !== 'all' || scene !== 'all' || gender !== 'all'
  );

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  const resetFilters = () => {
    setQuery('');
    setCategory('all');
    setLanguage('all');
    setScene('all');
    setGender('all');
    setActiveIndex(0);
  };

  const chooseVoice = (voice: VoiceChoice) => {
    onChange(voice.id);
    setOpen(false);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(Math.min(resolvedActiveIndex + 1, Math.max(filteredChoices.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(Math.max(resolvedActiveIndex - 1, 0));
      return;
    }

    if (event.key === 'Enter' && filteredChoices[resolvedActiveIndex]) {
      event.preventDefault();
      chooseVoice(filteredChoices[resolvedActiveIndex]);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={loading}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === 'Escape') setOpen(false);
        }}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-3 py-2 text-left text-sm text-[var(--oa-ink)] transition-colors hover:border-[var(--oa-control-hover-border)] focus-visible:border-[var(--oa-ink)] focus-visible:outline-none focus-visible:shadow-[var(--oa-control-focus-shadow)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <span className="text-[var(--oa-muted)]">加载声音列表中...</span>
        ) : selectedVoice ? (
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {selectedVoice.name}
              <span className="rounded-md bg-[var(--oa-paper-soft)] px-1.5 py-0.5 text-[11px] font-normal text-[var(--oa-muted)]">
                {CATEGORY_LABELS[selectedVoice.category]}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-[var(--oa-muted)]">
              {selectedVoice.characteristic} · {selectedVoice.scene}
            </span>
          </span>
        ) : (
          <span className="text-[var(--oa-muted)]">请选择音色</span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] shadow-lg">
          <div className="space-y-3 border-b border-[var(--oa-card-head-border)] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--oa-muted)]" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="搜索名称、ID、特质或场景"
                aria-label="搜索音色"
                className="pl-9 pr-9"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="清空搜索"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--oa-muted)] hover:bg-[var(--oa-paper-soft)] hover:text-[var(--oa-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-xs text-[var(--oa-muted)]">
                <span>来源</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as CategoryFilter)}
                  className="flex h-9 w-full rounded-lg border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-2 text-sm text-[var(--oa-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">全部来源</option>
                  <option value="cloned">我的克隆</option>
                  <option value="flagship">旗舰</option>
                  <option value="featured">精选</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-[var(--oa-muted)]">
                <span>语言</span>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="flex h-9 w-full rounded-lg border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-2 text-sm text-[var(--oa-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">全部语言</option>
                  {availableLanguageOptions.map((item) => (
                    <option key={item.code} value={item.code}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-[var(--oa-muted)]">
                <span>场景</span>
                <select
                  value={scene}
                  onChange={(event) => setScene(event.target.value)}
                  className="flex h-9 w-full rounded-lg border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-2 text-sm text-[var(--oa-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">全部场景</option>
                  {sceneOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-[var(--oa-muted)]">
                <span>性别</span>
                <select
                  value={gender}
                  onChange={(event) => setGender(event.target.value as GenderFilter)}
                  className="flex h-9 w-full rounded-lg border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-2 text-sm text-[var(--oa-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">全部性别</option>
                  <option value="female">女声</option>
                  <option value="male">男声</option>
                </select>
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-[var(--oa-muted)]" aria-live="polite">
              <span>找到 {filteredChoices.length} 个音色</span>
              {hasFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="font-medium text-[var(--oa-ink)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  清除筛选
                </button>
              ) : null}
            </div>
          </div>

          <div id={listboxId} role="listbox" aria-label="音色列表" className="max-h-[min(48vh,24rem)] overflow-y-auto p-2">
            {filteredChoices.length ? (
              filteredChoices.map((voice, index) => {
                const selected = voice.id === value;
                const active = index === resolvedActiveIndex;

                return (
                  <button
                    key={voice.key}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => chooseVoice(voice)}
                    className={`mb-1 flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors last:mb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                      active || selected ? 'bg-[var(--oa-paper-soft)]' : 'hover:bg-[var(--oa-paper-soft)]'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 font-medium text-[var(--oa-ink)]">
                        {voice.name}
                        <span className="rounded-md border border-[var(--oa-control-border)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--oa-muted)]">
                          {CATEGORY_LABELS[voice.category]}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-[var(--oa-muted)]">
                        {voice.characteristic} · {voice.scene}
                        {voice.gender ? ` · ${GENDER_LABELS[voice.gender]}` : ''}
                        {' · '}{voice.languages.map(formatAudioLanguage).join(' / ')}
                      </span>
                      <span className="mt-1 block break-all font-mono text-[10px] text-[var(--oa-muted)]">
                        {voice.id}
                      </span>
                    </span>
                    {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center text-sm text-[var(--oa-muted)]">
                没有符合条件的音色
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SyncFields(props: {
  voices: VoiceItem[];
  loadingVoices: boolean;
  form: SyncTTSFormState;
  setForm: (next: SyncTTSFormState) => void;
}) {
  const { voices, loadingVoices, form, setForm } = props;
  const selectedSystemVoice = SYSTEM_VOICES.find((voice) => voice.id === form.voiceId);
  const generationLanguages = selectedSystemVoice
    ? LANGUAGES.filter(
        (item) => item.code === 'auto'
          || selectedSystemVoice.languages.includes(item.code as SystemVoiceLanguage)
      )
    : LANGUAGES;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>文本输入</CardTitle>
          <CardDescription>输入您要转换为语音的文本内容</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="sync-text">文本内容 *</Label>
              <span className="text-xs text-[var(--oa-muted)]">{form.text.length} / 10000</span>
            </div>
            <textarea
              id="sync-text"
              placeholder="请输入要转换的文本..."
              value={form.text}
              maxLength={10000}
              onChange={(event) => setForm({ ...form, text: event.target.value })}
              className="flex min-h-[190px] w-full rounded-lg border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-3 py-2 text-sm text-[var(--oa-ink)] placeholder:text-[var(--oa-muted)] focus-visible:border-[var(--oa-ink)] focus-visible:outline-none focus-visible:shadow-[var(--oa-control-focus-shadow)]"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>音色</Label>
            <VoiceSelector
              voices={voices}
              loading={loadingVoices}
              value={form.voiceId}
              onChange={(voiceId) => {
                const nextSystemVoice = SYSTEM_VOICES.find((voice) => voice.id === voiceId);
                const languageType = nextSystemVoice
                  && form.languageType !== 'auto'
                  && !nextSystemVoice.languages.includes(form.languageType as SystemVoiceLanguage)
                  ? 'auto'
                  : form.languageType;
                setForm({ ...form, voiceId, languageType });
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>生成设置</CardTitle>
          <CardDescription>设置语言和输出格式</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>模型</Label>
            <div className="rounded-lg border border-[var(--oa-card-border)] bg-[var(--oa-paper-soft)] p-4">
              <p className="font-medium text-[var(--oa-ink)]">{TTS_MODEL_NAME}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--oa-muted)]">
                固定使用 Plus 模型，以 24kHz 单声道生成自然语音
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sync-language">语言</Label>
              <select
                id="sync-language"
                value={form.languageType}
                onChange={(event) => setForm({ ...form, languageType: event.target.value })}
                className="flex h-10 w-full rounded-lg border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-3 py-2 text-sm text-[var(--oa-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {generationLanguages.map((item) => (
                  <option key={item.code} value={item.code}>{item.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sync-format">格式</Label>
              <select
                id="sync-format"
                value={form.audioFormat}
                onChange={(event) => setForm({ ...form, audioFormat: event.target.value as SyncAudioFormat })}
                className="flex h-10 w-full rounded-lg border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-3 py-2 text-sm text-[var(--oa-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
