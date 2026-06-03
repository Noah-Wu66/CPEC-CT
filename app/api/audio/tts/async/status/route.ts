import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { minimaxAPI } from '@/lib/audio/minimax/client';
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

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { success: false, message: '缺少必要参数: taskId' },
        { status: 400 }
      );
    }

    const queryResult = await minimaxAPI.queryAsyncTTS(taskId);

    const fileId = queryResult?.file_id ?? null;
    const rawStatus = queryResult?.status;
    const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : null;
    if (!status) {
      throw new Error('查询结果缺少 status');
    }

    return NextResponse.json({
      success: true,
      status,
      fileId,
    });
  } catch (error) {
    logError('audio.tts-async', 'get task status', error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || '查询任务失败' },
      { status: 500 }
    );
  }
}
