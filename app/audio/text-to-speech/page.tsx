'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { AudioResultCard } from '@/components/audio/text-to-speech/audio-result-card';
import { SyncFields } from '@/components/audio/text-to-speech/sync-fields';
import type { VoiceItem } from '@/types/audio/tts';
import {
  DEFAULT_SYNC_TTS_FORM,
  fetchTtsVoices,
  generateSyncTts,
  saveTtsHistory,
} from '@/lib/audio/client/tts';
import { Button } from '@/components/ui/button';

export default function TextToSpeechPage() {
  const isMounted = useRef(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  const [syncForm, setSyncForm] = useState(DEFAULT_SYNC_TTS_FORM);

  const fetchVoices = async () => {
    setLoadingVoices(true);
    try {
      setVoices(await fetchTtsVoices());
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '获取声音列表失败');
    } finally {
      setLoadingVoices(false);
    }
  };

  useEffect(() => {
    fetchVoices();

    return () => {
      isMounted.current = false;
    };
  }, []);

  const persistHistory = (
    form: { voiceId: string; text: string; model: string; languageType: string },
    audioUrl: string
  ) => {
    return saveTtsHistory({
      voiceId: form.voiceId,
      text: form.text,
      audioUrl,
      model: form.model,
      languageType: form.languageType,
    });
  };

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setAudioUrl('');

    if (!syncForm.text) {
      setError('请输入要转换的文本');
      return;
    }

    if (syncForm.text.length > 10000) {
      setError('文本最多支持 10000 个字符，请适当精简内容');
      return;
    }

    setIsGenerating(true);

    try {
      const audioSrc = await generateSyncTts(syncForm);
      setAudioUrl(audioSrc);
      await persistHistory(syncForm, audioSrc);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '生成失败，请稍后重试');
    } finally {
      if (isMounted.current) {
        setIsGenerating(false);
      }
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <form onSubmit={handleGenerate} className="space-y-6">
        {error ? <div className="alert-danger">{error}</div> : null}

        <SyncFields
          voices={voices}
          loadingVoices={loadingVoices}
          form={syncForm}
          setForm={setSyncForm}
        />

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isGenerating}
        >
          {isGenerating ? (
            '生成中...'
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              生成语音
            </>
          )}
        </Button>
      </form>

      <AudioResultCard audioUrl={audioUrl} autoPlay />
    </div>
  );
}
