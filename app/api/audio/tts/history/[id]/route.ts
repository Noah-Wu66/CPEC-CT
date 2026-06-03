import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { TTSHistoryRepository } from '@/lib/audio/mongodb/repositories';
import { logError } from '@/lib/logger';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession(request);

    if (!session) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    await TTSHistoryRepository.delete(id, session.userId);

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    logError('audio.tts-history', 'delete history', error);
    return NextResponse.json(
      { success: false, message: '删除失败' },
      { status: 500 }
    );
  }
}
