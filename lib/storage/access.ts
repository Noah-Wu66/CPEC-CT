import { normalizeFileId } from "@/lib/ai/shared/fileIds";
import {
  findStoredFilesByIdsForUser,
  toStoredFileDescriptor,
} from "@/lib/storage/repository";
import type { StoredFileDescriptor } from "@/lib/storage/types";

function collectMessageFileIds(messages: unknown[]) {
  const ids: string[] = [];
  for (const message of messages) {
    const parts = Array.isArray((message as { parts?: unknown[] })?.parts)
      ? (message as { parts: unknown[] }).parts
      : [];
    for (const part of parts) {
      const item = part as { inlineData?: { fileId?: unknown }; fileData?: { fileId?: unknown } };
      const imageId = normalizeFileId(item?.inlineData?.fileId);
      const documentId = normalizeFileId(item?.fileData?.fileId);
      if (imageId) ids.push(imageId);
      if (documentId) ids.push(documentId);
    }
  }
  return Array.from(new Set(ids));
}

export async function resolveStoredFileDescriptorsForUser(
  references: Array<{ fileId?: unknown }>,
  userId: string
) {
  const fileIds = references.map((item) => normalizeFileId(item?.fileId)).filter((item): item is string => Boolean(item));
  if (fileIds.length !== references.length) {
    throw new Error("文件编号无效");
  }
  const files = await findStoredFilesByIdsForUser(fileIds, userId);
  const fileMap = new Map(files.map((file) => [file._id.toString(), file]));
  if (fileMap.size !== new Set(fileIds).size) {
    throw new Error("文件不存在或无权访问");
  }
  return fileIds.map((fileId) => toStoredFileDescriptor(fileMap.get(fileId)!));
}

export async function resolveMessagesWithStoredFiles<T>(messages: T[], userId: string): Promise<T[]> {
  const fileIds = collectMessageFileIds(messages as unknown[]);
  if (fileIds.length === 0) return messages;
  const files = await findStoredFilesByIdsForUser(fileIds, userId);
  const descriptorMap = new Map<string, StoredFileDescriptor>(
    files.map((file) => [file._id.toString(), toStoredFileDescriptor(file)])
  );
  if (descriptorMap.size !== fileIds.length) {
    throw new Error("消息引用的文件不存在或无权访问");
  }

  return messages.map((message) => {
    const current = message as { parts?: unknown[] };
    if (!Array.isArray(current?.parts)) return message;
    return {
      ...current,
      parts: current.parts.map((part) => {
        const currentPart = part as {
          inlineData?: Record<string, unknown>;
          fileData?: Record<string, unknown>;
        };
        const nextPart = { ...currentPart };
        if (currentPart.inlineData) {
          const fileId = normalizeFileId(currentPart.inlineData.fileId);
          const descriptor = fileId ? descriptorMap.get(fileId) : null;
          if (!descriptor || descriptor.category !== "image") {
            throw new Error("消息引用的图片不存在或无权访问");
          }
          nextPart.inlineData = {
            fileId: descriptor.fileId,
            url: descriptor.url,
            mimeType: descriptor.mimeType,
          };
        }
        if (currentPart.fileData) {
          const fileId = normalizeFileId(currentPart.fileData.fileId);
          const descriptor = fileId ? descriptorMap.get(fileId) : null;
          if (!descriptor || !["video", "text", "code", "document", "spreadsheet", "data"].includes(descriptor.category)) {
            throw new Error("消息引用的附件不存在或无权访问");
          }
          nextPart.fileData = { ...descriptor };
        }
        return nextPart;
      }),
    } as T;
  });
}

export async function assertUserOwnsStoredFileReferences(messages: unknown[], userId: string) {
  await resolveMessagesWithStoredFiles(messages, userId);
}
