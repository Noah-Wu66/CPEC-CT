export const PRIMARY_MODELS = [
  { id: 'qwen3-tts-flash', name: 'Qwen3 TTS Flash', description: '百炼官方语音合成模型，适合常规文本转语音' },
] as const;

export const LATEST_SPEECH_MODEL_IDS = PRIMARY_MODELS.map((model) => model.id);

export function isLatestSpeechModel(model: unknown): model is typeof LATEST_SPEECH_MODEL_IDS[number] {
  return typeof model === 'string' && LATEST_SPEECH_MODEL_IDS.includes(model as typeof LATEST_SPEECH_MODEL_IDS[number]);
}

export const LANGUAGES = [
  { code: 'auto', name: '自动识别' },
  { code: 'Chinese', name: '中文' },
  { code: 'English', name: 'English' },
  { code: 'Japanese', name: '日本語' },
  { code: 'Korean', name: '한국어' },
  { code: 'Spanish', name: 'Español' },
  { code: 'French', name: 'Français' },
  { code: 'German', name: 'Deutsch' },
  { code: 'Russian', name: 'Русский' },
  { code: 'Italian', name: 'Italiano' },
  { code: 'Portuguese', name: 'Português' },
  { code: 'Arabic', name: 'العربية' },
  { code: 'Thai', name: 'ไทย' },
  { code: 'Vietnamese', name: 'Tiếng Việt' },
  { code: 'Indonesian', name: 'Bahasa Indonesia' },
  { code: 'Turkish', name: 'Türkçe' },
  { code: 'Dutch', name: 'Nederlands' },
  { code: 'Polish', name: 'Polski' },
  { code: 'Hindi', name: 'हिन्दी' },
] as const;

export const SYSTEM_VOICES = [
  { id: 'Cherry', name: 'Cherry' },
] as const;

export const DEFAULT_TTS_MODEL = 'qwen3-tts-flash';
export const DEFAULT_TTS_VOICE = 'Cherry';
export const VOICE_CLONE_ENROLLMENT_MODEL = 'qwen-voice-enrollment';
export const VOICE_CLONE_TARGET_MODEL = 'qwen3-tts-vc-2026-01-22';

export function isSupportedSpeechModel(model: unknown): model is string {
  return model === DEFAULT_TTS_MODEL || model === VOICE_CLONE_TARGET_MODEL;
}
