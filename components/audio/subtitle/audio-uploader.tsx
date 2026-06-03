'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { upload } from '@vercel/blob/client';
import { Upload, X, FileAudio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface AudioUploaderProps {
  onUploadComplete: (fileUrl: string, fileName: string) => void;
  onRemove?: () => void;
  accept?: string;
  maxSize?: number;
  maxDurationSeconds?: number;
  label: string;
  description?: string;
  disabled?: boolean;
}

const DEFAULT_ACCEPT = '.mp3,.wav,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/ogg,application/ogg';
const ALLOWED_EXTENSIONS = new Set(['mp3', 'wav', 'ogg']);

function getFileExtension(fileName: string): string {
  return fileName.toLowerCase().split('.').pop() || '';
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    const objectUrl = URL.createObjectURL(file);

    const clear = () => {
      URL.revokeObjectURL(objectUrl);
      audio.removeAttribute('src');
    };

    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : NaN;
      clear();

      if (Number.isNaN(duration)) {
        reject(new Error('无法读取音频时长'));
        return;
      }

      resolve(duration);
    };

    audio.onerror = () => {
      clear();
      reject(new Error('音频文件读取失败'));
    };

    audio.src = objectUrl;
  });
}

export function AudioUploader({
  onUploadComplete,
  onRemove,
  accept = DEFAULT_ACCEPT,
  maxSize = 500 * 1024 * 1024,
  maxDurationSeconds = 5 * 60 * 60,
  label,
  description,
  disabled = false,
}: AudioUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploadedFile, setUploadedFile] = useState<string>();
  const [uploadedFileName, setUploadedFileName] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      setError('仅支持 mp3、wav、ogg 音频文件');
      return;
    }

    if (file.size > maxSize) {
      setError(`文件大小超过 ${Math.round(maxSize / 1024 / 1024)}MB 限制`);
      return;
    }

    setError('');
    setIsUploading(true);

    try {
      const duration = await readAudioDuration(file);
      if (duration > maxDurationSeconds) {
        setError('音频时长超过 5 小时限制');
        return;
      }

      const blob = await upload(file.name, file, {
        access: 'private',
        handleUploadUrl: '/api/audio/upload',
      });

      const proxyUrl = `/api/audio/blob?url=${encodeURIComponent(blob.url)}`;
      setUploadedFile(proxyUrl);
      setUploadedFileName(file.name);
      onUploadComplete(proxyUrl, file.name);
    } catch (err) {
      setError((err as Error).message || '上传失败');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    setUploadedFile(undefined);
    setUploadedFileName(undefined);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onRemove?.();
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}

      {uploadedFile ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border/80 bg-[var(--soft-green)] p-3">
          <FileAudio className="h-8 w-8 text-[var(--audio-green)]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {uploadedFileName || uploadedFile.split('/').pop()}
            </p>
            <p className="text-xs text-muted-foreground">上传成功</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRemove}
            disabled={isUploading || disabled}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] p-6">
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--soft-green)]">
              <Upload className="h-6 w-6 text-[var(--audio-green)]" />
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                onChange={handleFileSelect}
                disabled={isUploading || disabled}
                className="hidden"
                id="subtitle-audio-upload"
              />
              <label
                htmlFor="subtitle-audio-upload"
                className={`inline-flex items-center justify-center rounded-[var(--radius-md)] px-4 py-2 text-sm font-bold transition-colors ${
                  disabled
                    ? 'cursor-not-allowed bg-muted text-foreground/70'
                    : 'cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {isUploading ? '上传中...' : '选择文件'}
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                仅支持 mp3、wav、ogg，最大 500MB，最长 5 小时
              </p>
            </div>
          </div>
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
