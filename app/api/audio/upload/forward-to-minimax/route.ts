import { getSession } from '@/lib/audio/auth/session';
import { NextRequest, NextResponse } from 'next/server';
import { minimaxAPI } from '@/lib/audio/minimax/client';
import { fetchPrivateBlob } from '@/lib/audio/blob';
import { logError } from '@/lib/logger';

function isVercelBlobUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;

    const host = url.hostname.toLowerCase();
    // Vercel Blob 常见域名形态：*.public.blob.vercel-storage.com
    // 只允许 vercel-storage.com 且包含 ".blob."
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

    const blob = await response.blob();
    const file = new File([blob], blobUrl.split('/').pop() || 'audio.mp3', {
      type: blob.type || 'audio/mpeg',
    });

    const file_id = await minimaxAPI.uploadFile(file, purpose as 'voice_clone' | 'prompt_audio');

    return NextResponse.json({
      success: true,
      file_id,
      blobUrl,
    });
  } catch (error) {
    logError('audio.upload', 'forward audio to minimax', error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || '文件转发失败' },
      { status: 500 }
    );
  }
}


