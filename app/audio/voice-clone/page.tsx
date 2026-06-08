'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Upload } from 'lucide-react';
import { FileUploader } from '@/components/audio/voice-clone/file-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AUDIO_LANGUAGE_OPTIONS } from '@/lib/audio/client/format';

export default function VoiceClonePage() {
  const router = useRouter();
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [sourceFile, setSourceFile] = useState<{ url: string; fileId: string; blobUrl: string }>();

  const generateVoiceId = () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `voice-${timestamp}-${random}`;
  };

  const [formData, setFormData] = useState(() => ({
    voiceId: generateVoiceId(),
    name: '',
    description: '',
    previewText: '这是一段测试音频，用于预览克隆效果。',
    language: 'zh',
  }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!sourceFile) {
      setError('请上传源音频文件');
      return;
    }

    if (!formData.name) {
      setError('请填写声音名称');
      return;
    }

    setIsCloning(true);

    try {
      const response = await fetch('/api/audio/voice-clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceFileId: sourceFile.fileId,
          sourceAudioUrl: sourceFile.url,
          voiceId: formData.voiceId,
          name: formData.name,
          description: formData.description,
          previewText: formData.previewText,
          language: formData.language,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || '克隆失败');
        setIsCloning(false);
        return;
      }

      setSuccess('声音克隆成功！');
      setTimeout(() => {
        router.push('/audio/my-voices');
      }, 2000);
    } catch {
      setError('克隆失败，请稍后重试');
      setIsCloning(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="alert-danger">
            {error}
          </div>
        )}

        {success && (
          <div className="success-text">
            {success}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              上传音频文件
            </CardTitle>
            <CardDescription>
              上传源音频文件（10秒-5分钟）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileUploader
              label="源音频文件 *"
              description="10秒-5分钟，用于克隆的主要音频样本"
              onUploadComplete={(url, fileId, blobUrl) => setSourceFile({ url, fileId, blobUrl })}
              onRemove={() => setSourceFile(undefined)}
              purpose="voice_clone"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>声音配置</CardTitle>
            <CardDescription>
              配置您要创建的声音参数
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">声音名称 *</Label>
              <Input
                id="name"
                placeholder="我的声音"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">声音描述</Label>
              <Input
                id="description"
                placeholder="简要描述这个声音的特点"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">语言</Label>
              <select
                id="language"
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                className="flex h-10 w-full px-3 py-2 text-sm"
              >
                {AUDIO_LANGUAGE_OPTIONS.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="previewText">预览文本</Label>
              <Input
                id="previewText"
                value={formData.previewText}
                onChange={(e) => setFormData({ ...formData, previewText: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                用于试听克隆效果的一段文本
              </p>
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isCloning}
        >
          {isCloning ? (
            '克隆中...'
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              开始克隆声音
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
