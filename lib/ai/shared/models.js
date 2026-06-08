// === 阿里云百炼（新加坡端点）：Qwen 对话、Wan 图片生成 ===
export const QWEN_PLUS_MODEL = "qwen3.7-plus";
export const WAN_IMAGE_MODEL = "wan2.7-image-pro";

export const CHAT_RUNTIME_MODE_CHAT = "chat";
export const DEFAULT_CHAT_RUNTIME_MODE = CHAT_RUNTIME_MODE_CHAT;

export const MODEL_GROUP_ORDER = ["bailian", "bailian-image"];

export const MODEL_GROUP_TITLES = Object.freeze({
  bailian: "百炼",
  "bailian-image": "百炼图像",
});

export const CHAT_RUNTIME_MODES = Object.freeze([
  {
    id: CHAT_RUNTIME_MODE_CHAT,
    label: "Chat",
    description: "标准聊天模式",
  },
]);

export const MODEL_NATIVE_INPUT_LABELS = Object.freeze({
  text: "text",
  image: "image",
  file: "file",
  video: "video",
  audio: "audio",
});

const CHAT_MODEL_DEFINITIONS = Object.freeze([
  {
    id: QWEN_PLUS_MODEL,
    name: "Qwen 3.7 Plus",
    provider: "bailian",
    contextWindow: 1000000,
    nativeInputs: ["text", "image", "file"],
    supportsImages: true,
    supportsDocuments: true,
    supportsWebSearch: true,
    supportsAgentRuntime: false,
    supportsPlanning: false,
    supportsToolUse: true,
    supportsApprovalFlow: false,
    supportsMemory: false,
    supportsThinkingLevelControl: false,
    supportsMaxTokensControl: false,
  },
  {
    id: WAN_IMAGE_MODEL,
    name: "Wan 2.7 Image Pro",
    provider: "bailian-image",
    contextWindow: 0,
    nativeInputs: ["text", "image"],
    supportsImages: true,
    supportsDocuments: false,
    supportsWebSearch: false,
    supportsAgentRuntime: false,
    supportsPlanning: false,
    supportsToolUse: false,
    supportsApprovalFlow: false,
    supportsMemory: false,
    supportsThinkingLevelControl: false,
    supportsMaxTokensControl: false,
    isImageGen: true,
  },
]);

const LEGACY_TEXT_MODEL = ["Mini", "Max-M3"].join("");
const LEGACY_IMAGE_MODEL = ["image", "01"].join("-");

function createChatModelConfig(model) {
  const nativeInputs = Object.freeze(
    Array.isArray(model?.nativeInputs) && model.nativeInputs.length > 0
      ? Array.from(new Set(
        model.nativeInputs
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      ))
      : ["text"]
  );

  return Object.freeze({
    ...model,
    nativeInputs,
    supportsImages: nativeInputs.includes("image"),
    supportsDocuments: nativeInputs.includes("file"),
  });
}

export const CHAT_MODELS = Object.freeze(CHAT_MODEL_DEFINITIONS.map(createChatModelConfig));

export const PRIMARY_CHAT_MODELS = Object.freeze(CHAT_MODELS);
const PRIMARY_CHAT_MODEL_IDS = new Set(PRIMARY_CHAT_MODELS.map((model) => model.id));

export const DEFAULT_MODEL = QWEN_PLUS_MODEL;

export const DEFAULT_THINKING_LEVELS = Object.freeze(
  CHAT_MODELS.reduce((acc, model) => {
    if (model.defaultThinkingLevel) {
      acc[model.id] = model.defaultThinkingLevel;
    }
    return acc;
  }, {})
);

export function normalizeModelId(model) {
  if (typeof model !== "string") return model;
  const normalized = model.trim();
  if (normalized === LEGACY_TEXT_MODEL) return QWEN_PLUS_MODEL;
  if (normalized === LEGACY_IMAGE_MODEL) return WAN_IMAGE_MODEL;
  return normalized;
}

export function isBailianChatModel(model) {
  return normalizeModelId(model) === QWEN_PLUS_MODEL;
}

export function isImageGenModel(modelId) {
  return getModelConfig(modelId)?.isImageGen === true;
}

export function getModelConfig(modelId) {
  const normalized = normalizeModelId(modelId);
  return CHAT_MODELS.find((model) => model.id === normalized) || null;
}

export function getModelProvider(modelId) {
  return getModelConfig(modelId)?.provider || "";
}

export function isPrimaryChatModelId(modelId) {
  const normalized = normalizeModelId(modelId);
  return typeof normalized === "string" && PRIMARY_CHAT_MODEL_IDS.has(normalized);
}

export function getSelectableChatModels() {
  return PRIMARY_CHAT_MODELS;
}

export function getGroupedSelectableModels() {
  const models = getSelectableChatModels();
  const grouped = new Map();
  for (const provider of MODEL_GROUP_ORDER) {
    const items = models.filter((m) => m.provider === provider);
    if (items.length > 0) {
      grouped.set(provider, items);
    }
  }
  for (const m of models) {
    if (!MODEL_GROUP_ORDER.includes(m.provider)) {
      if (!grouped.has(m.provider)) grouped.set(m.provider, []);
      grouped.get(m.provider).push(m);
    }
  }
  return grouped;
}

export function isAgentBackedModelId(modelId) {
  const normalized = normalizeModelId(modelId);
  return Boolean(getModelConfig(normalized));
}

export function getDefaultThinkingLevel(modelId) {
  return DEFAULT_THINKING_LEVELS[normalizeModelId(modelId)];
}

export function normalizeChatRuntimeMode(mode) {
  return CHAT_RUNTIME_MODE_CHAT;
}

function getModelNativeInputs(modelId) {
  return getModelConfig(modelId)?.nativeInputs || ["text"];
}

function modelSupportsNativeInput(modelId, inputType) {
  const normalizedInput = typeof inputType === "string" ? inputType.trim() : "";
  if (!normalizedInput) return false;
  return getModelNativeInputs(modelId).includes(normalizedInput);
}

function getModelAvailableInputs(modelId) {
  const availableInputs = ["text"];

  if (modelSupportsNativeInput(modelId, "image")) {
    availableInputs.push("image");
  }

  if (modelSupportsNativeInput(modelId, "video")) {
    availableInputs.push("video");
  }

  if (modelSupportsNativeInput(modelId, "audio")) {
    availableInputs.push("audio");
  }

  if (modelSupportsNativeInput(modelId, "file")) {
    availableInputs.push("file");
  }

  return availableInputs;
}

export function modelSupportsAvailableInput(modelId, inputType) {
  const normalizedInput = typeof inputType === "string" ? inputType.trim() : "";
  if (!normalizedInput) return false;
  return getModelAvailableInputs(modelId).includes(normalizedInput);
}

export function getModelAttachmentSupport(modelId) {
  const supportsImages = modelSupportsAvailableInput(modelId, "image");
  const supportsDocuments = modelSupportsAvailableInput(modelId, "file");
  const supportsVideo = modelSupportsAvailableInput(modelId, "video");
  const supportsAudio = modelSupportsAvailableInput(modelId, "audio");

  return {
    supportsImages,
    supportsDocuments,
    supportsVideo,
    supportsAudio,
    supportsFilePicker: supportsImages || supportsDocuments || supportsVideo || supportsAudio,
  };
}

export function getDefaultMaxTokensForModel(modelId) {
  const normalized = normalizeModelId(modelId);
  if (typeof normalized !== "string" || !normalized) return 64000;
  if (normalized === QWEN_PLUS_MODEL) {
    return 65536;
  }
  return 64000;
}
