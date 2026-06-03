import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { SubtitleHistoryRepository } from '@/lib/audio/mongodb/repositories';
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
    const { fileName, fileUrl, sentencesUrl, sentenceCount, durationMs } = body;

    if (!fileName || !fileUrl || !sentencesUrl) {
      return NextResponse.json(
        { success: false, message: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (
      typeof fileUrl !== 'string' ||
      typeof sentencesUrl !== 'string' ||
      !isValidAudioUrl(fileUrl) ||
      !isValidAudioUrl(sentencesUrl)
    ) {
      return NextResponse.json(
        { success: false, message: '文件地址无效' },
        { status: 400 }
      );
    }

    const id = await SubtitleHistoryRepository.create({
      userId: session.userId,
      fileName,
      fileUrl,
      sentencesUrl,
      sentenceCount: Number(sentenceCount) || 0,
      durationMs: Number(durationMs) || 0,
    });

    return NextResponse.json({
      success: true,
      message: '保存成功',
      id: id.toString(),
    });
  } catch (error) {
    logError('audio.subtitle-history', 'save history', error);
    return NextResponse.json(
      { success: false, message: '保存失败' },
      { status: 500 }
    );
  }
}
