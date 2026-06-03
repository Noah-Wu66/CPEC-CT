import crypto from 'crypto';
import { put } from '@vercel/blob';

const AUDIO_MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
  'application/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
};

const AUDIO_FORMAT_TO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
};

const AUDIO_BLOB_ROUTE_PREFIX = '/api/audio/blob';

function makeFilename(prefix: string, ext: string) {
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
  return `${prefix}-${id}.${ext}`;
}

function getExtFromMimeType(mimeType: string) {
  return AUDIO_MIME_TO_EXT[String(mimeType || '').toLowerCase()] || 'mp3';
}

export function getAudioMimeType(audioFormat?: string) {
  const normalized = String(audioFormat || '').trim().toLowerCase();
  return AUDIO_FORMAT_TO_MIME[normalized] || 'audio/mpeg';
}

export function isHttpUrl(input: string) {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidAudioUrl(input: string) {
  if (typeof input !== 'string') return false;
  if (input.startsWith('/api/audio/blob')) return true;
  return isHttpUrl(input);
}

export function isVercelBlobUrl(input: string) {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' &&
      host.endsWith('.vercel-storage.com') &&
      host.includes('.blob.');
  } catch {
    return false;
  }
}

export function isPrivateBlobUrl(input: string) {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' &&
      host.endsWith('.vercel-storage.com') &&
      host.includes('.private.blob.');
  } catch {
    return false;
  }
}

export function buildAudioBlobUrl(blobUrl: string) {
  const normalized = String(blobUrl || '').trim();
  return normalized
    ? `${AUDIO_BLOB_ROUTE_PREFIX}?url=${encodeURIComponent(normalized)}`
    : AUDIO_BLOB_ROUTE_PREFIX;
}

function isLikelyHexString(input: string) {
  return input.length > 128 && /^[0-9a-fA-F]+$/.test(input);
}

function isLikelyBase64String(input: string) {
  const normalized = input.replace(/\s+/g, '');
  return normalized.length > 128 && /^[A-Za-z0-9+/]+=*$/.test(normalized);
}

function parseBase64DataUrl(input: string) {
  if (!input.startsWith('data:')) return null;

  const commaIndex = input.indexOf(',');
  if (commaIndex < 0) return null;

  const header = input.slice(0, commaIndex);
  const data = input.slice(commaIndex + 1);
  if (!header.endsWith(';base64') || !data) return null;

  const match = header.match(/^data:(.*?);base64$/);
  return {
    mimeType: match?.[1] || 'audio/mpeg',
    data,
  };
}

async function putAudioBlob(filename: string, buffer: Buffer, contentType: string) {
  const blob = await put(filename, buffer, {
    access: 'private',
    contentType,
  });

  return {
    url: buildAudioBlobUrl(blob.url),
    blobUrl: blob.url,
    mimeType: contentType,
  };
}

export async function saveAudioBase64(base64Data: string, mimeType: string, prefix = 'audio') {
  const normalizedMimeType = getAudioMimeType(getExtFromMimeType(mimeType));
  const ext = getExtFromMimeType(mimeType || normalizedMimeType);
  const filename = makeFilename(prefix, ext);
  const buffer = Buffer.from(base64Data || '', 'base64');

  return putAudioBlob(filename, buffer, mimeType || normalizedMimeType);
}

export async function saveAudioBuffer(
  input: ArrayBuffer | Uint8Array | Buffer,
  mimeType: string,
  prefix = 'audio'
) {
  const ext = getExtFromMimeType(mimeType);
  const filename = makeFilename(prefix, ext);
  let buffer: Buffer;

  if (Buffer.isBuffer(input)) {
    buffer = input;
  } else if (input instanceof ArrayBuffer) {
    buffer = Buffer.from(new Uint8Array(input));
  } else {
    buffer = Buffer.from(input);
  }

  return putAudioBlob(filename, buffer, mimeType || getAudioMimeType(ext));
}

export async function saveAudioFromUrl(url: string, hintedMimeType?: string, prefix = 'audio') {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载音频失败 (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || hintedMimeType || 'audio/mpeg';
  return saveAudioBuffer(arrayBuffer, contentType, prefix);
}

export async function normalizeAudioForStorage(input: string, hintedMimeType = 'audio/mpeg', prefix = 'audio') {
  const value = String(input || '').trim();
  if (!value) return '';

  const dataUrl = parseBase64DataUrl(value);
  if (dataUrl) {
    const saved = await saveAudioBase64(dataUrl.data, dataUrl.mimeType || hintedMimeType, prefix);
    return saved.url;
  }

  if (isHttpUrl(value)) {
    if (isVercelBlobUrl(value)) {
      return buildAudioBlobUrl(value);
    }
    const saved = await saveAudioFromUrl(value, hintedMimeType, prefix);
    return saved.url;
  }

  if (isLikelyHexString(value)) {
    const saved = await saveAudioBase64(Buffer.from(value, 'hex').toString('base64'), hintedMimeType, prefix);
    return saved.url;
  }

  if (isLikelyBase64String(value)) {
    const saved = await saveAudioBase64(value, hintedMimeType, prefix);
    return saved.url;
  }

  return '';
}
