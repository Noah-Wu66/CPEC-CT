import crypto from 'node:crypto';
import WebSocket from 'ws';
import { resolveBailianAudioConfig } from '@/lib/ai/modelRoutes';

export const QWEN_AUDIO_TTS_MODEL = 'qwen-audio-3.0-tts-plus';

export const QWEN_AUDIO_LANGUAGE_CODES = new Set([
  'zh',
  'en',
  'fr',
  'de',
  'ja',
  'ko',
  'ru',
  'pt',
  'th',
  'id',
  'vi',
  'it',
  'es',
  'ms',
  'fil',
  'ar',
]);

const SYNTHESIS_TIMEOUT_MS = 120_000;
const CUSTOMIZATION_TIMEOUT_MS = 120_000;
const MAX_AUDIO_BYTES = 500 * 1024 * 1024;

interface BailianResponse {
  code?: string;
  message?: string;
  request_id?: string;
  output?: {
    voice_id?: string;
    [key: string]: unknown;
  };
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

interface BailianSocketEvent {
  header?: {
    task_id?: string;
    event?: string;
    error_code?: string;
    error_message?: string;
    attributes?: Record<string, unknown>;
  };
  payload?: {
    usage?: {
      characters?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export class BailianAudioError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 502, code?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BailianAudioError';
    this.status = status;
    this.code = code;
  }
}

export function isBailianAudioError(error: unknown): error is BailianAudioError {
  return error instanceof BailianAudioError;
}

function abortError() {
  return new BailianAudioError('语音任务已取消', 499, 'ABORTED');
}

function normalizeBinaryData(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data.map((item) => normalizeBinaryData(item)));
  }
  throw new BailianAudioError('百炼返回了无法识别的音频数据');
}

function readSocketText(data: unknown) {
  if (typeof data === 'string') return data;
  return normalizeBinaryData(data).toString('utf8');
}

function parseSocketEvent(data: unknown): BailianSocketEvent {
  try {
    return JSON.parse(readSocketText(data)) as BailianSocketEvent;
  } catch (error) {
    throw new BailianAudioError('百炼返回了无法解析的任务消息', 502, undefined, { cause: error });
  }
}

function sendSocketEvent(socket: WebSocket, event: Record<string, unknown>) {
  if (socket.readyState !== WebSocket.OPEN) {
    throw new BailianAudioError('语音服务连接已关闭');
  }
  socket.send(JSON.stringify(event));
}

export async function synthesizeSpeech(input: {
  text: string;
  voiceId: string;
  language?: string;
  audioFormat: 'mp3' | 'wav';
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  if (input.signal?.aborted) throw abortError();

  const { apiKey, audioWebSocketUrl } = resolveBailianAudioConfig();
  const taskId = crypto.randomUUID();
  const audioChunks: Buffer[] = [];
  let totalBytes = 0;

  return await new Promise<{
    audioBuffer: Buffer;
    metadata: { taskId: string; characters?: number; requestId?: string };
  }>((resolve, reject) => {
    const socket = new WebSocket(audioWebSocketUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    let settled = false;
    let taskStarted = false;

    const cleanup = () => {
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', onAbort);
    };

    const closeSocket = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000);
      } else if (socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
      }
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      closeSocket();
      reject(error instanceof Error ? error : new BailianAudioError('语音合成失败'));
    };

    const succeed = (event: BailianSocketEvent) => {
      if (settled) return;
      if (audioChunks.length === 0) {
        fail(new BailianAudioError('语音生成完成但没有返回音频'));
        return;
      }
      settled = true;
      cleanup();
      const requestId = event.header?.attributes?.request_uuid;
      resolve({
        audioBuffer: Buffer.concat(audioChunks, totalBytes),
        metadata: {
          taskId,
          characters: event.payload?.usage?.characters,
          requestId: typeof requestId === 'string' ? requestId : undefined,
        },
      });
      closeSocket();
    };

    const onAbort = () => fail(abortError());
    const timeout = setTimeout(
      () => fail(new BailianAudioError('语音合成超时', 504, 'TIMEOUT')),
      input.timeoutMs ?? SYNTHESIS_TIMEOUT_MS
    );

    input.signal?.addEventListener('abort', onAbort, { once: true });

    socket.on('open', () => {
      try {
        const parameters: Record<string, unknown> = {
          text_type: 'PlainText',
          voice: input.voiceId,
          format: input.audioFormat,
          sample_rate: 24000,
          volume: 50,
          rate: 1,
          pitch: 1,
          enable_ssml: false,
        };
        if (input.language) {
          parameters.language_hints = [input.language];
        }

        sendSocketEvent(socket, {
          header: {
            action: 'run-task',
            task_id: taskId,
            streaming: 'duplex',
          },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model: QWEN_AUDIO_TTS_MODEL,
            parameters,
            input: {},
          },
        });
      } catch (error) {
        fail(error);
      }
    });

    socket.on('message', (data, isBinary) => {
      try {
        if (isBinary) {
          const chunk = normalizeBinaryData(data);
          totalBytes += chunk.length;
          if (totalBytes > MAX_AUDIO_BYTES) {
            throw new BailianAudioError('生成的音频超过系统大小限制', 413, 'AUDIO_TOO_LARGE');
          }
          audioChunks.push(chunk);
          return;
        }

        const event = parseSocketEvent(data);
        if (event.header?.task_id && event.header.task_id !== taskId) return;

        switch (event.header?.event) {
          case 'task-started':
            if (taskStarted) {
              throw new BailianAudioError('百炼重复启动了同一个语音任务');
            }
            taskStarted = true;
            sendSocketEvent(socket, {
              header: {
                action: 'continue-task',
                task_id: taskId,
                streaming: 'duplex',
              },
              payload: { input: { text: input.text } },
            });
            sendSocketEvent(socket, {
              header: {
                action: 'finish-task',
                task_id: taskId,
                streaming: 'duplex',
              },
              payload: { input: {} },
            });
            break;
          case 'task-finished':
            succeed(event);
            break;
          case 'task-failed':
            fail(new BailianAudioError(
              event.header.error_message || '百炼语音任务执行失败',
              502,
              event.header.error_code
            ));
            break;
        }
      } catch (error) {
        fail(error);
      }
    });

    socket.on('error', () => {
      fail(new BailianAudioError('无法连接百炼语音服务'));
    });

    socket.on('close', (code, reason) => {
      if (settled) return;
      const detail = reason?.length ? `：${reason.toString('utf8')}` : '';
      fail(new BailianAudioError(`百炼语音连接提前关闭（${code}）${detail}`));
    });
  });
}

