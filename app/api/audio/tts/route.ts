import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import {
  isBailianAudioError,
  QWEN_AUDIO_LANGUAGE_CODES,
  QWEN_AUDIO_TTS_MODEL,
  synthesizeSpeech,
} from '@/lib/audio/bailian/tts';
import { getAudioMimeType, saveAudioBuffer } from '@/lib/audio/storage';
import { DEFAULT_TTS_VOICE } from '@/lib/audio/client/tts-options';
import { SYSTEM_VOICES } from '@/lib/audio/client/system-voices';
import { VoiceRepository } from '@/lib/audio/mongodb/repositories';
import { logError } from '@/lib/logger';

const SUPPORTED_AUDIO_FORMATS = ['mp3', 'wav'] as const;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAudioFormat(value: unknown): value is (typeof SUPPORTED_AUDIO_FORMATS)[number] {
  return typeof value === 'string'
    && SUPPORTED_AUDIO_FORMATS.includes(value as (typeof SUPPORTED_AUDIO_FORMATS)[number]);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: '请求内容格式不正确' },
        { status: 400 }
      );
    }
    const { text, voiceId, languageType = 'auto', audioFormat = 'mp3' } = body;

    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json(
        { success: false, message: '请输入要合成的文字' },
        { status: 400 }
      );
    }

    if (text.length > 10000) {
      return NextResponse.json(
        { success: false, message: '文本长度不能超过10000字符' },
        { status: 400 }
      );
    }

    if (!isAudioFormat(audioFormat)) {
      return NextResponse.json(
        { success: false, message: 'audioFormat 参数必须是 mp3 或 wav' },
        { status: 400 }
      );
    }

    if (typeof languageType !== 'string') {
      return NextResponse.json(
        { success: false, message: '语言参数不正确' },
        { status: 400 }
      );
    }

    const normalizedLanguage = languageType.trim().toLowerCase();
    if (normalizedLanguage !== 'auto' && !QWEN_AUDIO_LANGUAGE_CODES.has(normalizedLanguage)) {
      return NextResponse.json(
        { success: false, message: '不支持该语言' },
        { status: 400 }
      );
    }

    if (voiceId !== undefined && (typeof voiceId !== 'string' || !voiceId.trim())) {
      return NextResponse.json(
        { success: false, message: '音色参数不正确' },
        { status: 400 }
      );
    }
    const normalizedVoiceId = typeof voiceId === 'string' ? voiceId.trim() : DEFAULT_TTS_VOICE;
    if (normalizedVoiceId.length > 256) {
      return NextResponse.json(
        { success: false, message: '音色参数不正确' },
        { status: 400 }
      );
    }

    const systemVoice = SYSTEM_VOICES.find((voice) => voice.id === normalizedVoiceId);
    if (systemVoice) {
      if (
        normalizedLanguage !== 'auto'
        && !systemVoice.languages.includes(normalizedLanguage as 'zh' | 'en')
      ) {
        return NextResponse.json(
          { success: false, message: '该系统音色不支持所选语言' },
          { status: 400 }
        );
      }
    } else {
      const ownedVoice = await VoiceRepository.findOwnedByVoiceId(normalizedVoiceId, session.userId);
      if (
        !ownedVoice
        || ownedVoice.provider !== 'bailian'
        || ownedVoice.model !== QWEN_AUDIO_TTS_MODEL
      ) {
        return NextResponse.json(
          { success: false, message: '音色不存在或无权使用' },
          { status: 404 }
        );
      }
    }

    const generated = await synthesizeSpeech({
      text,
      voiceId: normalizedVoiceId,
      language: normalizedLanguage === 'auto' ? undefined : normalizedLanguage,
      audioFormat,
      signal: request.signal,
    });
    const saved = await saveAudioBuffer(
      session.userId,
      generated.audioBuffer,
      getAudioMimeType(audioFormat),
      'tts-sync'
    );

    return NextResponse.json({
      success: true,
      audio: saved.url,
      audioFileId: saved.fileId,
      audioType: audioFormat,
      model: QWEN_AUDIO_TTS_MODEL,
      metadata: generated.metadata,
    });
  } catch (error) {
    logError('audio.tts', 'create speech', error);

    if (isBailianAudioError(error)) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { success: false, message: '语音合成失败' },
      { status: 500 }
    );
  }
}
