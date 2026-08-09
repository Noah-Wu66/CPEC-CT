export type SystemVoiceCategory = 'flagship' | 'featured';
export type SystemVoiceGender = 'female' | 'male';
export type SystemVoiceLanguage = 'zh' | 'en';

export interface SystemVoice {
  id: string;
  name: string;
  characteristic: string;
  scene: string;
  gender: SystemVoiceGender;
  age: number;
  languages: readonly SystemVoiceLanguage[];
  category: SystemVoiceCategory;
}

export const SYSTEM_VOICES: readonly SystemVoice[] = [
  {
    id: 'longanlingxin',
    name: '龙安灵心',
    characteristic: '知心温暖',
    scene: '社交陪伴',
    gender: 'female',
    age: 25,
    languages: ['zh', 'en'],
    category: 'flagship',
  },
  {
    id: 'longanlufeng',
    name: '龙安鲁风',
    characteristic: '明亮开朗',
    scene: '社交陪伴',
    gender: 'male',
    age: 25,
    languages: ['zh', 'en'],
    category: 'flagship',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longluliuche',
    name: '龙露柳澈',
    characteristic: '标准播报',
    scene: '新闻播报',
    gender: 'male',
    age: 34,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longliuxulan',
    name: '龙柳旭澜',
    characteristic: '标准播报',
    scene: '新闻播报',
    gender: 'female',
    age: 25,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longlingzhixing',
    name: '龙岭芷杏',
    characteristic: '浑厚深沉',
    scene: '有声阅读',
    gender: 'male',
    age: 68,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longchengzhiyan',
    name: '龙澄芷燕',
    characteristic: '沉稳端庄',
    scene: '有声阅读',
    gender: 'female',
    age: 25,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longxianfengwei',
    name: '龙弦凤薇',
    characteristic: '亲切客服',
    scene: '智能客服',
    gender: 'female',
    age: 26,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longlanlianlan',
    name: '龙嵐涟兰',
    characteristic: '直播带货',
    scene: '电商直播',
    gender: 'female',
    age: 23,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longtongxianhong',
    name: '龙彤弦鸿',
    characteristic: '动漫活力',
    scene: '动漫配音',
    gender: 'male',
    age: 26,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longfengyuanquan',
    name: '龙凤渊泉',
    characteristic: '甜美可爱',
    scene: '动漫配音',
    gender: 'female',
    age: 24,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longjiquexue',
    name: '龙霁鹊雪',
    characteristic: '侠气温柔',
    scene: '古风有声书',
    gender: 'male',
    age: 24,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longrongxianyu',
    name: '龙蓉弦煜',
    characteristic: '端庄御感',
    scene: '古风有声书',
    gender: 'female',
    age: 26,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longyingdielin',
    name: '龙莹蝶琳',
    characteristic: '热血激情',
    scene: '体育解说',
    gender: 'male',
    age: 42,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longlanqinluan',
    name: '龙兰琴鸾',
    characteristic: '沉稳知性',
    scene: '知识分享',
    gender: 'female',
    age: 25,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longsonglinwang',
    name: '龙松麟望',
    characteristic: '温暖磁性',
    scene: '深夜电台',
    gender: 'male',
    age: 36,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-longxianlingling',
    name: '龙弦凌岭',
    characteristic: '磁性质感',
    scene: '深夜电台',
    gender: 'female',
    age: 25,
    languages: ['zh'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-loongolivialin',
    name: 'Olivia Lin',
    characteristic: '温柔知性',
    scene: '情感陪伴',
    gender: 'female',
    age: 28,
    languages: ['en'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-loongadriangao',
    name: 'Adrian Gao',
    characteristic: '沉稳端庄',
    scene: '有声阅读',
    gender: 'male',
    age: 22,
    languages: ['en'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-loongjameszhao',
    name: 'James Zhao',
    characteristic: '新闻播报',
    scene: '日常对话',
    gender: 'male',
    age: 28,
    languages: ['en'],
    category: 'featured',
  },
  {
    id: 'qwen-audio-3.0-tts-plus-loongivyhu',
    name: 'Ivy Hu',
    characteristic: '自信从容',
    scene: '演讲朗诵',
    gender: 'female',
    age: 54,
    languages: ['en'],
    category: 'featured',
  },
];

export const SYSTEM_VOICE_IDS: ReadonlySet<string> = new Set(
  SYSTEM_VOICES.map((voice) => voice.id)
);

export const SYSTEM_VOICE_NAME_BY_ID: ReadonlyMap<string, string> = new Map(
  SYSTEM_VOICES.map((voice) => [voice.id, voice.name])
);

export function getSystemVoiceName(voiceId: string) {
  return SYSTEM_VOICE_NAME_BY_ID.get(voiceId);
}
