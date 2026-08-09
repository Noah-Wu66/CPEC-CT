import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { VoiceRepository } from '@/lib/audio/mongodb/repositories';
import {
  deleteCustomVoice,
  isBailianAudioError,
  QWEN_AUDIO_TTS_MODEL,
} from '@/lib/audio/bailian/tts';
import { logError } from '@/lib/logger';
import { deleteStoredFile } from '@/lib/storage/server';
import { isStoredFileReferenced } from '@/lib/storage/references';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request);

    if (!session) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const existingVoice = await VoiceRepository.findOwnedById(id, session.userId);
    if (
      !existingVoice
      || existingVoice.provider !== 'bailian'
      || existingVoice.model !== QWEN_AUDIO_TTS_MODEL
    ) {
      return NextResponse.json(
        { success: false, message: '声音不存在或无权访问' },
        { status: 404 }
      );
    }

    await deleteCustomVoice(existingVoice.voiceId);

    const fileIds = Array.from(new Set(
      [existingVoice.sourceFileId, existingVoice.previewFileId]
        .filter((value): value is string => Boolean(value))
    ));
    await Promise.all(fileIds.map(async (fileId) => {
      if (!await isStoredFileReferenced(fileId, session.userId, {
        excludeVoiceId: existingVoice._id?.toString(),
      })) {
        await deleteStoredFile(fileId, session.userId);
      }
    }));

    const voice = await VoiceRepository.delete(id, session.userId);
    if (!voice) {
      return NextResponse.json(
        { success: false, message: '声音记录已不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    logError('audio.voices', 'delete voice', error);

    if (isBailianAudioError(error)) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { success: false, message: '删除失败' },
      { status: 500 }
    );
  }
}
