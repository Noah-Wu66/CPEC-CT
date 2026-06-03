import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { minimaxAPI } from '@/lib/audio/minimax/client';
import { saveAudioBuffer } from '@/lib/audio/storage';
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
    const fileId = searchParams.get('fileId');

    if (!fileId) {
      return NextResponse.json(
        { success: false, message: '缺少必要参数: fileId' },
        { status: 400 }
      );
    }

    const downloaded = await minimaxAPI.retrieveFileContent(fileId);
    const saved = await saveAudioBuffer(
      downloaded.arrayBuffer,
      downloaded.contentType || 'audio/mpeg',
      'tts-async'
    );

    return NextResponse.json({
      success: true,
      audioUrl: saved.url,
      contentType: saved.mimeType,
    });
  } catch (error) {
    logError('audio.tts-async', 'download task audio', error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || '下载失败' },
      { status: 500 }
    );
  }
}
