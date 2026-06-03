'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { AsyncFields } from '@/components/audio/text-to-speech/async-fields';
import { AudioResultCard } from '@/components/audio/text-to-speech/audio-result-card';
import { SyncFields } from '@/components/audio/text-to-speech/sync-fields';
import type { TTSMode, VoiceItem } from '@/types/audio/tts';
import {
  createAsyncTtsTask,
  DEFAULT_ASYNC_TTS_FORM,
  DEFAULT_SYNC_TTS_FORM,
  downloadAsyncTtsAudio,
  fetchTtsVoices,
  generateSyncTts,
  saveTtsHistory,
  waitForAsyncTtsFile,
} from '@/lib/audio/client/tts';
import { Button } from '@/components/ui/button';

export default function TextToSpeechPage() {
  const isMounted = useRef(true);
  const [mode, setMode] = useState<TTSMode>('sync');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  const [syncForm, setSyncForm] = useState(DEFAULT_SYNC_TTS_FORM);
  const [asyncForm, setAsyncForm] = useState(DEFAULT_ASYNC_TTS_FORM);

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
    form: { voiceId: string; text: string; model: string; speed: number; vol: number; pitch: number },
    audioUrl: string
  ) => {
    return saveTtsHistory({
      voiceId: form.voiceId,
      text: form.text,
      audioUrl,
      model: form.model,
      speed: form.speed,
      vol: form.vol,
      pitch: form.pitch,
    });
  };

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setAudioUrl('');

    if (mode === 'sync' && !syncForm.text) {
      setError('请输入要转换的文本');
      return;
    }

    if (mode === 'async' && !asyncForm.text) {
      setError('请输入要转换的文本');
      return;
    }

    if (mode === 'async' && asyncForm.text.length > 50000) {
      setError('长篇幅模式最多支持 50000 个字符，请适当精简内容');
      return;
    }

    setIsGenerating(true);

    try {
      if (mode === 'sync') {
        const audioSrc = await generateSyncTts(syncForm);
        setAudioUrl(audioSrc);
        await persistHistory(syncForm, audioSrc);
        return;
      }

      const taskId = await createAsyncTtsTask(asyncForm);
      const fileId = await waitForAsyncTtsFile(taskId, () => isMounted.current);
      if (!isMounted.current) return;

      if (!fileId) {
        setError('语音文件获取失败，请重新生成');
        return;
      }

      const url = await downloadAsyncTtsAudio(fileId);
      setAudioUrl(url);
      await persistHistory(asyncForm, url);
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

        {mode === 'sync' ? (
          <SyncFields
            voices={voices}
            loadingVoices={loadingVoices}
            form={syncForm}
            setForm={setSyncForm}
            isAsync={false}
            onToggleAsync={(checked) => setMode(checked ? 'async' : 'sync')}
          />
        ) : (
          <AsyncFields
            voices={voices}
            loadingVoices={loadingVoices}
            form={asyncForm}
            setForm={setAsyncForm}
            isAsync={true}
            onToggleAsync={(checked) => setMode(checked ? 'async' : 'sync')}
          />
        )}

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
