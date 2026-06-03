import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { SubtitleHistoryRepository } from '@/lib/audio/mongodb/repositories';
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

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');

    const history = await SubtitleHistoryRepository.findByUserId(session.userId, limit);

    return NextResponse.json({
      success: true,
      history: history.map(item => ({
        id: item._id!.toString(),
        fileName: item.fileName,
        fileUrl: item.fileUrl,
        sentencesUrl: item.sentencesUrl,
        sentenceCount: item.sentenceCount,
        durationMs: item.durationMs,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    logError('audio.subtitle-history', 'list history', error);
    return NextResponse.json(
      { success: false, message: '获取历史记录失败' },
      { status: 500 }
    );
  }
}
