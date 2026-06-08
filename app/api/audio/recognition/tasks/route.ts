import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { createRecognitionTask, isBailianAsrError } from '@/lib/audio/bailian/asr';
import { isPrivateBlobUrl } from '@/lib/audio/storage';
import { buildSignedDownloadUrl } from '@/lib/audio/blob';
import { saveSubtitleSentences } from '@/lib/audio/subtitle/storage';
import { logError } from '@/lib/logger';

function extractBlobUrl(fileUrl: string): string {
  if (fileUrl.startsWith('/api/audio/blob')) {
    try {
      const params = new URLSearchParams(fileUrl.split('?')[1] || '');
      return params.get('url') || fileUrl;
    } catch {
      return fileUrl;
    }
  }
  return fileUrl;
}

type RecognitionMode = 'text' | 'subtitle';
type RecognitionLanguage = 'auto' | 'zh' | 'en' | 'ja';

function isRecognitionMode(value: unknown): value is RecognitionMode {
  return value === 'text' || value === 'subtitle';
}

function isRecognitionLanguage(value: unknown): value is RecognitionLanguage {
  return value === 'auto' || value === 'zh' || value === 'en' || value === 'ja';
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
    const {
      fileUrl,
      fileName,
      mode,
      language,
      enableItn,
      enablePunc,
      enableDdc,
      enableSpeakerInfo,
      hotwords,
    } = body;

    if (!fileUrl || typeof fileUrl !== 'string') {
      return NextResponse.json(
        { success: false, message: '缺少必要参数: fileUrl' },
        { status: 400 }
      );
    }

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json(
        { success: false, message: '缺少必要参数: fileName' },
        { status: 400 }
      );
    }

    if (!isRecognitionMode(mode)) {
      return NextResponse.json(
        { success: false, message: '识别模式不正确' },
        { status: 400 }
      );
    }

    if (!isRecognitionLanguage(language)) {
      return NextResponse.json(
        { success: false, message: '识别语言不正确' },
        { status: 400 }
      );
    }

    const baseUrl = new URL(request.url).origin;
    const rawUrl = extractBlobUrl(fileUrl);
    const resolvedFileUrl = isPrivateBlobUrl(rawUrl)
      ? buildSignedDownloadUrl(rawUrl, baseUrl)
      : fileUrl;

    const normalizedHotwords = Array.isArray(hotwords)
      ? hotwords.filter((word): word is string => typeof word === 'string')
      : undefined;

    const result = await createRecognitionTask({
      fileUrl: resolvedFileUrl,
      fileName,
      mode,
      language,
      enableItn: Boolean(enableItn),
      enablePunc: Boolean(enablePunc),
      enableDdc: Boolean(enableDdc),
      enableSpeakerInfo: Boolean(enableSpeakerInfo),
      hotwords: normalizedHotwords,
    });

    if (result.sentences.length === 0) {
      return NextResponse.json({
        success: true,
        status: 'succeeded',
        taskId: result.taskId,
        logId: result.logId,
        message: '识别完成，但没有可用内容',
        sentencesUrl: '',
        sentenceCount: 0,
        durationMs: 0,
      });
    }

    const saved = await saveSubtitleSentences(
      result.sentences,
      `subtitle-${result.taskId}`
    );

    return NextResponse.json({
      success: true,
      status: 'succeeded',
      taskId: result.taskId,
      logId: result.logId,
      sentencesUrl: saved.url,
      sentenceCount: saved.sentenceCount,
      durationMs: saved.durationMs || result.durationMs,
    });
  } catch (error) {
    logError('audio.recognition', 'create recognition task', error);

    if (isBailianAsrError(error)) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { success: false, message: '创建任务失败' },
      { status: 500 }
    );
  }
}
