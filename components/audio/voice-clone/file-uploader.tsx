'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { upload } from '@vercel/blob/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, FileAudio } from 'lucide-react';

interface FileUploaderProps {
  onUploadComplete: (url: string, fileId: string, blobUrl: string) => void;
  onRemove?: () => void;
  accept?: string;
  maxSize?: number;
  label: string;
  description?: string;
  uploadedUrl?: string;
  purpose: 'voice_clone' | 'prompt_audio';
}

export function FileUploader({
  onUploadComplete,
  onRemove,
  accept = 'audio/*',
  maxSize = 20 * 1024 * 1024,
  label,
  description,
  uploadedUrl,
  purpose,
}: FileUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploadedFile, setUploadedFile] = useState(uploadedUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSize) {
      setError('文件大小超过20MB限制');
      return;
    }

    const validTypes = ['audio/mpeg', 'audio/m4a', 'audio/wav', 'audio/x-wav', 'audio/mp3'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|m4a|wav)$/i)) {
      setError('仅支持MP3、M4A、WAV格式');
      return;
    }

    setError('');
    setIsUploading(true);

    try {
      const blob = await upload(file.name, file, {
        access: 'private',
        handleUploadUrl: '/api/audio/upload',
      });

      const forwardResponse = await fetch('/api/audio/upload/forward-to-bailian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blobUrl: blob.url,
          purpose,
        }),
      });

      const forwardData = await forwardResponse.json();

      if (!forwardResponse.ok || !forwardData.success) {
        throw new Error(forwardData.error || '准备音频失败');
      }

      const proxyUrl = `/api/audio/blob?url=${encodeURIComponent(blob.url)}`;
      setUploadedFile(proxyUrl);
      onUploadComplete(proxyUrl, forwardData.file_id, blob.url);
    } catch (err) {
      setError((err as Error).message || '上传失败');
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
      <Label>{label}</Label>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {uploadedFile ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border/80 bg-[var(--soft-green)] p-3">
          <FileAudio className="h-8 w-8 text-[var(--audio-green)]" />
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
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] p-6">
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--soft-green)]">
              <Upload className="h-6 w-6 text-[var(--audio-green)]" />
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                onChange={handleFileSelect}
                disabled={isUploading}
                className="hidden"
                id={`file-upload-${label}`}
              />
              <label
                htmlFor={`file-upload-${label}`}
                className="inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {isUploading ? '上传中...' : '选择文件'}
              </label>
              <p className="text-xs text-muted-foreground mt-2">
                支持 MP3、M4A、WAV 格式，最大 20MB
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
