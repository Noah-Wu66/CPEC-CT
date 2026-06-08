import type { ObjectId } from 'mongodb';
import type { SubtitleSentence } from '@/lib/audio/subtitle/format';

export interface Voice {
  _id?: ObjectId;
  userId: ObjectId | string;
  voiceId: string;
  name: string;
  description?: string;
  sourceAudioUrl: string;
  promptAudioUrl?: string;
  promptText?: string;
  model: string;
  previewAudioUrl?: string;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TTSHistory {
  _id?: ObjectId;
  userId: ObjectId | string;
  voiceId: string;
  text: string;
  audioUrl: string;
  model: string;
  parameters?: Record<string, unknown>;
  createdAt: Date;
}

export type { SubtitleSentence };

export interface SubtitleHistory {
  _id?: ObjectId;
  userId: ObjectId | string;
  fileName: string;
  fileUrl: string;
  sentencesUrl: string;
  sentenceCount: number;
  durationMs: number;
  createdAt: Date;
}
