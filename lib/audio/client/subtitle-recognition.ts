import type { SubtitleSentence } from "@/lib/audio/subtitle/format";

export type RecognitionMode = "text" | "subtitle";
export type RecognitionLanguage = "auto" | "zh" | "en" | "ja";
export type TranslateLanguage =
  | "original"
  | "zh"
  | "en"
  | "ja"
  | "ko"
  | "fr"
  | "de"
  | "es"
  | "pt"
  | "ru"
  | "ar"
  | "th"
  | "vi"
  | "id"
  | "it";

export const LANGUAGE_OPTIONS: Array<{ value: RecognitionLanguage; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "zh", label: "中文" },
  { value: "en", label: "英文" },
  { value: "ja", label: "日语" }
];

export const TRANSLATE_OPTIONS: Array<{ value: TranslateLanguage; label: string }> = [
  { value: "original", label: "不翻译（保留原文）" },
  { value: "zh", label: "简体中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "ru", label: "Русский" },
  { value: "ar", label: "العربية" },
  { value: "th", label: "ไทย" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "it", label: "Italiano" }
];

interface SubtitleRecognitionTaskInput {
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

interface SubtitleRecognitionTask {
  sentencesUrl: string;
  sentenceCount: number;
  durationMs: number;
}

async function readJson(response: Response) {
  return response.json();
}

export async function createSubtitleRecognitionTask(input: SubtitleRecognitionTaskInput): Promise<SubtitleRecognitionTask> {
  const response = await fetch("/api/audio/recognition/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.message || "创建任务失败");
  }
  if (data.status === "failed") {
    throw new Error(data.message || "识别任务失败");
  }

  const sentencesUrl = String(data.sentencesUrl || "").trim();
  if (!sentencesUrl) {
    throw new Error("识别完成，但没有可用内容");
  }

  return {
    sentencesUrl,
    sentenceCount: Number(data.sentenceCount) || 0,
    durationMs: Number(data.durationMs) || 0
  };
}

export async function loadSubtitleSentences(sentencesUrl: string) {
  const response = await fetch(sentencesUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("识别完成，但读取结果失败");
  }

  const data = await readJson(response);
  const sentences = Array.isArray(data) ? (data as SubtitleSentence[]) : [];
  if (sentences.length === 0) {
    throw new Error("识别完成，但没有可用内容");
  }

  return sentences;
}

export async function translateSubtitleSentences(sentences: SubtitleSentence[], targetLang: TranslateLanguage) {
  const response = await fetch("/api/audio/subtitle/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      texts: sentences.map((sentence) => sentence.text),
      targetLang
    })
  });
  const data = await readJson(response);

  if (!response.ok || !Array.isArray(data.texts) || data.texts.length !== sentences.length) {
    throw new Error(data.message || "翻译失败，请稍后重试");
  }

  return sentences.map((sentence, index) => ({
    ...sentence,
    text: String(data.texts[index])
  }));
}

export async function saveSubtitleRecognitionHistory(input: {
  fileName: string;
  fileUrl: string;
  sentencesUrl: string;
  sentenceCount: number;
  durationMs: number;
}) {
  const response = await fetch("/api/audio/subtitle/history/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error("保存识别历史失败");
  }
}
