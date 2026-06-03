export const AUDIO_LANGUAGE_LABELS: Record<string, string> = {
  zh: "中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  ru: "Русский"
};

export const AUDIO_LANGUAGE_OPTIONS = Object.entries(AUDIO_LANGUAGE_LABELS).map(([code, name]) => ({ code, name }));

export function getAudioExtension(audioUrl: string) {
  try {
    const pathname = new URL(audioUrl).pathname.toLowerCase();
    if (pathname.endsWith(".wav")) return "wav";
    if (pathname.endsWith(".flac")) return "flac";
    if (pathname.endsWith(".ogg")) return "ogg";
    if (pathname.endsWith(".m4a")) return "m4a";
  } catch {
    return "mp3";
  }

  return "mp3";
}

export function formatAudioLanguage(code: string) {
  return AUDIO_LANGUAGE_LABELS[code] || code;
}
