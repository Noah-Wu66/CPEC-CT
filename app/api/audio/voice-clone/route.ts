import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import {
  createCustomVoice,
  deleteCustomVoice,
  isBailianAudioError,
  QWEN_AUDIO_LANGUAGE_CODES,
  QWEN_AUDIO_TTS_MODEL,
  synthesizeSpeech,
} from '@/lib/audio/bailian/tts';
import { VoiceRepository } from '@/lib/audio/mongodb/repositories';
import { saveAudioBuffer } from '@/lib/audio/storage';
import { logError } from '@/lib/logger';
import { toAbsoluteFileUrl } from '@/lib/ai/shared/fileUrls';
import { getPublicRequestOrigin } from '@/lib/request-origin';
import { deleteStoredFile } from '@/lib/storage/server';
import { findStoredFileByIdForUser, toStoredFileDescriptor } from '@/lib/storage/repository';
import { isStoredFileReferenced } from '@/lib/storage/references';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_MAX_BYTES = 10 * 1024 * 1024;
const SOURCE_EXTENSIONS = new Set(['wav', 'mp3', 'm4a']);
const DEFAULT_PREVIEW_TEXT = '这是一段测试音频，用于预览声音复刻效果。';

function createVoicePrefix() {
  return crypto.randomBytes(5).toString('hex');
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  let createdVoiceId = '';
  let previewFileId = '';
  let userId = '';

  try {
    const session = await getSession(request);

    if (!session) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }
    userId = session.userId;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest('请求内容格式不正确');
    }
    const { sourceFileId, name, description, previewText, language = 'zh' } = body;

    if (typeof sourceFileId !== 'string' || !sourceFileId.trim()) {
      return badRequest('请选择声音样本');
    }

    if (typeof name !== 'string' || !name.trim()) {
      return badRequest('请填写声音名称');
    }
    const normalizedName = name.trim();
    if (normalizedName.length > 80) {
      return badRequest('声音名称不能超过80个字符');
    }

    if (description !== undefined && typeof description !== 'string') {
      return badRequest('声音描述格式不正确');
    }
    const normalizedDescription = typeof description === 'string' ? description.trim() : '';
    if (normalizedDescription.length > 500) {
      return badRequest('声音描述不能超过500个字符');
    }

    if (previewText !== undefined && typeof previewText !== 'string') {
      return badRequest('试听文字格式不正确');
    }
    const normalizedPreview = typeof previewText === 'string'
      ? previewText.trim()
      : DEFAULT_PREVIEW_TEXT;
    if (normalizedPreview.length > 1000) {
      return badRequest('试听文字不能超过1000个字符');
    }

    if (typeof language !== 'string') {
      return badRequest('语言参数不正确');
    }
    const normalizedLanguage = language.trim().toLowerCase();
    if (!QWEN_AUDIO_LANGUAGE_CODES.has(normalizedLanguage)) {
      return badRequest('不支持该声音样本语言');
    }

    const sourceFile = await findStoredFileByIdForUser(sourceFileId.trim(), session.userId);
    if (!sourceFile || sourceFile.category !== 'audio' || sourceFile.scope !== 'voice') {
      return NextResponse.json(
        { success: false, message: '声音样本不存在或无权访问' },
        { status: 404 }
      );
    }
    if (!SOURCE_EXTENSIONS.has(sourceFile.extension.toLowerCase())) {
      return badRequest('声音样本仅支持 WAV、MP3、M4A 格式');
    }
    if (sourceFile.size <= 0 || sourceFile.size > SOURCE_MAX_BYTES) {
      return badRequest('声音样本不能超过10MB');
    }

    const sourceDescriptor = toStoredFileDescriptor(sourceFile);
    const sourcePublicUrl = toAbsoluteFileUrl(
      sourceDescriptor.url,
      getPublicRequestOrigin(request)
    );
    if (!sourcePublicUrl) {
      throw new Error('无法生成声音样本的公开地址');
    }

    const cloneResult = await createCustomVoice({
      sourceUrl: sourcePublicUrl,
      prefix: createVoicePrefix(),
      language: normalizedLanguage,
      signal: request.signal,
    });
    createdVoiceId = cloneResult.voiceId;

    let previewAudioUrl = '';
    if (normalizedPreview) {
      const preview = await synthesizeSpeech({
        text: normalizedPreview,
        voiceId: createdVoiceId,
        language: normalizedLanguage,
        audioFormat: 'mp3',
        signal: request.signal,
      });
      const savedPreview = await saveAudioBuffer(
        session.userId,
        preview.audioBuffer,
        'audio/mpeg',
        'voice-clone-preview'
      );
      previewAudioUrl = savedPreview.url;
      previewFileId = savedPreview.fileId;
    }

    const insertedId = await VoiceRepository.create({
      userId: session.userId,
      voiceId: createdVoiceId,
      name: normalizedName,
      description: normalizedDescription || undefined,
      sourceFileId: sourceFile._id.toString(),
      sourceAudioUrl: sourceDescriptor.url,
      model: QWEN_AUDIO_TTS_MODEL,
      provider: 'bailian',
      previewAudioUrl: previewAudioUrl || undefined,
      previewFileId: previewFileId || undefined,
      language: normalizedLanguage,
    });

    return NextResponse.json({
      success: true,
      message: '声音复刻成功',
      data: {
        id: insertedId.toString(),
        voiceId: createdVoiceId,
        previewAudio: previewAudioUrl || undefined,
      },
    });
  } catch (error) {
    if (previewFileId && userId) {
      await (async () => {
        if (!await isStoredFileReferenced(previewFileId, userId)) {
          await deleteStoredFile(previewFileId, userId);
        }
      })().catch((cleanupError) => {
        logError('audio.voice-clone', 'remove failed preview', cleanupError);
      });
    }
    if (createdVoiceId) {
      await deleteCustomVoice(createdVoiceId).catch((cleanupError) => {
        logError('audio.voice-clone', 'compensate provider voice', cleanupError, {
          voiceId: createdVoiceId,
        });
      });
    }

    logError('audio.voice-clone', 'clone voice', error);
    if (isBailianAudioError(error)) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { success: false, message: '声音复刻失败' },
      { status: 500 }
    );
  }
}
