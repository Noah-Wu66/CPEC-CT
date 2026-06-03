import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { TTSHistoryRepository } from '@/lib/audio/mongodb/repositories';
import { isValidAudioUrl } from '@/lib/audio/storage';
import { logError } from '@/lib/logger';

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
    const { voiceId, text, audioUrl, model, parameters } = body;

    if (!text || !audioUrl || !model) {
      return NextResponse.json(
        { success: false, message: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (typeof audioUrl !== 'string' || !isValidAudioUrl(audioUrl)) {
      return NextResponse.json(
        { success: false, message: '音频地址无效' },
        { status: 400 }
      );
    }

    await TTSHistoryRepository.create({
      userId: session.userId,
      voiceId: voiceId || 'female-tianmei',
      text,
      audioUrl,
      model,
      parameters: parameters || {
        speed: 1.0,
        vol: 1.0,
        pitch: 0,
      },
    });

    return NextResponse.json({
      success: true,
      message: '保存成功',
    });
  } catch (error) {
    logError('audio.tts-history', 'save history', error);
    return NextResponse.json(
      { success: false, message: '保存失败' },
      { status: 500 }
    );
  }
}
