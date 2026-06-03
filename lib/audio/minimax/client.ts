const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1';

export class MiniMaxAPI {
  private getHeaders() {
    return {
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      'Content-Type': 'application/json',
    };
  }

  async uploadFile(file: File, purpose: 'voice_clone' | 'prompt_audio'): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', purpose);

    const response = await fetch(`${MINIMAX_BASE_URL}/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '文件上传失败');
    }

    const data = await response.json();
    return data.file.file_id;
  }

  async cloneVoice(params: {
    file_id: string;
    voice_id: string;
    clone_prompt?: {
      prompt_audio?: string;
      prompt_text?: string;
    };
    text?: string;
    model: string;
  }) {
    const response = await fetch(`${MINIMAX_BASE_URL}/voice_clone`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '声音克隆失败');
    }

    return await response.json();
  }

  async textToSpeech(params: {
    text: string;
    model: string;
    voice_setting: {
      voice_id: string;
      speed: number;
      vol: number;
      pitch: number;
      english_normalization?: boolean;
    };
    audio_setting?: {
      sample_rate?: number;
      bitrate?: number;
      format?: string;
      channel?: number;
    };
  }) {
    const audioSetting = {
      sample_rate: 32000,
      bitrate: 128000,
      format: 'mp3',
      channel: 1,
      ...params.audio_setting,
    };

    const response = await fetch(`${MINIMAX_BASE_URL}/t2a_v2`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: params.model,
        text: params.text,
        voice_setting: params.voice_setting,
        audio_setting: audioSetting,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '语音合成失败');
    }

    return await response.json();
  }

  async createAsyncTTS(params: {
    model: string;
    text?: string;
    text_file_id?: string;
    language_boost?: string;
    voice_setting: {
      voice_id: string;
      speed: number;
      vol: number;
      pitch: number;
    };
    pronunciation_dict?: {
      tone?: string[];
    };
    audio_setting: {
      audio_sample_rate?: number;
      bitrate?: number;
      format?: string;
      channel?: number;
    };
    voice_modify?: {
      pitch?: number;
      intensity?: number;
      timbre?: number;
      sound_effects?: string;
    };
  }) {
    const response = await fetch(`${MINIMAX_BASE_URL}/t2a_async_v2`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({} as Record<string, unknown>));
      throw new Error((error.message as string | undefined) || '长文本语音合成任务创建失败');
    }

    return await response.json();
  }

  async queryAsyncTTS(task_id: string) {
    const url = `${MINIMAX_BASE_URL}/query/t2a_async_query_v2?task_id=${encodeURIComponent(task_id)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({} as Record<string, unknown>));
      throw new Error((error.message as string | undefined) || '长文本语音合成任务查询失败');
    }

    return await response.json();
  }

  async retrieveFileContent(file_id: string): Promise<{ arrayBuffer: ArrayBuffer; contentType: string | null }> {
    const url = `${MINIMAX_BASE_URL}/files/retrieve_content?file_id=${encodeURIComponent(file_id)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || '音频文件下载失败');
    }

    const contentType = response.headers.get('content-type');
    const arrayBuffer = await response.arrayBuffer();
    return { arrayBuffer, contentType };
  }

}

export const minimaxAPI = new MiniMaxAPI();
