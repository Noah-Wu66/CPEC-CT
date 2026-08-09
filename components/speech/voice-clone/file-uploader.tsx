'use client';

import { useId, useRef, useState, type ChangeEvent } from 'react';
import { uploadStoredFile } from '@/lib/storage/client';
import type { StoredFileDescriptor } from '@/lib/storage/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, X, FileAudio } from 'lucide-react';

interface FileUploaderProps {
  onUploadComplete: (file: StoredFileDescriptor) => void;
  onRemove?: () => void;
  accept?: string;
  maxSize?: number;
  minDuration?: number;
  maxDuration?: number;
  label: string;
  description?: string;
  uploadedUrl?: string;
}

export function FileUploader({
  onUploadComplete,
  onRemove,
  accept = 'audio/*',
  maxSize = 10 * 1024 * 1024,
  minDuration,
  maxDuration,
  label,
  description,
  uploadedUrl,
}: FileUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploadedFile, setUploadedFile] = useState(uploadedUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const maxSizeMb = Math.round(maxSize / (1024 * 1024));

  const readDuration = (file: File) => {
    return new Promise<number>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const audio = document.createElement('audio');

      const cleanup = () => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
        audio.removeAttribute('src');
        audio.load();
        URL.revokeObjectURL(objectUrl);
      };

      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        cleanup();
        if (Number.isFinite(duration)) resolve(duration);
        else reject(new Error('无法读取音频时长'));
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error('无法读取音频时长，请检查文件是否损坏'));
      };
      audio.src = objectUrl;
    });
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSize) {
      setError(`文件大小不能超过 ${maxSizeMb}MB`);
      e.target.value = '';
      return;
    }

    const validTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      'audio/wav',
      'audio/x-wav',
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|m4a|wav)$/i)) {
      setError('仅支持 MP3、M4A、WAV 格式');
      e.target.value = '';
      return;
    }

    setError('');
    setIsUploading(true);

    try {
      if (minDuration !== undefined || maxDuration !== undefined) {
        const duration = await readDuration(file);
        if (minDuration !== undefined && duration < minDuration) {
          throw new Error(`音频不能短于 ${minDuration} 秒`);
        }
        if (maxDuration !== undefined && duration > maxDuration) {
          throw new Error(`音频不能长于 ${maxDuration} 秒`);
        }
      }

      const storedFile = await uploadStoredFile(file, { scope: 'voice' });

      setUploadedFile(storedFile.url);
      onUploadComplete(storedFile);
    } catch (err) {
      setError((err as Error).message || '上传失败');
      e.target.value = '';
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    setUploadedFile(undefined);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onRemove?.();
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {uploadedFile ? (
        <div className="flex items-center gap-3 rounded-lg border border-border/80 bg-[var(--oa-paper-soft)] p-3">
          <FileAudio className="h-8 w-8 text-[var(--oa-ink)]" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {uploadedFile.split('/').pop()}
            </p>
            <p className="text-xs text-muted-foreground">上传成功</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRemove}
            disabled={isUploading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] p-6">
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--oa-paper-soft)]">
              <Upload className="h-6 w-6 text-[var(--oa-muted)]" />
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                onChange={handleFileSelect}
                disabled={isUploading}
                className="peer sr-only"
                id={inputId}
              />
              <label
                htmlFor={inputId}
                className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
              >
                {isUploading ? '上传中...' : '选择文件'}
              </label>
              <p className="text-xs text-muted-foreground mt-2">
                支持 MP3、M4A、WAV，最大 {maxSizeMb}MB
                {minDuration !== undefined && maxDuration !== undefined
                  ? `，时长 ${minDuration}～${maxDuration} 秒`
                  : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
}
