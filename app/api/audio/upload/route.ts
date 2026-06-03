import { NextRequest, NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { getSession } from '@/lib/audio/auth/session';
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

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        return {
          addRandomSuffix: true,
          allowedContentTypes: [
            'audio/mpeg',
            'audio/mp4',
            'audio/m4a',
            'audio/wav',
            'audio/x-wav',
            'audio/wave',
            'audio/mp3',
            'audio/flac',
            'audio/x-flac',
            'audio/ogg',
            'application/ogg',
          ],
          maximumSizeInBytes: 500 * 1024 * 1024,
          tokenPayload: JSON.stringify({
            userId: session.userId,
            pathname,
          }),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    logError('audio.upload', 'upload audio', error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || '上传失败' },
      { status: 400 }
    );
  }
}
