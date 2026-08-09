export const DEFAULT_TTS_MODEL = 'qwen-audio-3.0-tts-plus';
export const TTS_MODEL_NAME = 'Qwen Audio 3.0 TTS Plus';
export const DEFAULT_TTS_VOICE = 'longanlingxin';

export const LANGUAGES = [
  { code: 'auto', name: '自动识别' },
  { code: 'zh', name: '中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'ru', name: 'Русский' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'th', name: 'ไทย' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'fil', name: 'Filipino' },
  { code: 'ar', name: 'العربية' },
] as const;

export type TtsLanguageCode = (typeof LANGUAGES)[number]['code'];

export function formatTtsModelName(model: string) {
  return model === DEFAULT_TTS_MODEL ? TTS_MODEL_NAME : model;
}
