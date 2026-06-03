import { NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { isPrivateBlobUrl } from '@/lib/audio/storage';
import { fetchPrivateBlob } from '@/lib/audio/blob';
import { logError } from '@/lib/logger';

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const blobUrl = new URL(request.url).searchParams.get('url') || '';

  if (!blobUrl || !isPrivateBlobUrl(blobUrl)) {
    return NextResponse.json({ error: '缺少或非法的音频地址' }, { status: 400 });
  }

  try {
    const result = await fetchPrivateBlob(blobUrl);

    if (!result.ok) {
      return new NextResponse('Not found', { status: result.status });
    }

    return new NextResponse(result.body, {
      headers: {
        'Content-Type': result.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'private, max-age=0, must-revalidate',
        ETag: result.headers.get('etag') || '',
      },
    });
  } catch (error) {
    logError('audio.blob', 'read audio blob', error);
    return NextResponse.json({ error: '读取音频失败' }, { status: 500 });
  }
}
