import type { SubtitleSentence } from '@/lib/audio/subtitle/format';

const VOLCENGINE_SUBMIT_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit';
const VOLCENGINE_QUERY_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query';
const VOLCENGINE_RESOURCE_ID = 'volc.seedasr.auc';
const VOLCENGINE_SUCCESS_CODE = '20000000';
const VOLCENGINE_PROCESSING_CODES = new Set(['20000001', '20000002']);
const QUERY_INTERVAL_MS = 2000;
const QUERY_TIMEOUT_MS = 10 * 60 * 1000;

const LANGUAGE_MAP = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
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

interface VolcengineSuccessResult {
  taskId: string;
  logId?: string;
  text?: string;
  sentences: SubtitleSentence[];
  durationMs: number;
}

interface VolcengineUtterance {
  start_time?: number;
  end_time?: number;
  text?: string;
  additions?: {
    speaker?: string;
  };
}

interface VolcengineQueryBody {
  audio_info?: {
    duration?: number;
  };
  result?: {
    text?: string;
    utterances?: VolcengineUtterance[];
  };
}

interface VolcengineQueryResult {
  data: VolcengineQueryBody;
  logId?: string;
}

class VolcengineAsrError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function getVolcengineConfig() {
  const apiKey = process.env.VOLCENGINE_SPEECH_API_KEY?.trim();

  if (!apiKey) {
    throw new VolcengineAsrError('服务未配置', 500);
  }

  return {
    apiKey,
  };
}

function getAudioFormat(fileName: string): AudioFormat {
  const extension = fileName.toLowerCase().split('.').pop();

  if (extension === 'mp3' || extension === 'wav' || extension === 'ogg') {
    return extension;
  }

  throw new VolcengineAsrError('仅支持 mp3、wav、ogg 音频文件', 400);
}

function getLanguage(language: RecognitionLanguage): string | undefined {
  if (language === 'auto') {
    return undefined;
  }

  return LANGUAGE_MAP[language];
}

// 构建上下文热词（即时生效，无需在自学习平台预设词表）
// 字段：request.corpus.context，内容为 JSON 字符串 {"hotwords":[{"word":"..."}]}
function buildHotwordContext(hotwords?: string[]): string | undefined {
  if (!Array.isArray(hotwords)) {
    return undefined;
  }

  const words = hotwords
    .map((word) => (typeof word === 'string' ? word.trim() : ''))
    .filter(Boolean)
    .slice(0, 200);

  if (words.length === 0) {
    return undefined;
  }

  return JSON.stringify({ hotwords: words.map((word) => ({ word })) });
}

function getSpeakerId(utterance: VolcengineUtterance): number | undefined {
  const value = utterance.additions?.speaker;

  if (!value) {
    return undefined;
  }

  const speakerId = Number(value);
  if (Number.isNaN(speakerId)) {
    return undefined;
  }

  return speakerId;
}

function buildHeaders(requestId: string): Record<string, string> {
  const { apiKey } = getVolcengineConfig();
  return {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
    'X-Api-Resource-Id': VOLCENGINE_RESOURCE_ID,
    'X-Api-Request-Id': requestId,
  };
}

function buildSubmitHeaders(requestId: string): Record<string, string> {
  return {
    ...buildHeaders(requestId),
    'X-Api-Sequence': '-1',
  };
}

function getHeaderStatus(response: Response) {
  const code = response.headers.get('X-Api-Status-Code')?.trim() || '';
  const message = response.headers.get('X-Api-Message')?.trim() || '请求失败';
  const logId = response.headers.get('X-Tt-Logid')?.trim() || undefined;

  return { code, message, logId };
}

async function parseJson<T>(response: Response): Promise<T | undefined> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  return JSON.parse(text) as T;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getErrorStatus(code: string) {
  if (code === '20000003' || code.startsWith('45')) {
    return 400;
  }

  if (code === '55000031') {
    return 503;
  }

  return 502;
}

