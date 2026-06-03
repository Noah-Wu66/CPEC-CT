import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { minimaxAPI } from '@/lib/audio/minimax/client';
import { VoiceRepository } from '@/lib/audio/mongodb/repositories';
import { normalizeAudioForStorage } from '@/lib/audio/storage';
import { isLatestSpeechModel } from '@/lib/audio/client/tts-options';
import { logError } from '@/lib/logger';

interface ClonePrompt {
  prompt_audio?: string;
  prompt_text?: string;
}

interface CloneParams {
  file_id: string;
  voice_id: string;
  model: string;
  clone_prompt?: ClonePrompt;
  text?: string;
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
      sourceFileId,
      promptFileId,
      promptText,
      voiceId,
      name,
      description,
      model,
      sourceAudioUrl,
      promptAudioUrl,
      previewText,
      language,
    } = body;

    if (!sourceFileId || !voiceId || !name || !model) {
      return NextResponse.json(
        { success: false, message: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (!isLatestSpeechModel(model)) {
      return NextResponse.json(
        { success: false, message: '仅支持最新版 MiniMax Speech 模型' },
        { status: 400 }
      );
    }

    const cloneParams: CloneParams = {
      file_id: sourceFileId,
      voice_id: voiceId,
      model,
    };

    if (promptFileId || promptText) {
      cloneParams.clone_prompt = {};
      if (promptFileId) {
        cloneParams.clone_prompt.prompt_audio = promptFileId;
      }
      if (promptText) {
        cloneParams.clone_prompt.prompt_text = promptText;
      }
    }

    if (previewText) {
      cloneParams.text = previewText;
    }

    const cloneResult = await minimaxAPI.cloneVoice(cloneParams);
    const rawPreviewAudio = cloneResult.audio || cloneResult.base64_audio || '';
    const previewAudioUrl = rawPreviewAudio
      ? await normalizeAudioForStorage(String(rawPreviewAudio), 'audio/mpeg', 'voice-clone-preview')
      : '';

    const voiceData = {
      userId: session.userId,
      voiceId,
      name,
      description,
      sourceAudioUrl,
      promptAudioUrl,
      promptText,
      model,
      previewAudioUrl: previewAudioUrl || undefined,
      language: language || 'zh',
    };

    const insertedId = await VoiceRepository.create(voiceData);

    return NextResponse.json({
      success: true,
      message: '声音克隆成功',
      data: {
        id: insertedId.toString(),
        previewAudio: previewAudioUrl || undefined,
      },
    });
  } catch (error) {
    logError('audio.voice-clone', 'clone voice', error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || '声音克隆失败' },
      { status: 500 }
    );
  }
}
