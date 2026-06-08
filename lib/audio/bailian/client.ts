import { dashScopeRequest, downloadRemoteFile, extractFirstUrl, getTaskId, pollDashScopeTask } from '@/lib/ai/server/bailian/dashscope';
import {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  VOICE_CLONE_ENROLLMENT_MODEL,
  VOICE_CLONE_TARGET_MODEL,
} from '@/lib/audio/client/tts-options';

function normalizeLanguageType(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'auto';
}

export async function synthesizeSpeech(input: {
  text: string;
  voiceId?: string;
  model?: string;
  languageType?: string;
  audioFormat?: string;
  signal?: AbortSignal;
}) {
  const response = await dashScopeRequest('/services/aigc/multimodal-generation/generation', {
    body: {
      model: input.model || DEFAULT_TTS_MODEL,
      input: {
        text: input.text,
        voice: input.voiceId || DEFAULT_TTS_VOICE,
      },
      parameters: {
        language_type: normalizeLanguageType(input.languageType),
        audio_format: input.audioFormat || 'mp3',
      },
    },
    signal: input.signal,
  });

  const audioUrl = extractFirstUrl(response?.output?.audio || response?.output);
  if (!audioUrl) {
    throw new Error('语音生成完成但未返回音频地址');
  }

  return {
    audioUrl,
    raw: response,
  };
}

export async function cloneVoice(input: {
  sourceAudioUrl: string;
  voiceId: string;
  previewText?: string;
  signal?: AbortSignal;
}) {
  const started = await dashScopeRequest('/services/aigc/multimodal-generation/generation', {
    headers: { 'X-DashScope-Async': 'enable' },
    body: {
      model: VOICE_CLONE_ENROLLMENT_MODEL,
      input: {
        audio_url: input.sourceAudioUrl,
        voice: input.voiceId,
        target_model: VOICE_CLONE_TARGET_MODEL,
      },
    },
    signal: input.signal,
  });

  const taskId = getTaskId(started);
  const result = taskId
    ? await pollDashScopeTask(taskId, { signal: input.signal, timeoutMs: 15 * 60 * 1000 })
    : started;

  let previewAudioUrl = '';
  if (input.previewText) {
    const preview = await synthesizeSpeech({
      text: input.previewText,
      voiceId: input.voiceId,
      model: VOICE_CLONE_TARGET_MODEL,
      languageType: 'auto',
      audioFormat: 'mp3',
      signal: input.signal,
    });
    previewAudioUrl = preview.audioUrl;
  }

  return {
    voiceId: input.voiceId,
    previewAudioUrl,
    raw: result,
  };
}

export async function downloadAudioUrl(url: string, signal?: AbortSignal) {
  return downloadRemoteFile(url, { signal });
}

export async function createAsrTask(input: {
  fileUrl: string;
  language?: string;
  enableItn: boolean;
  enablePunc: boolean;
  enableDdc: boolean;
  enableSpeakerInfo: boolean;
  hotwords?: string[];
  signal?: AbortSignal;
}) {
  const response = await dashScopeRequest('/services/audio/asr/transcription', {
    headers: { 'X-DashScope-Async': 'enable' },
    body: {
      model: 'fun-asr',
      input: {
        file_urls: [input.fileUrl],
      },
      parameters: {
        language_hints: input.language ? [input.language] : [],
        inverse_text_normalization_enabled: input.enableItn,
        punctuation_prediction_enabled: input.enablePunc,
        disfluency_removal_enabled: input.enableDdc,
        speaker_diarization_enabled: input.enableSpeakerInfo,
        ...(Array.isArray(input.hotwords) && input.hotwords.length > 0 ? { hotwords: input.hotwords } : {}),
      },
    },
    signal: input.signal,
  });

  const taskId = getTaskId(response);
  if (!taskId) {
    throw new Error('识别任务创建成功但缺少 task_id');
  }
  return taskId;
}

export async function queryAsrTask(taskId: string, signal?: AbortSignal) {
  return pollDashScopeTask(taskId, { signal, timeoutMs: 15 * 60 * 1000 });
}
