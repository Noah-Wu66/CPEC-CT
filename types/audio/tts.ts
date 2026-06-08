export type SyncAudioFormat = 'mp3' | 'wav';

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
  languageType: string;
  audioFormat: SyncAudioFormat;
}
