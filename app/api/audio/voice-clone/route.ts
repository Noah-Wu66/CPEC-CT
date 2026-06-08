import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { cloneVoice, downloadAudioUrl } from '@/lib/audio/bailian/client';
import { VoiceRepository } from '@/lib/audio/mongodb/repositories';
import { normalizeAudioForStorage, saveAudioBuffer } from '@/lib/audio/storage';
import { VOICE_CLONE_TARGET_MODEL } from '@/lib/audio/client/tts-options';
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
    const {
      sourceFileId,
      voiceId,
      name,
      description,
      sourceAudioUrl,
      previewText,
      language,
    } = body;

    if (!sourceFileId || !voiceId || !name) {
      return NextResponse.json(
        { success: false, message: '缺少必要参数' },
        { status: 400 }
      );
    }

    const cloneResult = await cloneVoice({
      sourceAudioUrl: sourceFileId,
      voiceId,
      previewText,
      signal: request?.signal,
    });

    let previewAudioUrl = '';
    if (cloneResult.previewAudioUrl) {
      const downloaded = await downloadAudioUrl(cloneResult.previewAudioUrl, request?.signal);
      const saved = await saveAudioBuffer(
        downloaded.arrayBuffer,
        downloaded.contentType || 'audio/mpeg',
        'voice-clone-preview'
      );
      previewAudioUrl = saved.url;
    }

    const voiceData = {
      userId: session.userId,
      voiceId,
      name,
      description,
      sourceAudioUrl,
      model: VOICE_CLONE_TARGET_MODEL,
      previewAudioUrl: previewAudioUrl || undefined,
      language: language || 'zh',
    };

    const insertedId = await VoiceRepository.create(voiceData);

    return NextResponse.json({
      success: true,
      message: '声音复刻成功',
      data: {
        id: insertedId.toString(),
        previewAudio: previewAudioUrl || undefined,
      },
    });
  } catch (error) {
    logError('audio.voice-clone', 'clone voice', error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || '声音复刻失败' },
      { status: 500 }
    );
  }
}
