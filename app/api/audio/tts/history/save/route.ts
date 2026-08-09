import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { TTSHistoryRepository } from '@/lib/audio/mongodb/repositories';
import { DEFAULT_TTS_MODEL, DEFAULT_TTS_VOICE } from '@/lib/audio/client/tts-options';
import { QWEN_AUDIO_LANGUAGE_CODES } from '@/lib/audio/bailian/tts';
import { logError } from '@/lib/logger';
import { findStoredFileByIdForUser, toStoredFileDescriptor } from '@/lib/storage/repository';

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
    const { voiceId, text, audioFileId, parameters } = body;

    if (
      typeof text !== 'string'
      || !text.trim()
      || text.length > 10000
      || typeof audioFileId !== 'string'
      || !audioFileId.trim()
      || (voiceId !== undefined && (typeof voiceId !== 'string' || !voiceId.trim() || voiceId.length > 256))
      || (parameters !== undefined && (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)))
    ) {
      return NextResponse.json(
        { success: false, message: '历史记录参数不正确' },
        { status: 400 }
      );
    }

    const languageType = parameters && typeof parameters.languageType === 'string'
      ? parameters.languageType.trim()
      : 'auto';
    if (languageType !== 'auto' && !QWEN_AUDIO_LANGUAGE_CODES.has(languageType)) {
      return NextResponse.json(
        { success: false, message: '语言参数不正确' },
        { status: 400 }
      );
    }

    const audioFile = await findStoredFileByIdForUser(String(audioFileId), session.userId);
    if (!audioFile || audioFile.category !== 'audio' || audioFile.scope !== 'tts') {
      return NextResponse.json(
        { success: false, message: '音频文件不存在或无权访问' },
        { status: 404 }
      );
    }
    const audioDescriptor = toStoredFileDescriptor(audioFile);

    await TTSHistoryRepository.create({
      userId: session.userId,
      voiceId: typeof voiceId === 'string' ? voiceId.trim() : DEFAULT_TTS_VOICE,
      text,
      audioFileId: audioDescriptor.fileId,
      audioUrl: audioDescriptor.url,
      model: DEFAULT_TTS_MODEL,
      parameters: { languageType },
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
