import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";

const MAX_PROMPT_NAME_LENGTH = 50;
const MAX_PROMPT_CONTENT_LENGTH = 10000;
const MAX_CHAT_SYSTEM_PROMPT_LENGTH = 10000;

function getSettingsCollection() {
  return getDb().then((db) => db.collection("ai_user_settings"));
}

function normalizePrompt(prompt) {
  return {
    _id: prompt?._id instanceof ObjectId ? prompt._id : new ObjectId(),
    name: String(prompt?.name || ""),
    content: String(prompt?.content || "")
  };
}

function serializeSettings(settings) {
  if (!settings) {
    return {
      systemPrompts: [],
      avatar: null,
      nickname: "",
      chatSystemPrompt: ""
    };
  }

  return {
    ...settings,
    systemPrompts: Array.isArray(settings.systemPrompts)
      ? settings.systemPrompts.map((prompt) => normalizePrompt(prompt))
      : [],
    avatar: settings.avatar ?? null,
    nickname: settings.nickname ?? "",
    chatSystemPrompt: settings.chatSystemPrompt ?? ""
  };
}

function validatePromptFields({ name, content }, { requirePromptId = false, promptId } = {}) {
  if (requirePromptId && !promptId) {
    throw new Error("promptId, name and content are required");
  }
  if (!name || !content) {
    throw new Error("Name and content are required");
  }
  if (typeof name !== "string" || name.length > MAX_PROMPT_NAME_LENGTH) {
    throw new Error(`Name must be a string and cannot exceed ${MAX_PROMPT_NAME_LENGTH} characters`);
  }
  if (typeof content !== "string" || content.length > MAX_PROMPT_CONTENT_LENGTH) {
    throw new Error(`Content must be a string and cannot exceed ${MAX_PROMPT_CONTENT_LENGTH} characters`);
  }
}

function validateAvatar(avatar) {
  if (avatar !== null && avatar !== undefined && typeof avatar !== "string") {
    throw new Error("avatar must be a string or null");
  }
}

function normalizeChatSystemPrompt(chatSystemPrompt) {
  if (chatSystemPrompt === undefined) {
    return undefined;
  }
  if (chatSystemPrompt === null) {
    return "";
  }
  if (typeof chatSystemPrompt !== "string") {
    throw new Error("chatSystemPrompt must be a string");
  }
  if (chatSystemPrompt.length > MAX_CHAT_SYSTEM_PROMPT_LENGTH) {
    throw new Error(`chatSystemPrompt cannot exceed ${MAX_CHAT_SYSTEM_PROMPT_LENGTH} characters`);
  }
  return chatSystemPrompt;
}

function normalizeNickname(nickname) {
  if (nickname === undefined) {
    return undefined;
  }
  if (nickname === null) {
    return "";
  }
  if (typeof nickname !== "string") {
    throw new Error("nickname must be a string");
  }
  if (nickname.length > 50) {
    throw new Error("nickname cannot exceed 50 characters");
  }
  return nickname;
}

export async function getUserSettings(userId) {
  const settings = await (await getSettingsCollection()).findOne({ userId: new ObjectId(userId) });
  return serializeSettings(settings);
}

async function ensureSettingsDocument(userId) {
  const collection = await getSettingsCollection();
  const normalizedUserId = new ObjectId(userId);
  const current = await collection.findOne({ userId: normalizedUserId });

  if (current) {
    return serializeSettings(current);
  }

  const settings = {
    _id: new ObjectId(),
    userId: normalizedUserId,
    systemPrompts: [],
    avatar: null,
    nickname: "",
    chatSystemPrompt: "",
    updatedAt: new Date()
  };

  await collection.insertOne(settings);
  return serializeSettings(settings);
}

async function saveSettings(userId, nextSettings) {
  const collection = await getSettingsCollection();
  const normalizedUserId = new ObjectId(userId);
  const settings = serializeSettings({
    ...nextSettings,
    userId: normalizedUserId,
    updatedAt: new Date()
  });

  await collection.replaceOne(
    { userId: normalizedUserId },
    settings,
    { upsert: true }
  );

  return settings;
}

export async function addUserPrompt(userId, { name, content }) {
  validatePromptFields({ name, content });
  const settings = await ensureSettingsDocument(userId);
  return saveSettings(userId, {
    ...settings,
    systemPrompts: [
      ...settings.systemPrompts,
      normalizePrompt({ name, content })
    ]
  });
}

export async function deleteUserPrompt(userId, promptId) {
  const settings = await ensureSettingsDocument(userId);
  const nextPrompts = settings.systemPrompts.filter((prompt) => String(prompt._id) !== promptId);

  if (nextPrompts.length === settings.systemPrompts.length) {
    throw new Error("Prompt not found");
  }

  return saveSettings(userId, {
    ...settings,
    systemPrompts: nextPrompts
  });
}

export async function updateUserProfileSettings(userId, { avatar, chatSystemPrompt, nickname } = {}) {
  const normalizedChatSystemPrompt = normalizeChatSystemPrompt(chatSystemPrompt);
  const normalizedNickname = normalizeNickname(nickname);
  if (avatar === undefined && normalizedChatSystemPrompt === undefined && normalizedNickname === undefined) {
    throw new Error("No settings to update");
  }

  const settings = await ensureSettingsDocument(userId);
  if (avatar !== undefined) {
    validateAvatar(avatar);
    settings.avatar = avatar;
  }
  if (normalizedChatSystemPrompt !== undefined) {
    settings.chatSystemPrompt = normalizedChatSystemPrompt;
  }
  if (normalizedNickname !== undefined) {
    settings.nickname = normalizedNickname;
  }

  return saveSettings(userId, settings);
}

export async function updateUserPrompt(userId, { promptId, name, content }) {
  validatePromptFields({ name, content }, { requirePromptId: true, promptId });
  const settings = await ensureSettingsDocument(userId);
  const promptIndex = settings.systemPrompts.findIndex((prompt) => String(prompt._id) === promptId);

  if (promptIndex < 0) {
    throw new Error("Prompt not found");
  }

  const nextPrompts = [...settings.systemPrompts];
  nextPrompts[promptIndex] = {
    ...nextPrompts[promptIndex],
    name: String(name),
    content: String(content)
  };

  return saveSettings(userId, {
    ...settings,
    systemPrompts: nextPrompts
  });
}
