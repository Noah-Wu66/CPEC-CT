import type { ObjectId } from 'mongodb';

export interface Voice {
  _id?: ObjectId;
  userId: ObjectId | string;
  voiceId: string;
  name: string;
  description?: string;
  sourceFileId: string;
  sourceAudioUrl: string;
  model: string;
  provider: 'bailian';
  previewAudioUrl?: string;
  previewFileId?: string;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TTSHistory {
  _id?: ObjectId;
  userId: ObjectId | string;
  voiceId: string;
  text: string;
  audioFileId: string;
  audioUrl: string;
  model: string;
  parameters?: Record<string, unknown>;
  createdAt: Date;
}

export interface SubtitleHistory {
  _id?: ObjectId;
  userId: ObjectId | string;
  fileName: string;
  fileId: string;
  fileUrl: string;
  sentencesFileId: string;
  sentencesUrl: string;
  sentenceCount: number;
  durationMs: number;
  createdAt: Date;
}
