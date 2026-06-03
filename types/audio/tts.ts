export type TTSMode = 'sync' | 'async';
export type SyncAudioFormat = 'mp3' | 'flac' | 'wav';
export type AsyncAudioFormat = 'mp3' | 'flac';

export interface VoiceItem {
  id: string;
  voiceId: string;
  name: string;
  description?: string;
  language: string;
  model: string;
  createdAt: string;
}

export interface SyncTTSFormState {
  text: string;
  voiceId: string;
  model: string;
  englishNormalization: boolean;
  speed: number;
  vol: number;
  pitch: number;
  audioFormat: SyncAudioFormat;
  sampleRate: number;
  bitrate: number;
  channel: number;
}

export interface AsyncTTSFormState {
  text: string;
  voiceId: string;
  model: string;
  languageBoost: string;
  speed: number;
  vol: number;
  pitch: number;
  pronunciationToneText: string;
  audioFormat: AsyncAudioFormat;
  audioSampleRate: number;
  bitrate: number;
  channel: number;
  voiceModifyPitch: number;
  voiceModifyIntensity: number;
  voiceModifyTimbre: number;
  voiceModifySoundEffects: string;
}

