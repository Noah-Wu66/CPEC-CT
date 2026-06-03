import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { VoiceRepository } from '@/lib/audio/mongodb/repositories';
import { logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    const voices = await VoiceRepository.findByUserId(session.userId);

    return NextResponse.json({
      success: true,
      voices: voices.map(voice => ({
        id: voice._id!.toString(),
        voiceId: voice.voiceId,
        name: voice.name,
        description: voice.description,
        model: voice.model,
        language: voice.language,
        previewAudioUrl: voice.previewAudioUrl,
        createdAt: voice.createdAt,
      })),
    });
  } catch (error) {
    logError('audio.voices', 'list voices', error);
    return NextResponse.json(
      { success: false, message: '获取声音列表失败' },
      { status: 500 }
    );
  }
}

