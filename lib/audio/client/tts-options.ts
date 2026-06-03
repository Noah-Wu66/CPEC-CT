export const PRIMARY_MODELS = [
  { id: 'speech-2.8-hd', name: 'Speech 2.8 HD', description: '官方最新高音质模型，音色细节更强' },
  { id: 'speech-2.8-turbo', name: 'Speech 2.8 Turbo', description: '官方最新高速模型，生成更快' },
] as const;

export const LATEST_SPEECH_MODEL_IDS = PRIMARY_MODELS.map((model) => model.id);

export function isLatestSpeechModel(model: unknown): model is typeof LATEST_SPEECH_MODEL_IDS[number] {
  return typeof model === 'string' && LATEST_SPEECH_MODEL_IDS.includes(model as typeof LATEST_SPEECH_MODEL_IDS[number]);
}

export const LANGUAGES = [
  { code: 'auto', name: '自动识别' },
  { code: 'Chinese', name: '中文' },
  { code: 'Chinese,Yue', name: '粤语' },
  { code: 'English', name: 'English' },
  { code: 'Arabic', name: 'العربية' },
  { code: 'Portuguese', name: 'Português' },
  { code: 'Turkish', name: 'Türkçe' },
  { code: 'Dutch', name: 'Nederlands' },
  { code: 'Ukrainian', name: 'Українська' },
  { code: 'Vietnamese', name: 'Tiếng Việt' },
  { code: 'Indonesian', name: 'Bahasa Indonesia' },
  { code: 'Japanese', name: '日本語' },
  { code: 'Italian', name: 'Italiano' },
  { code: 'Korean', name: '한국어' },
  { code: 'Thai', name: 'ไทย' },
  { code: 'Polish', name: 'Polski' },
  { code: 'Romanian', name: 'Română' },
  { code: 'Greek', name: 'Ελληνικά' },
  { code: 'Czech', name: 'Čeština' },
  { code: 'Finnish', name: 'Suomi' },
  { code: 'Hindi', name: 'हिन्दी' },
  { code: 'Bulgarian', name: 'Български' },
  { code: 'Danish', name: 'Dansk' },
  { code: 'Hebrew', name: 'עברית' },
  { code: 'Malay', name: 'Bahasa Melayu' },
  { code: 'Persian', name: 'فارسی' },
  { code: 'Slovak', name: 'Slovenčina' },
  { code: 'Swedish', name: 'Svenska' },
  { code: 'Croatian', name: 'Hrvatski' },
  { code: 'Filipino', name: 'Filipino' },
  { code: 'Hungarian', name: 'Magyar' },
  { code: 'Norwegian', name: 'Norsk' },
  { code: 'Slovenian', name: 'Slovenščina' },
  { code: 'Catalan', name: 'Català' },
  { code: 'Nynorsk', name: 'Nynorsk' },
  { code: 'Tamil', name: 'தமிழ்' },
  { code: 'Afrikaans', name: 'Afrikaans' },
  { code: 'Spanish', name: 'Español' },
  { code: 'French', name: 'Français' },
  { code: 'German', name: 'Deutsch' },
  { code: 'Russian', name: 'Русский' },
] as const;