async function readBailianResponse(response: Response): Promise<BailianResponse> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as BailianResponse;
  } catch {
    throw new BailianAudioError(`百炼返回了无法解析的响应（${response.status}）`);
  }
}

async function postVoiceCustomization(
  input: Record<string, unknown>,
  signal?: AbortSignal
): Promise<BailianResponse> {
  if (signal?.aborted) throw abortError();
  const { apiKey, audioCustomizationUrl } = resolveBailianAudioConfig();
  const timeoutSignal = AbortSignal.timeout(CUSTOMIZATION_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(audioCustomizationUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'voice-enrollment',
        input,
      }),
      signal: requestSignal,
    });
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (timeoutSignal.aborted) {
      throw new BailianAudioError('百炼声音复刻请求超时', 504, 'TIMEOUT');
    }
    throw new BailianAudioError('无法连接百炼声音复刻服务', 502, undefined, { cause: error });
  }

  const data = await readBailianResponse(response);
  if (!response.ok || data.code) {
    const status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw new BailianAudioError(
      data.message || `百炼声音复刻请求失败（${response.status}）`,
      status,
      data.code
    );
  }
  return data;
}

export async function createCustomVoice(input: {
  sourceUrl: string;
  prefix: string;
  language?: string;
  signal?: AbortSignal;
}) {
  if (!/^https:\/\//.test(input.sourceUrl)) {
    throw new BailianAudioError('声音样本必须使用公开 HTTPS 地址', 400, 'INVALID_SOURCE_URL');
  }
  if (!/^[A-Za-z0-9]{1,10}$/.test(input.prefix)) {
    throw new BailianAudioError('声音前缀只能包含英文和数字，且不能超过10位', 400, 'INVALID_PREFIX');
  }

  const payload: Record<string, unknown> = {
    action: 'create_voice',
    target_model: QWEN_AUDIO_TTS_MODEL,
    prefix: input.prefix,
    url: input.sourceUrl,
    max_prompt_audio_length: 30,
    enable_preprocess: false,
  };
  if (input.language) payload.language_hints = [input.language];

  const data = await postVoiceCustomization(payload, input.signal);
  const voiceId = data.output?.voice_id;
  if (
    typeof voiceId !== 'string'
    || !/^[A-Za-z0-9._-]{1,256}$/.test(voiceId)
  ) {
    throw new BailianAudioError('声音复刻完成但没有返回音色编号');
  }

  return {
    voiceId,
    requestId: data.request_id,
    usage: data.usage,
  };
}

export async function deleteCustomVoice(voiceId: string, signal?: AbortSignal) {
  if (typeof voiceId !== 'string' || !voiceId.trim()) {
    throw new BailianAudioError('音色编号无效', 400, 'INVALID_VOICE_ID');
  }

  const data = await postVoiceCustomization(
    {
      action: 'delete_voice',
      voice_id: voiceId,
    },
    signal
  );

  return { requestId: data.request_id };
}
