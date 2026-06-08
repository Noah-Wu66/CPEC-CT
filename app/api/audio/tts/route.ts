import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { downloadAudioUrl, synthesizeSpeech } from '@/lib/audio/bailian/client';
import { getAudioMimeType, saveAudioBuffer } from '@/lib/audio/storage';
import { DEFAULT_TTS_VOICE, isSupportedSpeechModel } from '@/lib/audio/client/tts-options';
import { logError } from '@/lib/logger';

const SUPPORTED_AUDIO_FORMATS = ['mp3', 'wav'] as const;

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      text,
      voiceId,
      model,
      languageType = 'auto',
      audioFormat = 'mp3',
    } = body;

    if (!text || !model) {
      return NextResponse.json(
        { success: false, message: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (!isSupportedSpeechModel(model)) {
      return NextResponse.json(
        { success: false, message: '仅支持百炼语音合成模型' },
        { status: 400 }
      );
    }

    if (!SUPPORTED_AUDIO_FORMATS.includes(audioFormat)) {
      return NextResponse.json(
        { success: false, message: 'audioFormat 参数必须是 mp3 或 wav' },
        { status: 400 }
      );
    }

    if (text.length > 10000) {
      return NextResponse.json(
        { success: false, message: '文本长度不能超过10000字符' },
        { status: 400 }
      );
    }

    const generated = await synthesizeSpeech({
      text,
      model,
      voiceId: voiceId || DEFAULT_TTS_VOICE,
      languageType,
      audioFormat,
      signal: request?.signal,
    });
    const downloaded = await downloadAudioUrl(generated.audioUrl, request?.signal);
    const saved = await saveAudioBuffer(
      downloaded.arrayBuffer,
      downloaded.contentType || getAudioMimeType(audioFormat),
      'tts-sync'
    );

    return NextResponse.json({
      success: true,
      audio: saved.url,
      audioType: audioFormat,
      metadata: generated.raw?.usage,
    });
  } catch (error) {
    logError('audio.tts', 'create speech', error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || '语音合成失败' },
      { status: 500 }
    );
  }
}
