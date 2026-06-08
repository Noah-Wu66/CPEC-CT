import type { SyncTTSFormState, VoiceItem } from "@/types/audio/tts";
import { DEFAULT_TTS_MODEL, DEFAULT_TTS_VOICE } from "@/lib/audio/client/tts-options";

export const DEFAULT_SYNC_TTS_FORM: SyncTTSFormState = {
  text: "",
  voiceId: "",
  model: DEFAULT_TTS_MODEL,
  languageType: "auto",
  audioFormat: "mp3",
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
      voiceId: form.voiceId || DEFAULT_TTS_VOICE,
      model: form.model,
      languageType: form.languageType,
      audioFormat: form.audioFormat,
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
  languageType: string;
}) {
  const response = await fetch("/api/audio/tts/history/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voiceId: input.voiceId || DEFAULT_TTS_VOICE,
      text: input.text,
      audioUrl: input.audioUrl,
      model: input.model,
      parameters: {
        languageType: input.languageType,
      },
    })
  });

  if (!response.ok) {
    throw new Error("保存历史失败");
  }
}
