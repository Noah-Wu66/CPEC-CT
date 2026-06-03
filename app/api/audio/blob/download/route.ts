import { NextRequest, NextResponse } from 'next/server';
import { isPrivateBlobUrl } from '@/lib/audio/storage';
import { verifySignedDownloadUrl, fetchPrivateBlob } from '@/lib/audio/blob';
import { logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url') || '';
    const exp = request.nextUrl.searchParams.get('exp') || '';
    const sig = request.nextUrl.searchParams.get('sig') || '';

    if (!url || !exp || !sig) {
      return new NextResponse('Bad Request', { status: 400 });
    }

    if (!isPrivateBlobUrl(url)) {
      return new NextResponse('Bad Request', { status: 400 });
    }

    if (!verifySignedDownloadUrl(url, exp, sig)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const result = await fetchPrivateBlob(url);

    if (!result.ok) {
      return new NextResponse('Not found', { status: result.status });
    }

    return new NextResponse(result.body, {
      headers: {
        'Content-Type': result.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logError('audio.blob', 'download signed audio blob', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
