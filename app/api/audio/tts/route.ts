import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { minimaxAPI } from '@/lib/audio/minimax/client';
import { getAudioMimeType, normalizeAudioForStorage, saveAudioBuffer } from '@/lib/audio/storage';
import { logError } from '@/lib/logger';

const SUPPORTED_SYNC_AUDIO_FORMATS = ['mp3', 'flac', 'wav'] as const;

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
      speed = 1.0,
      vol = 1.0,
      pitch = 0,
      englishNormalization,
      audioFormat = 'mp3',
      sampleRate,
      bitrate,
      channel,
      voice_setting,
      audio_setting,
    } = body;

    if (!text || !model) {
      return NextResponse.json(
        { success: false, message: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (speed !== undefined && (typeof speed !== 'number' || speed < 0.5 || speed > 2.0)) {
      return NextResponse.json(
        { success: false, message: 'speed 参数必须在 0.5 到 2.0 之间' },
        { status: 400 }
      );
    }

    if (vol !== undefined && (typeof vol !== 'number' || vol < 0.1 || vol > 10.0)) {
      return NextResponse.json(
        { success: false, message: 'vol 参数必须在 0.1 到 10.0 之间' },
        { status: 400 }
      );
    }

    if (pitch !== undefined && (typeof pitch !== 'number' || pitch < -12 || pitch > 12)) {
      return NextResponse.json(
        { success: false, message: 'pitch 参数必须在 -12 到 12 之间' },
        { status: 400 }
      );
    }

    if (!SUPPORTED_SYNC_AUDIO_FORMATS.includes(audioFormat)) {
      return NextResponse.json(
        { success: false, message: 'audioFormat 参数必须是 mp3、flac 或 wav' },
        { status: 400 }
      );
    }

    if (sampleRate !== undefined && (typeof sampleRate !== 'number' || ![8000, 16000, 24000, 32000, 40000, 48000].includes(sampleRate))) {
      return NextResponse.json(
        { success: false, message: 'sampleRate 参数必须是 8000, 16000, 24000, 32000, 40000 或 48000 之一' },
        { status: 400 }
      );
    }

    if (channel !== undefined && (typeof channel !== 'number' || (channel !== 1 && channel !== 2))) {
      return NextResponse.json(
        { success: false, message: 'channel 参数必须是 1 或 2' },
        { status: 400 }
      );
    }

    const actualVoiceId = voiceId || 'female-tianmei';

    if (text.length > 10000) {
      return NextResponse.json(
        { success: false, message: '文本长度不能超过10000字符' },
        { status: 400 }
      );
    }

    const mergedVoiceSetting = {
      voice_id: voice_setting?.voice_id || actualVoiceId,
      speed: voice_setting?.speed ?? speed,
      vol: voice_setting?.vol ?? vol,
      pitch: voice_setting?.pitch ?? pitch,
      ...(typeof (voice_setting?.english_normalization ?? englishNormalization) === 'boolean'
        ? { english_normalization: (voice_setting?.english_normalization ?? englishNormalization) as boolean }
        : {}),
    };

    const mergedAudioSetting = {
      format: audio_setting?.format || audioFormat,
      ...(typeof (audio_setting?.sample_rate ?? sampleRate) === 'number'
        ? { sample_rate: (audio_setting?.sample_rate ?? sampleRate) as number }
        : {}),
      ...(typeof (audio_setting?.bitrate ?? bitrate) === 'number'
        ? { bitrate: (audio_setting?.bitrate ?? bitrate) as number }
        : {}),
      ...(typeof (audio_setting?.channel ?? channel) === 'number'
        ? { channel: (audio_setting?.channel ?? channel) as number }
        : {}),
    };

    const result = await minimaxAPI.textToSpeech({
      text,
      model,
      voice_setting: mergedVoiceSetting,
      audio_setting: mergedAudioSetting,
    });

    if (result.base_resp && result.base_resp.status_code !== 0) {
      return NextResponse.json(
        {
          success: false,
          message: result.base_resp.status_msg || '语音合成失败',
        },
        { status: 400 }
      );
    }

    const rawAudio = result.data?.audio || result.audio || result.base64_audio || result.s3_path || null;
    const fileId = result.file_id || result.data?.file_id || null;
    const audioMimeType = getAudioMimeType(audioFormat);
    let audioUrl = '';

    if (typeof rawAudio === 'string' && rawAudio.trim()) {
      audioUrl = await normalizeAudioForStorage(rawAudio, audioMimeType, 'tts-sync');
    }

    if (!audioUrl && typeof fileId === 'string' && fileId.trim()) {
      const downloaded = await minimaxAPI.retrieveFileContent(fileId);
      const saved = await saveAudioBuffer(
        downloaded.arrayBuffer,
        downloaded.contentType || audioMimeType,
        'tts-sync'
      );
      audioUrl = saved.url;
    }

    if (!audioUrl) {
      return NextResponse.json(
        {
          success: false,
          message: '未生成可用音频',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      audio: audioUrl,
      audioType: audioFormat,
      metadata: result.metadata,
    });
  } catch (error) {
    logError('audio.tts', 'create sync speech', error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || '语音合成失败' },
      { status: 500 }
    );
  }
}
