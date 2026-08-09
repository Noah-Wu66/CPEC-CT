import { LANGUAGES } from '@/lib/audio/client/tts-options';

export const AUDIO_LANGUAGE_OPTIONS = LANGUAGES.filter((language) => language.code !== 'auto');

export const AUDIO_LANGUAGE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  LANGUAGES.map((language) => [language.code, language.name])
);

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
