import {
  isNonEmptyString,
  getStoredPartsFromMessage,
} from "@/app/api/ai/chat/utils";
import { toAbsoluteFileUrl } from "@/lib/ai/shared/fileUrls";
import { buildAttachmentTextBlock } from "@/lib/ai/server/files/service";
import { getAttachmentInputType } from "@/lib/ai/shared/attachments";

async function storedPartToOpenAIContentPart(part, role, options = {}) {
  if (!part || typeof part !== "object") return null;

  const isAssistant = role === "assistant";

  if (isNonEmptyString(part.text)) {
    return { type: "text", text: part.text };
  }

  if (isAssistant) {
    return null;
  }

  const imageUrl = part?.inlineData?.url;
  if (isNonEmptyString(imageUrl)) {
    const providerImageUrl = toAbsoluteFileUrl(imageUrl, options.publicOrigin);
    if (!providerImageUrl) throw new Error("图片地址无效");
    return {
      type: "image_url",
      image_url: { url: providerImageUrl },
    };
  }

  const fileUrl = part?.fileData?.url;
  if (isNonEmptyString(fileUrl)) {
    const inputType = getAttachmentInputType(part?.fileData?.category);
    if (inputType === "video") {
      const providerVideoUrl = toAbsoluteFileUrl(fileUrl, options.publicOrigin);
      if (!providerVideoUrl) throw new Error("视频地址无效");
      return {
        type: "video_url",
        video_url: { url: providerVideoUrl },
      };
    }
    if (inputType === "file") {
      const fileTextMap = options?.fileTextMap instanceof Map ? options.fileTextMap : new Map();
      const prepared = fileTextMap.get(fileUrl);
      const extractedText = prepared?.structuredText || prepared?.extractedText || "";
      if (isNonEmptyString(extractedText)) {
        return {
          type: "text",
          text: buildAttachmentTextBlock(prepared.file || part.fileData, extractedText),
        };
      }
    }
  }

  return null;
}

function normalizeOpenAIMessageContent(contentParts) {
  if (!Array.isArray(contentParts) || contentParts.length === 0) return "";
  return contentParts;
}

export async function buildChatMessagesFromHistory(messages, options = {}) {
  const result = [];
  for (const msg of messages) {
    if (msg?.role !== "user" && msg?.role !== "model") continue;

    const role = msg.role === "model" ? "assistant" : "user";

    if (role === "assistant" && isNonEmptyString(msg?.content)) {
      result.push({
        role,
        content: msg.content,
      });
      continue;
    }

    const storedParts = getStoredPartsFromMessage(msg);
    if (!storedParts || storedParts.length === 0) continue;

    const contentParts = [];
    for (const storedPart of storedParts) {
      const part = await storedPartToOpenAIContentPart(storedPart, role, options);
      if (part) contentParts.push(part);
    }
    if (contentParts.length === 0) continue;

    result.push({ role, content: normalizeOpenAIMessageContent(contentParts) });
  }
  return result;
}

export async function buildCurrentUserMessage({ prompt, images, attachments, fileTextMap, publicOrigin }) {
  const content = [];
  if (isNonEmptyString(prompt)) {
    content.push({ type: "text", text: prompt });
  }

  if (Array.isArray(images)) {
    for (const img of images) {
      if (!img?.url) continue;
      const providerImageUrl = toAbsoluteFileUrl(img.url, publicOrigin);
      if (!providerImageUrl) throw new Error("图片地址无效");
      content.push({
        type: "image_url",
        image_url: { url: providerImageUrl },
      });
    }
  }

  if (Array.isArray(attachments)) {
    const map = fileTextMap instanceof Map ? fileTextMap : new Map();
    for (const attachment of attachments) {
      const inputType = getAttachmentInputType(attachment?.category);
      if (inputType === "video") {
        const providerVideoUrl = toAbsoluteFileUrl(attachment?.url, publicOrigin);
        if (!providerVideoUrl) throw new Error("视频地址无效");
        content.push({
          type: "video_url",
          video_url: { url: providerVideoUrl },
        });
        continue;
      }
      if (inputType !== "file") continue;
      const prepared = map.get(attachment.url);
      const extractedText = prepared?.structuredText || prepared?.extractedText || "";
      if (!isNonEmptyString(extractedText)) continue;
      content.push({
        type: "text",
        text: buildAttachmentTextBlock(prepared.file || attachment, extractedText),
      });
    }
  }

  return content;
}

export function normalizeOpenAIMessageContentParts(contentParts) {
  return normalizeOpenAIMessageContent(contentParts);
}
