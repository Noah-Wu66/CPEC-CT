import crypto from 'crypto';
import { put } from '@vercel/blob';
import type { SubtitleSentence } from '@/lib/audio/subtitle/format';
import { buildAudioBlobUrl } from '@/lib/audio/storage';

function sanitizeFileStem(input: string) {
  const value = String(input || '')
    .trim()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return value || 'subtitle-result';
}

function buildSubtitleFilename(fileName: string) {
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');

  return `${sanitizeFileStem(fileName)}-${id}.json`;
}

function normalizeSentences(sentences: SubtitleSentence[]) {
  if (!Array.isArray(sentences)) {
    return [];
  }

  return sentences.map((sentence) => ({
    begin_time: Number(sentence?.begin_time) || 0,
    end_time: Number(sentence?.end_time) || 0,
    text: String(sentence?.text || '').trim(),
    ...(typeof sentence?.speaker_id === 'number' ? { speaker_id: sentence.speaker_id } : {}),
  }));
}

function getDurationMs(sentences: SubtitleSentence[]) {
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return 0;
  }

  return Number(sentences[sentences.length - 1]?.end_time) || 0;
}

export async function saveSubtitleSentences(sentences: SubtitleSentence[], fileName: string) {
  const normalized = normalizeSentences(sentences);
  const blob = await put(
    buildSubtitleFilename(fileName),
    JSON.stringify(normalized),
    {
      access: 'private',
      contentType: 'application/json',
    }
  );

  return {
    url: buildAudioBlobUrl(blob.url),
    blobUrl: blob.url,
    sentenceCount: normalized.length,
    durationMs: getDurationMs(normalized),
  };
}
