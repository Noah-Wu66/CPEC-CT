import type { AsyncTTSFormState, SyncTTSFormState, VoiceItem } from "@/types/audio/tts";

export const DEFAULT_SYNC_TTS_FORM: SyncTTSFormState = {
  text: "",
  voiceId: "",
  model: "speech-2.8-hd",
  englishNormalization: false,
  speed: 1,
  vol: 1,
  pitch: 0,
  audioFormat: "mp3",
  sampleRate: 32000,
  bitrate: 128000,
  channel: 1
};

export const DEFAULT_ASYNC_TTS_FORM: AsyncTTSFormState = {
  text: "",
  voiceId: "",
  model: "speech-2.8-hd",
  languageBoost: "auto",
  speed: 1,
  vol: 1,
  pitch: 0,
  pronunciationToneText: "",
  audioFormat: "mp3",
  audioSampleRate: 32000,
  bitrate: 128000,
  channel: 1,
  voiceModifyPitch: 0,
  voiceModifyIntensity: 0,
  voiceModifyTimbre: 0,
  voiceModifySoundEffects: ""
};

async function readJson(response: Response) {
  return response.json();
}

export async function fetchTtsVoices(): Promise<VoiceItem[]> {
  const response = await fetch("/api/audio/voices");
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.message || "获取声音列表失败");
  }

  return Array.isArray(data.voices) ? data.voices : [];
}

export async function generateSyncTts(form: SyncTTSFormState) {
  const response = await fetch("/api/audio/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: form.text,
      voiceId: form.voiceId || undefined,
      model: form.model,
      speed: form.speed,
      vol: form.vol,
      pitch: form.pitch,
      englishNormalization: form.englishNormalization,
      audioFormat: form.audioFormat,
      sampleRate: form.sampleRate,
      bitrate: form.bitrate,
      channel: form.channel
    })
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.message || "生成失败");
  }
  if (!data.audio) {
    throw new Error("生成完成，但没有返回音频");
  }

  return String(data.audio);
}

export async function saveTtsHistory(input: {
  voiceId: string;
  text: string;
  audioUrl: string;
  model: string;
  speed: number;
  vol: number;
  pitch: number;
}) {
  const response = await fetch("/api/audio/tts/history/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voiceId: input.voiceId,
      text: input.text,
      audioUrl: input.audioUrl,
      model: input.model,
      parameters: {
        speed: input.speed,
        vol: input.vol,
        pitch: input.pitch
      }
    })
  });

  if (!response.ok) {
    throw new Error("保存历史失败");
  }
}

function buildPronunciationTone(value: string) {
  const lines = value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  return lines.length > 0 ? lines : undefined;
}

function buildVoiceModify(form: AsyncTTSFormState) {
  return {
    pitch: form.voiceModifyPitch,
    intensity: form.voiceModifyIntensity,
    timbre: form.voiceModifyTimbre,
    sound_effects: form.voiceModifySoundEffects || undefined
  };
}

export async function createAsyncTtsTask(form: AsyncTTSFormState) {
  const response = await fetch("/api/audio/tts/async", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: form.model,
      text: form.text || undefined,
      languageBoost: form.languageBoost,
      voiceId: form.voiceId || undefined,
      speed: form.speed,
      vol: form.vol,
      pitch: form.pitch,
      pronunciationTone: buildPronunciationTone(form.pronunciationToneText),
      audioFormat: form.audioFormat,
      audioSampleRate: form.audioSampleRate,
      bitrate: form.bitrate,
      channel: form.channel,
      voiceModify: buildVoiceModify(form)
    })
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.message || "创建任务失败");
  }
  if (!data.taskId) {
    throw new Error("任务创建异常，请稍后重试");
  }

  return String(data.taskId);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForAsyncTtsFile(taskId: string, shouldContinue: () => boolean) {
  const startedAt = Date.now();
  let pollCount = 0;
  const maxPolls = 150;

  while (shouldContinue()) {
    if (Date.now() - startedAt > 5 * 60 * 1000 || pollCount >= maxPolls) {
      throw new Error("语音生成耗时过长，请稍后重试");
    }

    const response = await fetch(`/api/audio/tts/async/status?taskId=${encodeURIComponent(taskId)}`);
    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(data.message || "查询任务失败");
    }
    if (data.status === "failed" || data.status === "expired") {
      throw new Error(data.message || "任务执行失败");
    }
    if (data.status === "success" && data.fileId) {
      return String(data.fileId);
    }

    pollCount += 1;
    await sleep(2000);
  }

  return null;
}

export async function downloadAsyncTtsAudio(fileId: string) {
  const response = await fetch(`/api/audio/tts/async/download?fileId=${encodeURIComponent(fileId)}`);
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.message || "下载音频失败");
  }
  if (!data.audioUrl) {
    throw new Error("下载音频失败");
  }

  return String(data.audioUrl);
}