function getErrorMessage(code: string, message: string) {
  if (message && message !== 'OK') {
    return message;
  }

  if (code === '20000003') {
    return '没有检测到人声';
  }

  if (code === '45000002') {
    return '音频为空';
  }

  if (code === '45000131') {
    return '提交的音频总时长超过限制';
  }

  if (code === '45000132') {
    return '音频文件超过大小限制';
  }

  if (code === '45000151') {
    return '音频格式不正确';
  }

  if (code === '55000031') {
    return '服务器繁忙，请稍后再试';
  }

  return '识别任务失败';
}

async function queryRecognitionResult(taskId: string): Promise<VolcengineQueryResult> {
  const startedAt = Date.now();
  let lastLogId: string | undefined;

  while (Date.now() - startedAt < QUERY_TIMEOUT_MS) {
    const response = await fetch(VOLCENGINE_QUERY_URL, {
      method: 'POST',
      headers: buildHeaders(taskId),
      body: JSON.stringify({}),
    });

    const { code, message, logId } = getHeaderStatus(response);
    lastLogId = logId || lastLogId;

    if (code === VOLCENGINE_SUCCESS_CODE) {
      const data = await parseJson<VolcengineQueryBody>(response);

      if (!data) {
        throw new VolcengineAsrError('识别结果为空', 502);
      }

      return { data, logId: lastLogId };
    }

    if (VOLCENGINE_PROCESSING_CODES.has(code)) {
      await wait(QUERY_INTERVAL_MS);
      continue;
    }

    throw new VolcengineAsrError(getErrorMessage(code, message), getErrorStatus(code));
  }

  throw new VolcengineAsrError('识别任务处理超时', 504);
}

export function isVolcengineAsrError(error: unknown): error is VolcengineAsrError {
  return error instanceof VolcengineAsrError;
}

export async function createRecognitionTask(input: CreateRecognitionTaskInput): Promise<VolcengineSuccessResult> {
  const taskId = crypto.randomUUID();
  const audioFormat = getAudioFormat(input.fileName);
  const speakerInfoEnabled = input.mode === 'subtitle' && input.enableSpeakerInfo;
  const language = getLanguage(input.language);
  const hotwordContext = buildHotwordContext(input.hotwords);

  if (speakerInfoEnabled && input.language !== 'auto' && input.language !== 'zh') {
    throw new VolcengineAsrError('说话人识别仅支持自动或中文识别', 400);
  }

  const requestBody: Record<string, unknown> = {
    user: {
      uid: 'ai-studio',
    },
    audio: {
      url: input.fileUrl,
      format: audioFormat,
      ...(language ? { language } : {}),
    },
    request: {
      model_name: 'bigmodel',
      enable_itn: input.enableItn,
      enable_punc: input.enablePunc,
      enable_ddc: input.enableDdc,
      show_utterances: true,
      enable_speaker_info: speakerInfoEnabled,
      ...(speakerInfoEnabled ? { ssd_version: '200' } : {}),
      ...(hotwordContext ? { corpus: { context: hotwordContext } } : {}),
    },
  };

  const response = await fetch(VOLCENGINE_SUBMIT_URL, {
    method: 'POST',
    headers: buildSubmitHeaders(taskId),
    body: JSON.stringify(requestBody),
  });

  const { code, message, logId } = getHeaderStatus(response);

  if (code !== VOLCENGINE_SUCCESS_CODE) {
    throw new VolcengineAsrError(getErrorMessage(code, message), getErrorStatus(code));
  }

  const { data, logId: queryLogId } = await queryRecognitionResult(taskId);
  const utterances = data?.result?.utterances;

  if (!Array.isArray(utterances)) {
    throw new VolcengineAsrError('识别结果格式不正确', 502);
  }

  return {
    taskId,
    logId: queryLogId || logId,
    text: data?.result?.text,
    durationMs: data?.audio_info?.duration ?? 0,
    sentences: utterances.map((utterance) => ({
      begin_time: utterance.start_time ?? 0,
      end_time: utterance.end_time ?? 0,
      text: utterance.text?.trim() || '',
      speaker_id: getSpeakerId(utterance),
    })),
  };
}
