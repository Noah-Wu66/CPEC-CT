'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ImagePlus, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ImageResultCard } from '@/components/media/image/image-result-card';
import { editImage, generateImage } from '@/lib/media/client/media';
import {
  IMAGE_EDIT_ACCEPTED_MIME_TYPES,
  IMAGE_EDIT_MAX_BYTES,
  IMAGE_EDIT_MAX_IMAGES,
  IMAGE_MODEL_ICON_URL,
  IMAGE_MODEL_NAME,
  IMAGE_PROMPT_MAX_LENGTH,
  IMAGE_SIZE_OPTIONS,
  type ImageSize,
} from '@/lib/media/shared/models';

type ImageMode = 'generate' | 'edit';

export default function ImageGenerationPage() {
  const [mode, setMode] = useState<ImageMode>('generate');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<ImageSize>('2048*2048');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [resultTitle, setResultTitle] = useState('生成的图片');
  const [sourceImages, setSourceImages] = useState<File[]>([]);
  const [sourcePreviewUrls, setSourcePreviewUrls] = useState<string[]>([]);
  const [sourceInputKey, setSourceInputKey] = useState(0);

  useEffect(() => {
    const nextUrls = sourceImages.map((image) => URL.createObjectURL(image));
    setSourcePreviewUrls(nextUrls);
    return () => {
      nextUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [sourceImages]);

  const handleModeChange = (nextMode: ImageMode) => {
    setMode(nextMode);
    setError('');
    setImageUrl('');
    setResultTitle(nextMode === 'edit' ? '编辑后的图片' : '生成的图片');
  };

  const handleSourceImagesChange = (files: File[]) => {
    setError('');
    if (files.length > IMAGE_EDIT_MAX_IMAGES) {
      setSourceImages([]);
      setSourceInputKey((current) => current + 1);
      setError(`参考图片最多支持 ${IMAGE_EDIT_MAX_IMAGES} 张`);
      return;
    }
    setSourceImages(files);
    setSourceInputKey((current) => current + 1);
  };

  const handleRemoveSourceImage = (indexToRemove: number) => {
    setError('');
    setSourceImages((current) => current.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setImageUrl('');

    if (!prompt.trim()) {
      setError('请输入图片描述');
      return;
    }

    if (prompt.trim().length > IMAGE_PROMPT_MAX_LENGTH) {
      setError(`描述最多支持 ${IMAGE_PROMPT_MAX_LENGTH} 个字符`);
      return;
    }

    if (mode === 'edit') {
      if (sourceImages.length === 0) {
        setError('请上传 1–3 张参考图片');
        return;
      }

      if (sourceImages.length > IMAGE_EDIT_MAX_IMAGES) {
        setError(`参考图片最多支持 ${IMAGE_EDIT_MAX_IMAGES} 张`);
        return;
      }

      for (let index = 0; index < sourceImages.length; index += 1) {
        const sourceImage = sourceImages[index];
        if (!IMAGE_EDIT_ACCEPTED_MIME_TYPES.includes(sourceImage.type as typeof IMAGE_EDIT_ACCEPTED_MIME_TYPES[number])) {
          setError(`第 ${index + 1} 张参考图片格式不支持`);
          return;
        }

        if (sourceImage.size <= 0 || sourceImage.size > IMAGE_EDIT_MAX_BYTES) {
          setError(`第 ${index + 1} 张参考图片大小不能超过 10MB`);
          return;
        }
      }
    }

    setIsGenerating(true);
    try {
      const url = mode === 'edit'
        ? await editImage({ prompt: prompt.trim(), size, images: sourceImages })
        : await generateImage({ prompt: prompt.trim(), size });
      setImageUrl(url);
      setResultTitle(mode === 'edit' ? '编辑后的图片' : '生成的图片');
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '图片处理失败，请稍后再试');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--oa-paper-soft)] text-[var(--oa-ink)]">
              <img src={IMAGE_MODEL_ICON_URL} alt="" className="h-7 w-7 object-contain" />
            </div>
            <div>
              <CardTitle>图片生成</CardTitle>
              <CardDescription>使用 {IMAGE_MODEL_NAME}，生成新图片，或通过 1–3 张参考图编辑画面。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error ? <div className="alert-danger">{error}</div> : null}

            <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--oa-control-border)] bg-[var(--oa-paper-soft)] p-1">
              <button
                type="button"
                onClick={() => handleModeChange('generate')}
                className={`flex h-11 items-center justify-center gap-2 rounded-[calc(0.5rem-2px)] text-sm font-medium transition ${
                  mode === 'generate'
                    ? 'bg-[var(--oa-elevated)] shadow-[var(--shadow-sm)] text-[var(--oa-ink)]'
                    : 'text-[var(--oa-muted)] hover:text-[var(--oa-ink)]'
                }`}
              >
                <Sparkles className="h-4 w-4" />
                生成图片
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('edit')}
                className={`flex h-11 items-center justify-center gap-2 rounded-[calc(0.5rem-2px)] text-sm font-medium transition ${
                  mode === 'edit'
                    ? 'bg-[var(--oa-elevated)] shadow-[var(--shadow-sm)] text-[var(--oa-ink)]'
                    : 'text-[var(--oa-muted)] hover:text-[var(--oa-ink)]'
                }`}
              >
                <ImagePlus className="h-4 w-4" />
                编辑图片
              </button>
            </div>

            {mode === 'edit' ? (
              <div className="space-y-2">
                <Label htmlFor="source-images">参考图片（1–3 张）</Label>
                <div className="space-y-3">
                  <label
                    htmlFor="source-images"
                    className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-4 py-5 text-center text-sm text-[var(--oa-muted)] transition hover:border-[var(--oa-ink)] hover:text-[var(--oa-ink)]"
                  >
                    <Upload className="mb-2 h-6 w-6" />
                    <span className="font-medium">
                      {sourceImages.length > 0
                        ? `已选择 ${sourceImages.length} 张，点击可重新选择`
                        : '选择 1–3 张参考图片'}
                    </span>
                    <span className="mt-1 text-xs">支持 JPG、PNG、BMP、TIFF、WEBP、GIF，每张最大 10MB</span>
                    <input
                      key={sourceInputKey}
                      id="source-images"
                      type="file"
                      multiple
                      accept={IMAGE_EDIT_ACCEPTED_MIME_TYPES.join(',')}
                      className="sr-only"
                      onChange={(event) => handleSourceImagesChange(Array.from(event.target.files || []))}
                    />
                  </label>

                  {sourceImages.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {sourceImages.map((image, index) => (
                        <div
                          key={`${image.name}-${image.lastModified}-${index}`}
                          className="relative overflow-hidden rounded-lg border border-[var(--oa-card-border)] bg-[var(--oa-paper-soft)]"
                        >
                          <img
                            src={sourcePreviewUrls[index]}
                            alt={`参考图片 ${index + 1}`}
                            className="h-[148px] w-full object-contain"
                          />
                          <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
                            参考图 {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSourceImage(index)}
                            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                            aria-label={`移除第 ${index + 1} 张参考图片`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-20 items-center justify-center rounded-lg border border-[var(--oa-card-border)] bg-[var(--oa-paper-soft)] text-sm text-[var(--oa-muted)]">
                      尚未选择参考图片
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="image-prompt">图片描述</Label>
              <textarea
                id="image-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={IMAGE_PROMPT_MAX_LENGTH}
                placeholder={mode === 'edit'
                  ? '描述你想修改的地方，例如：保留人物姿势，将背景改成夜晚街景，增加霓虹灯'
                  : '描述你想生成的画面，例如：夕阳下的城市天际线，电影感光影，细节清晰'}
                className="min-h-[140px] w-full rounded-lg border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-3 py-2.5 text-sm text-[var(--oa-ink)] outline-none transition-colors hover:border-[var(--oa-control-hover-border)] focus:border-[var(--oa-ink)]"
              />
              <div className="text-right text-xs text-[var(--oa-muted)]">
                {prompt.length}/{IMAGE_PROMPT_MAX_LENGTH}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-size">图片尺寸</Label>
              <select
                id="image-size"
                value={size}
                onChange={(event) => setSize(event.target.value as ImageSize)}
                className="h-10 w-full rounded-lg border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-3 text-sm text-[var(--oa-ink)] outline-none transition-colors hover:border-[var(--oa-control-hover-border)] focus:border-[var(--oa-ink)]"
              >
                {IMAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  {mode === 'edit' ? '编辑图片' : '生成图片'}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ImageResultCard imageUrl={imageUrl} title={resultTitle} />
    </div>
  );
}
