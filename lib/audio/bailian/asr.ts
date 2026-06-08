import type { SubtitleSentence } from '@/lib/audio/subtitle/format';
import { createAsrTask, queryAsrTask } from '@/lib/audio/bailian/client';
import { extractFirstUrl } from '@/lib/ai/server/bailian/dashscope';

const LANGUAGE_MAP = {
  zh: 'zh',
  en: 'en',
  ja: 'ja',
} as const;

type RecognitionLanguage = 'auto' | keyof typeof LANGUAGE_MAP;
type RecognitionMode = 'text' | 'subtitle';
type AudioFormat = 'mp3' | 'wav' | 'ogg';

interface CreateRecognitionTaskInput {
  fileUrl: string;
  fileName: string;
  mode: RecognitionMode;
  language: RecognitionLanguage;
  enableItn: boolean;
  enablePunc: boolean;
  enableDdc: boolean;
  enableSpeakerInfo: boolean;
  hotwords?: string[];
}

interface BailianAsrSuccessResult {
  taskId: string;
  logId?: string;
  text?: string;
  sentences: SubtitleSentence[];
  durationMs: number;
}

class BailianAsrError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function getAudioFormat(fileName: string): AudioFormat {
  const extension = fileName.toLowerCase().split('.').pop();

  if (extension === 'mp3' || extension === 'wav' || extension === 'ogg') {
    return extension;
  }

  throw new BailianAsrError('仅支持 mp3、wav、ogg 音频文件', 400);
}

function getLanguage(language: RecognitionLanguage): string | undefined {
  if (language === 'auto') {
    return undefined;
  }

  return LANGUAGE_MAP[language];
}

function normalizeHotwords(hotwords?: string[]) {
  if (!Array.isArray(hotwords)) return undefined;
  const words = hotwords
    .map((word) => (typeof word === 'string' ? word.trim() : ''))
    .filter(Boolean)
    .slice(0, 200);
  return words.length > 0 ? words : undefined;
}

function normalizeSentence(item: any): SubtitleSentence {
  const begin = item?.begin_time ?? item?.start_time ?? item?.start ?? 0;
  const end = item?.end_time ?? item?.end_time ?? item?.end ?? 0;
  const speaker = item?.speaker_id ?? item?.speaker ?? item?.speakerId;

  return {
    begin_time: Number(begin) || 0,
    end_time: Number(end) || 0,
    text: typeof item?.text === 'string' ? item.text.trim() : '',
    speaker_id: Number.isFinite(Number(speaker)) ? Number(speaker) : undefined,
  };
}

function collectSentences(payload: any): SubtitleSentence[] {
  const candidates = [
    payload?.sentences,
    payload?.transcripts?.[0]?.sentences,
    payload?.results?.[0]?.sentences,
    payload?.output?.sentences,
    payload?.output?.results?.[0]?.sentences,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeSentence).filter((sentence) => sentence.text);
    }
  }

  const text =
    payload?.text ||
    payload?.transcripts?.[0]?.text ||
    payload?.results?.[0]?.text ||
    payload?.output?.text ||
    payload?.output?.results?.[0]?.text ||
    '';

  return typeof text === 'string' && text.trim()
    ? [{ begin_time: 0, end_time: 0, text: text.trim() }]
    : [];
}

function getDuration(payload: any) {
  const value =
    payload?.duration ||
    payload?.audio_duration ||
    payload?.audio_info?.duration ||
    payload?.transcripts?.[0]?.duration ||
    payload?.output?.duration ||
    0;
  return Number(value) || 0;
}

async function fetchTranscriptionPayload(taskPayload: any, signal?: AbortSignal) {
  const url =
    taskPayload?.output?.results?.[0]?.transcription_url ||
    taskPayload?.output?.transcription_url ||
    taskPayload?.results?.[0]?.transcription_url ||
    extractFirstUrl(taskPayload?.output);

  if (!url) return taskPayload;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new BailianAsrError('识别结果下载失败', 502);
  }

  return response.json();
}

export function isBailianAsrError(error: unknown): error is BailianAsrError {
  return error instanceof BailianAsrError;
}

export async function createRecognitionTask(input: CreateRecognitionTaskInput): Promise<BailianAsrSuccessResult> {
  getAudioFormat(input.fileName);
  const speakerInfoEnabled = input.mode === 'subtitle' && input.enableSpeakerInfo;
  const language = getLanguage(input.language);

  if (speakerInfoEnabled && input.language !== 'auto' && input.language !== 'zh') {
    throw new BailianAsrError('说话人识别仅支持自动或中文识别', 400);
  }

  const taskId = await createAsrTask({
    fileUrl: input.fileUrl,
    language,
    enableItn: input.enableItn,
    enablePunc: input.enablePunc,
    enableDdc: input.enableDdc,
    enableSpeakerInfo: speakerInfoEnabled,
    hotwords: normalizeHotwords(input.hotwords),
  });

  const taskPayload = await queryAsrTask(taskId);
  const resultPayload = await fetchTranscriptionPayload(taskPayload);
  const sentences = collectSentences(resultPayload);

  return {
    taskId,
    logId: taskPayload?.request_id,
    text: sentences.map((sentence) => sentence.text).join(''),
    durationMs: getDuration(resultPayload),
    sentences,
  };
}
