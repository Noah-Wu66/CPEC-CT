import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { minimaxAPI } from '@/lib/audio/minimax/client';
import { logError } from '@/lib/logger';

const SUPPORTED_ASYNC_AUDIO_FORMATS = ['mp3', 'flac'] as const;

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
      model,
      text,
      languageBoost = 'auto',

      voiceId,
      speed = 1.0,
      vol = 1.0,
      pitch = 0,

      pronunciationTone,

      audioFormat = 'mp3',
      audioSampleRate,
      bitrate,
      channel,

      voiceModify,
    } = body;

    if (!model) {
      return NextResponse.json(
        { success: false, message: '缺少必要参数: model' },
        { status: 400 }
      );
    }

    if (!text) {
      return NextResponse.json(
        { success: false, message: '缺少必要参数: text' },
        { status: 400 }
      );
    }

    if (text.length > 50000) {
      return NextResponse.json(
        { success: false, message: '纯文本长度不能超过50000字符' },
        { status: 400 }
      );
    }

    if (!SUPPORTED_ASYNC_AUDIO_FORMATS.includes(audioFormat)) {
      return NextResponse.json(
        { success: false, message: '长文本 audioFormat 参数必须是 mp3 或 flac' },
        { status: 400 }
      );
    }

    const taskResult = await minimaxAPI.createAsyncTTS({
      model,
      text,
      language_boost: languageBoost || undefined,
      voice_setting: {
        voice_id: voiceId || 'female-tianmei',
        speed,
        vol,
        pitch,
      },
      pronunciation_dict: pronunciationTone ? { tone: pronunciationTone } : undefined,
      audio_setting: {
        format: audioFormat,
        audio_sample_rate: audioSampleRate,
        bitrate,
        channel,
      },
      voice_modify: voiceModify || undefined,
    });

    const taskId = taskResult?.task_id ?? null;
    if (!taskId) {
      throw new Error('创建任务成功但缺少 task_id');
    }

    return NextResponse.json({
      success: true,
      taskId,
    });
  } catch (error) {
    logError('audio.tts-async', 'create task', error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || '创建任务失败' },
      { status: 500 }
    );
  }
}
