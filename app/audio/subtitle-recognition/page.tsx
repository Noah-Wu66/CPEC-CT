'use client';

import { useEffect, useRef, useState } from 'react';
import { Captions, ChevronDown, Download, FileText, Languages, Loader2, Settings, Subtitles } from 'lucide-react';
import { AudioUploader } from '@/components/audio/subtitle/audio-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  getSentenceDisplayText,
  msToSrtTime,
  sentencesToSrt,
  sentencesToTxt,
  type SubtitleSentence,
} from '@/lib/audio/subtitle/format';
import {
  createSubtitleRecognitionTask,
  LANGUAGE_OPTIONS,
  loadSubtitleSentences,
  saveSubtitleRecognitionHistory,
  TRANSLATE_OPTIONS,
  translateSubtitleSentences,
  type RecognitionLanguage,
  type RecognitionMode,
  type TranslateLanguage,
} from '@/lib/audio/client/subtitle-recognition';
import { downloadTextFile, safeFileStem } from '@/lib/client/download';

function Switch({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-[var(--audio-green)]' : 'bg-muted'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-[var(--oa-elevated)] transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function SubtitleRecognitionPage() {
  const isMounted = useRef(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [fileUrl, setFileUrl] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const [sentences, setSentences] = useState<SubtitleSentence[]>([]);

  const [recognitionMode, setRecognitionMode] = useState<RecognitionMode>('subtitle');
  const [language, setLanguage] = useState<RecognitionLanguage>('auto');
  const [enableItn, setEnableItn] = useState(true);
  const [enablePunc, setEnablePunc] = useState(true);
  const [enableDdc, setEnableDdc] = useState(true);
  const [enableSpeakerInfo, setEnableSpeakerInfo] = useState(false);
  const [hotwordsText, setHotwordsText] = useState('');
  const [translateLang, setTranslateLang] = useState<TranslateLanguage>('original');
  const [isTranslating, setIsTranslating] = useState(false);

  const parseHotwords = (text: string) =>
    text
      .split(/[\n,，、;；]/)
      .map((word) => word.trim())
      .filter(Boolean)
      .slice(0, 200);

  const isSpeakerSupported =
    recognitionMode === 'subtitle' && (language === 'auto' || language === 'zh');

  useEffect(() => {
    if (!isSpeakerSupported && enableSpeakerInfo) {
      setEnableSpeakerInfo(false);
    }
  }, [enableSpeakerInfo, isSpeakerSupported]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleStartRecognition = async () => {
    if (!fileUrl || !fileName) {
      setError('请先上传音频文件');
      return;
    }

    setError('');
    setSentences([]);
    setIsProcessing(true);

    try {
      const task = await createSubtitleRecognitionTask({
        fileUrl,
        fileName,
        mode: recognitionMode,
        language,
        enableItn,
        enablePunc,
        enableDdc,
        enableSpeakerInfo: isSpeakerSupported && enableSpeakerInfo,
        hotwords: parseHotwords(hotwordsText),
      });
      const resultSentences = await loadSubtitleSentences(task.sentencesUrl);
      let finalSentences = resultSentences;

      if (translateLang !== 'original') {
        setIsProcessing(false);
        setIsTranslating(true);
        finalSentences = await translateSubtitleSentences(resultSentences, translateLang);
      }

      if (!isMounted.current) return;
      setSentences(finalSentences);

      await saveSubtitleRecognitionHistory({
        fileName,
        fileUrl,
        sentencesUrl: task.sentencesUrl,
        sentenceCount: task.sentenceCount || resultSentences.length,
        durationMs: task.durationMs,
      });
    } catch (recognitionError) {
      if (!isMounted.current) return;
      setError(recognitionError instanceof Error ? recognitionError.message : '识别失败，请稍后重试');
    } finally {
      if (isMounted.current) {
        setIsProcessing(false);
        setIsTranslating(false);
      }
    }
  };

  const handleDownloadTxt = () => {
    if (sentences.length === 0 || !fileName) return;
    const content = sentencesToTxt(sentences);
    downloadTextFile(`${safeFileStem(fileName)}.txt`, content);
  };

  const handleDownloadSrt = () => {
    if (sentences.length === 0 || !fileName) return;
    const content = sentencesToSrt(sentences);
    downloadTextFile(`${safeFileStem(fileName)}.srt`, content);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {error ? (
        <div className="alert-danger">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>识别模式</CardTitle>
          <CardDescription>文本模式输出完整文字稿，字幕模式自动生成带时间轴的字幕文件</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={() => setRecognitionMode('text')}
              disabled={isProcessing}
              className={`flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-md)] border p-4 transition-all ${
                recognitionMode === 'text'
                  ? 'border-[var(--audio-green)] bg-[var(--soft-green)]'
                  : 'border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] hover:border-[var(--audio-green)]'
              } ${isProcessing ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <FileText
                className={`h-8 w-8 ${
                  recognitionMode === 'text' ? 'text-[var(--audio-green)]' : 'text-muted-foreground'
                }`}
              />
              <div className="text-center">
                <div className={`font-bold ${recognitionMode === 'text' ? 'text-[var(--audio-green)]' : ''}`}>
                  文本识别
                </div>
                <div className="text-xs text-muted-foreground">适合整理录音文字内容</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setRecognitionMode('subtitle')}
              disabled={isProcessing}
              className={`flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-md)] border p-4 transition-all ${
                recognitionMode === 'subtitle'
                  ? 'border-[var(--audio-green)] bg-[var(--soft-green)]'
                  : 'border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] hover:border-[var(--audio-green)]'
              } ${isProcessing ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <Subtitles
                className={`h-8 w-8 ${
                  recognitionMode === 'subtitle' ? 'text-[var(--audio-green)]' : 'text-muted-foreground'
                }`}
              />
              <div className="text-center">
                <div className={`font-bold ${recognitionMode === 'subtitle' ? 'text-[var(--audio-green)]' : ''}`}>
                  字幕识别
                </div>
                <div className="text-xs text-muted-foreground">自动生成字幕文件（含时间轴），可导出 SRT 格式</div>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Captions className="h-5 w-5" />
            上传音频
          </CardTitle>
          <CardDescription>上传需要识别的音频文件</CardDescription>
        </CardHeader>
        <CardContent>
          <AudioUploader
            label="音频文件"
            description="请上传 mp3、wav、ogg 格式音频"
            onUploadComplete={(url, name) => {
              setFileUrl(url);
              setFileName(name);
              setError('');
              setSentences([]);
            }}
            onRemove={() => {
              setFileUrl(undefined);
              setFileName(undefined);
              setError('');
              setSentences([]);
            }}
            disabled={isProcessing}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {recognitionMode === 'text' ? '文本识别设置' : '字幕识别设置'}
          </CardTitle>
          <CardDescription>
            {recognitionMode === 'text'
              ? '调整识别语言、标点补全等文字处理选项'
              : '调整识别语言、说话人区分等字幕生成选项'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>识别语言</Label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setLanguage(option.value)}
                  disabled={isProcessing}
                  className={`rounded-[var(--radius-md)] border px-4 py-2 text-sm font-bold transition-colors ${
                    language === option.value
                      ? 'border-[var(--audio-green)] bg-[var(--soft-green)] text-[var(--audio-green)]'
                      : 'border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] hover:border-[var(--audio-green)]'
                  } ${isProcessing ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>自动标点</Label>
              <p className="text-xs text-muted-foreground">自动补齐逗号、句号等标点符号</p>
            </div>
            <Switch checked={enablePunc} disabled={isProcessing} onToggle={() => setEnablePunc(!enablePunc)} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>数字规整</Label>
              <p className="text-xs text-muted-foreground">把数字表达整理成更自然的文本形式</p>
            </div>
            <Switch checked={enableItn} disabled={isProcessing} onToggle={() => setEnableItn(!enableItn)} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>语义顺滑</Label>
              <p className="text-xs text-muted-foreground">让断句和输出内容更贴近自然表达</p>
            </div>
            <Switch checked={enableDdc} disabled={isProcessing} onToggle={() => setEnableDdc(!enableDdc)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hotwords">上下文热词 / 术语</Label>
            <p className="text-xs text-muted-foreground">
              填入人名、品牌、专业术语等专有名词，识别时会优先匹配，提升准确率。多个词用换行或逗号分隔，最多 200 个。
            </p>
            <textarea
              id="hotwords"
              value={hotwordsText}
              onChange={(e) => setHotwordsText(e.target.value)}
              disabled={isProcessing}
              rows={3}
              placeholder="例如：菁门·先锋行，百炼，数字融媒体"
              className={`w-full rounded-[var(--radius-md)] border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-3 py-2 text-sm text-[var(--oa-ink)] transition-colors hover:border-[var(--audio-green)] focus:border-[var(--audio-green)] focus:outline-none ${
                isProcessing ? 'cursor-not-allowed opacity-50' : ''
              }`}
            />
          </div>

          {recognitionMode === 'subtitle' ? (
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>说话人识别</Label>
                <p className="text-xs text-muted-foreground">
                  {isSpeakerSupported
                    ? '识别不同说话人的发言片段'
                    : '说话人识别仅支持自动或中文识别'}
                </p>
              </div>
              <Switch
                checked={enableSpeakerInfo}
                disabled={isProcessing || !isSpeakerSupported}
                onToggle={() => setEnableSpeakerInfo(!enableSpeakerInfo)}
              />
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <Label>翻译字幕</Label>
            </div>
            <p className="text-xs text-muted-foreground">识别完成后自动翻译为目标语言，默认不翻译</p>
            <div className="relative">
              <select
                value={translateLang}
                onChange={(e) => setTranslateLang(e.target.value as TranslateLanguage)}
                disabled={isProcessing || isTranslating}
                className={`w-full appearance-none px-4 py-2.5 pr-10 text-sm transition-colors hover:border-[var(--audio-green)] focus:border-[var(--audio-green)] focus:outline-none ${
                  isProcessing || isTranslating ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                {TRANSLATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        size="lg"
        className="w-full"
        onClick={handleStartRecognition}
        disabled={!fileUrl || !fileName || isProcessing || isTranslating}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            识别中...
          </>
        ) : isTranslating ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            翻译中...
          </>
        ) : (
          <>
            <Captions className="mr-2 h-5 w-5" />
            开始识别
          </>
        )}
      </Button>

      {sentences.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{recognitionMode === 'text' ? '识别文本' : '识别结果'}</CardTitle>
            <CardDescription>
              共识别 {sentences.length} 句
              {enableSpeakerInfo && recognitionMode === 'subtitle' ? '，已包含说话人信息' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button onClick={handleDownloadTxt} variant="outline" className="flex-1">
                <Download className="mr-2 h-4 w-4" />
                下载 TXT
              </Button>
              {recognitionMode === 'subtitle' ? (
                <Button onClick={handleDownloadSrt} variant="outline" className="flex-1">
                  <Download className="mr-2 h-4 w-4" />
                  下载 SRT
                </Button>
              ) : null}
            </div>

            <div className="custom-scrollbar max-h-80 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-muted/30 p-4 font-mono text-sm">
              {sentences.map((sentence, index) => (
                <div key={index} className="mb-4 last:mb-0">
                  <div className="font-bold text-primary">{index + 1}</div>
                  {recognitionMode === 'subtitle' ? (
                    <div className="text-muted-foreground">
                      {msToSrtTime(sentence.begin_time)} --&gt; {msToSrtTime(sentence.end_time)}
                    </div>
                  ) : null}
                  <div className="mt-1">{getSentenceDisplayText(sentence)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
