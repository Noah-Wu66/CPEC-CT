import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/audio/auth/session';
import { requestMinimaxCompletion } from '@/lib/ai/server/minimax/client';
import { logError } from '@/lib/logger';

const LANGUAGE_NAMES: Record<string, string> = {
  zh: '简体中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  ru: 'Русский',
  ar: 'العربية',
  th: 'ไทย',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
};

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, message: '未登录' }, { status: 401 });
    }

    if (!process.env.MINIMAX_API_KEY) {
      return NextResponse.json({ success: false, message: '缺少 MINIMAX_API_KEY' }, { status: 500 });
    }

    const body = await request.json();
    const { texts, targetLang } = body as { texts: string[]; targetLang: string };

    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ success: false, message: '缺少翻译文本' }, { status: 400 });
    }

    if (!targetLang || !LANGUAGE_NAMES[targetLang]) {
      return NextResponse.json({ success: false, message: '不支持的目标语言' }, { status: 400 });
    }

    const langName = LANGUAGE_NAMES[targetLang];

    // 将所有文本用编号分隔，一次性翻译
    const numberedLines = texts.map((t, i) => `[${i}] ${t}`).join('\n');

    const prompt = [
      `你是专业的字幕翻译员。请将以下编号字幕逐行翻译为${langName}。`,
      '要求：',
      '1. 保持编号格式 [数字] 不变，只翻译后面的内容',
      '2. 每行独立翻译，不要合并或拆分',
      '3. 翻译要自然流畅，符合目标语言的表达习惯',
      '4. 只输出翻译结果，不要添加任何解释',
      '',
      numberedLines,
    ].join('\n');

    const resultText = await requestMinimaxCompletion({
      prompt,
      signal: request?.signal,
    });

    // 解析翻译结果
    const translatedTexts = new Array<string>(texts.length).fill('');
    const lines = resultText.split('\n');

    for (const line of lines) {
      const match = line.match(/^\[(\d+)\]\s*(.+)$/);
      if (match) {
        const index = parseInt(match[1], 10);
        if (index >= 0 && index < texts.length) {
          translatedTexts[index] = match[2].trim();
        }
      }
    }

    // 没匹配到编号的情况，按行序填充
    const unmatchedCount = translatedTexts.filter((t) => !t).length;
    if (unmatchedCount === texts.length && lines.length >= texts.length) {
      for (let i = 0; i < texts.length; i++) {
        translatedTexts[i] = (lines[i] || '').replace(/^\[\d+\]\s*/, '').trim() || texts[i];
      }
    }

    // 仍然为空的用原文填充
    for (let i = 0; i < translatedTexts.length; i++) {
      if (!translatedTexts[i]) {
        translatedTexts[i] = texts[i];
      }
    }

    return NextResponse.json({ success: true, texts: translatedTexts });
  } catch (error) {
    logError('audio.subtitle', 'translate subtitle', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '翻译失败' },
      { status: 500 }
    );
  }
}
