import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { SubtitleHistoryRepository } from '@/lib/audio/mongodb/repositories';
import { logError } from '@/lib/logger';

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

    await SubtitleHistoryRepository.delete(id, session.userId);

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    logError('audio.subtitle-history', 'delete history', error);
    return NextResponse.json(
      { success: false, message: '删除失败' },
      { status: 500 }
    );
  }
}

export async function GET(
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

    const item = await SubtitleHistoryRepository.findById(id, session.userId);

    if (!item) {
      return NextResponse.json(
        { success: false, message: '记录不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      item: {
        id: item._id!.toString(),
        fileName: item.fileName,
        fileUrl: item.fileUrl,
        sentencesUrl: item.sentencesUrl,
        sentenceCount: item.sentenceCount,
        durationMs: item.durationMs,
        createdAt: item.createdAt,
      },
    });
  } catch (error) {
    logError('audio.subtitle-history', 'get history', error);
    return NextResponse.json(
      { success: false, message: '获取记录失败' },
      { status: 500 }
    );
  }
}
