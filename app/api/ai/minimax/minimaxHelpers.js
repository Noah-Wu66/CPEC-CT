import {
  fetchImageAsBase64,
  isNonEmptyString,
  getStoredPartsFromMessage,
} from "@/app/api/ai/chat/utils";
import { buildAttachmentTextBlock } from "@/lib/ai/server/files/service";
import { getAttachmentInputType } from "@/lib/ai/shared/attachments";

// 将一条存储的消息片段转换为 MiniMax chat-completions 的 content 片段。
// 用户消息支持 text + image_url；附件文档转为文本块；助手历史只保留文本。
async function storedPartToMinimaxPart(part, role, options = {}) {
  if (!part || typeof part !== "object") return null;

  const isAssistant = role === "assistant" || role === "model";

  if (isNonEmptyString(part.text)) {
    return { type: "text", text: part.text };
  }

  if (isAssistant) {
    return null;
  }

  const url = part?.inlineData?.url;
  if (isNonEmptyString(url)) {
    const { base64Data } = await fetchImageAsBase64(url);
    const mimeType = part.inlineData?.mimeType || "image/jpeg";
    return {
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${base64Data}` },
    };
  }

  const fileUrl = part?.fileData?.url;
  if (isNonEmptyString(fileUrl)) {
    const inputType = getAttachmentInputType(part?.fileData?.category);
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

// 把存储的对话历史转换为 MiniMax messages 数组。
export async function buildMinimaxMessagesFromHistory(messages, options = {}) {
  const result = [];
  for (const msg of messages) {
    if (msg?.role !== "user" && msg?.role !== "model") continue;

    const role = msg.role === "model" ? "assistant" : "user";

    // 助手历史优先复用纯文本，避免重复携带图片造成上下文膨胀。
    if (role === "assistant" && isNonEmptyString(msg?.content)) {
      result.push({ role: "assistant", content: msg.content });
      continue;
    }

    const storedParts = getStoredPartsFromMessage(msg);
    if (!storedParts || storedParts.length === 0) continue;

    const content = [];
    for (const storedPart of storedParts) {
      const p = await storedPartToMinimaxPart(storedPart, role, options);
      if (p) content.push(p);
    }
    if (content.length === 0) continue;

    // 纯文本消息可直接用 string，减少体积；含图片则用片段数组。
    const onlyText = content.every((c) => c.type === "text");
    if (onlyText) {
      result.push({ role, content: content.map((c) => c.text).join("\n\n") });
    } else {
      result.push({ role, content });
    }
  }
  return result;
}

export async function buildCurrentUserMessage({ prompt, images, attachments, fileTextMap }) {
  const content = [];
  if (isNonEmptyString(prompt)) {
    content.push({ type: "text", text: prompt });
  }

  if (Array.isArray(images)) {
    for (const img of images) {
      if (!img?.url) continue;
      const { base64Data, mimeType } = await fetchImageAsBase64(img.url);
      content.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64Data}` },
      });
    }
  }

  if (Array.isArray(attachments)) {
    const map = fileTextMap instanceof Map ? fileTextMap : new Map();
    for (const attachment of attachments) {
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
