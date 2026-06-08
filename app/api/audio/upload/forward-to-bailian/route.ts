import { getSession } from '@/lib/audio/auth/session';
import { NextRequest, NextResponse } from 'next/server';
import { buildSignedDownloadUrl, fetchPrivateBlob } from '@/lib/audio/blob';
import { logError } from '@/lib/logger';

function isVercelBlobUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;

    const host = url.hostname.toLowerCase();
    if (!host.endsWith('.vercel-storage.com')) return false;
    if (!host.includes('.blob.')) return false;

    return true;
  } catch {
    return false;
  }
}

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
    const { blobUrl, purpose } = body;

    if (!blobUrl || !purpose) {
      return NextResponse.json(
        { success: false, message: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (typeof blobUrl !== 'string' || !isVercelBlobUrl(blobUrl)) {
      return NextResponse.json(
        { success: false, message: '无效的 blobUrl 参数' },
        { status: 400 }
      );
    }

    if (purpose !== 'voice_clone' && purpose !== 'prompt_audio') {
      return NextResponse.json(
        { success: false, message: '无效的 purpose 参数' },
        { status: 400 }
      );
    }

    const response = await fetchPrivateBlob(blobUrl);
    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: '无法从 Vercel Blob 下载文件' },
        { status: 400 }
      );
    }

    const signedUrl = buildSignedDownloadUrl(blobUrl, new URL(request.url).origin);

    return NextResponse.json({
      success: true,
      file_id: signedUrl,
      blobUrl,
    });
  } catch (error) {
    logError('audio.upload', 'prepare audio for bailian', error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || '文件准备失败' },
      { status: 500 }
    );
  }
}
