export const IMAGE_MODEL = "qwen-image-3.0-pro";
export const VIDEO_TEXT_MODEL = "happyhorse-1.1-t2v";
export const VIDEO_IMAGE_MODEL = "happyhorse-1.1-i2v";

export const IMAGE_MODEL_NAME = "Qwen-Image 3.0 Pro";
export const VIDEO_MODEL_NAME = "HappyHorse 1.1";
export const IMAGE_MODEL_ICON_URL = "https://cdn.marmot-cloud.com/storage/zenmux/2026/04/01/qeMamJm/Property-1Qwen.svg";
export const VIDEO_MODEL_ICON_URL = "https://cdn.marmot-cloud.com/storage/zenmux/2026/04/29/PtJslv8/Property-1Happy-Horse.svg";
export const IMAGE_PROMPT_MAX_LENGTH = 1300;
export const IMAGE_EDIT_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_EDIT_MAX_IMAGES = 3;
export const IMAGE_EDIT_ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/bmp",
  "image/tiff",
  "image/webp",
  "image/gif",
] as const;
export const VIDEO_PROMPT_MAX_LENGTH = 5000;
export const VIDEO_PROMPT_MAX_WEIGHT = 5000;
export const VIDEO_PROMPT_CHINESE_MAX_LENGTH = 2500;
export const VIDEO_FRAME_MAX_BYTES = 20 * 1024 * 1024;
export const VIDEO_FRAME_MIN_SIDE = 300;
export const VIDEO_FRAME_MIN_RATIO = 1 / 2.5;
export const VIDEO_FRAME_MAX_RATIO = 2.5;
export const VIDEO_FRAME_ACCEPTED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const IMAGE_SIZE_OPTIONS = [
  { id: "2048*2048", label: "方形 1:1（2048×2048）" },
  { id: "2688*1536", label: "横屏 16:9（2688×1536）" },
  { id: "1536*2688", label: "竖屏 9:16（1536×2688）" },
  { id: "2368*1728", label: "横屏 4:3（2368×1728）" },
  { id: "1728*2368", label: "竖屏 3:4（1728×2368）" },
] as const;

export const VIDEO_ASPECT_RATIO_OPTIONS = [
  { id: "16:9", label: "横屏 16:9" },
  { id: "9:16", label: "竖屏 9:16" },
  { id: "1:1", label: "方形 1:1" },
  { id: "4:3", label: "横屏 4:3" },
  { id: "3:4", label: "竖屏 3:4" },
  { id: "4:5", label: "竖版 4:5" },
  { id: "5:4", label: "横版 5:4" },
  { id: "9:21", label: "长竖屏 9:21" },
  { id: "21:9", label: "超宽屏 21:9" },
] as const;

export const VIDEO_DURATION_OPTIONS = [
  { id: 3, label: "3 秒" },
  { id: 4, label: "4 秒" },
  { id: 5, label: "5 秒" },
  { id: 6, label: "6 秒" },
  { id: 7, label: "7 秒" },
  { id: 8, label: "8 秒" },
  { id: 9, label: "9 秒" },
  { id: 10, label: "10 秒" },
  { id: 11, label: "11 秒" },
  { id: 12, label: "12 秒" },
  { id: 13, label: "13 秒" },
  { id: 14, label: "14 秒" },
  { id: 15, label: "15 秒" },
] as const;

export const VIDEO_RESOLUTION_OPTIONS = [
  { id: "720P", label: "720P" },
  { id: "1080P", label: "1080P" },
] as const;

export type ImageSize = (typeof IMAGE_SIZE_OPTIONS)[number]["id"];
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIO_OPTIONS)[number]["id"];
export type VideoDuration = (typeof VIDEO_DURATION_OPTIONS)[number]["id"];
export type VideoResolution = (typeof VIDEO_RESOLUTION_OPTIONS)[number]["id"];

export function getVideoPromptLengthWeight(prompt: string) {
  return Array.from(prompt).reduce((total, char) => {
    return total + (/[\u3400-\u9FFF]/.test(char) ? 2 : 1);
  }, 0);
}
