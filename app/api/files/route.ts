import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/audio/auth/session";
import { getClientIP, rateLimit } from "@/lib/ai/rateLimit";
import {
  getAllowedMimeTypesForExtension,
  getAttachmentCategory,
  getAttachmentInputType,
  getFileExtension,
  isMimeAllowedForExtension,
  isSupportedUploadExtension,
  normalizeMimeType,
} from "@/lib/ai/shared/attachments";
import { getModelAttachmentSupport } from "@/lib/ai/shared/models";
import { isStorageError } from "@/lib/storage/errors";
import { saveStoredFile } from "@/lib/storage/server";
import type { StorageScope } from "@/lib/storage/types";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_RATE_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };
const CLIENT_SCOPES = new Set<StorageScope>(["chat", "avatar", "audio-source", "voice"]);

function problem(detail: string, status: number, code: string, requestId: string, headers?: HeadersInit) {
  return NextResponse.json(
    {
      type: `https://cpec-ct.invalid/errors/${code.toLowerCase()}`,
      title: code,
      status,
      detail,
      requestId,
    },
    { status, headers: { "X-Request-Id": requestId, ...headers } }
  );
}

function readOriginalName(request: NextRequest) {
  const encoded = request.headers.get("x-file-name") || "";
  try {
    return decodeURIComponent(encoded).trim();
  } catch {
    return "";
  }
}

function canonicalMimeType(extension: string, declaredMimeType: string) {
  if (declaredMimeType && declaredMimeType !== "application/octet-stream") return declaredMimeType;
  return getAllowedMimeTypesForExtension(extension).find((value) => value !== "application/octet-stream") || "application/octet-stream";
}

function validateScope(scope: StorageScope, category: string) {
  if (scope === "avatar" && category !== "image") return "头像仅支持图片文件";
  if ((scope === "voice" || scope === "audio-source") && category !== "audio") return "仅支持音频文件";
  return "";
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const session = await getSession(request);
  if (!session) return problem("未登录或登录已失效", 401, "UNAUTHORIZED", requestId);

  const clientIP = getClientIP(request);
  const limitResult = rateLimit(`files:${session.userId}:${clientIP}`, UPLOAD_RATE_LIMIT);
  if (!limitResult.success) {
    const retryAfter = Math.max(1, Math.ceil((limitResult.resetTime - Date.now()) / 1000));
    return problem("上传过于频繁，请稍后再试", 429, "RATE_LIMITED", requestId, {
      "Retry-After": String(retryAfter),
      "X-RateLimit-Remaining": "0",
    });
  }

  const originalName = readOriginalName(request);
  const extension = getFileExtension(originalName);
  const declaredMimeType = normalizeMimeType(request.headers.get("content-type"));
  const scope = request.headers.get("x-file-scope") as StorageScope;

  if (!request.body) return problem("文件内容为空", 400, "EMPTY_BODY", requestId);
  if (!originalName || originalName.length > 200) return problem("文件名无效", 422, "INVALID_FILE_NAME", requestId);
  if (!extension || !isSupportedUploadExtension(extension)) return problem("不支持该文件类型", 422, "UNSUPPORTED_FILE", requestId);
  if (!CLIENT_SCOPES.has(scope)) return problem("文件用途无效", 422, "INVALID_SCOPE", requestId);
  if (
    declaredMimeType
    && declaredMimeType !== "application/octet-stream"
    && !isMimeAllowedForExtension(extension, declaredMimeType)
  ) {
    return problem("文件类型与扩展名不匹配", 422, "MIME_MISMATCH", requestId);
  }

  const mimeType = canonicalMimeType(extension, declaredMimeType);
  const category = getAttachmentCategory({ extension, mimeType });
  if (!category) return problem("不支持该文件类型", 422, "UNSUPPORTED_FILE", requestId);
  const scopeError = validateScope(scope, category);
  if (scopeError) return problem(scopeError, 422, "INVALID_SCOPE_FILE", requestId);

  if (scope === "chat") {
    const model = request.headers.get("x-file-model")?.trim() || "";
    const support = getModelAttachmentSupport(model);
    const inputType = getAttachmentInputType(category);
    const supported = (
      (inputType === "image" && support.supportsImages)
      || (inputType === "video" && support.supportsVideo)
      || (inputType === "audio" && support.supportsAudio)
      || (inputType === "file" && support.supportsDocuments)
    );
    if (!supported) return problem("当前模式不支持这类文件", 422, "MODEL_FILE_UNSUPPORTED", requestId);
  }

  const maxBytes = scope === "audio-source"
    ? 500 * 1024 * 1024
    : scope === "voice"
      ? 10 * 1024 * 1024
      : 20 * 1024 * 1024;
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader === null ? undefined : Number(contentLengthHeader);
  if (Number.isFinite(contentLength) && Number(contentLength) > maxBytes) {
    return problem("文件大小超过系统限制", 413, "FILE_TOO_LARGE", requestId);
  }

  try {
    const file = await saveStoredFile({
      userId: session.userId,
      stream: request.body,
      originalName,
      mimeType,
      extension,
      category,
      scope,
      maxBytes,
      expectedSize: Number.isFinite(contentLength) && Number(contentLength) >= 0
        ? Number(contentLength)
        : undefined,
      signal: request.signal,
    });
    return NextResponse.json(
      { file },
      {
        status: 201,
        headers: {
          Location: file.url,
          "X-Request-Id": requestId,
          "X-RateLimit-Remaining": String(limitResult.remaining),
        },
      }
    );
  } catch (error) {
    if (!isStorageError(error)) logError("files.upload", "store file", error, { requestId });
    const status = isStorageError(error) ? error.status : 500;
    const code = isStorageError(error) ? error.code : "STORAGE_FAILURE";
    const detail = isStorageError(error) ? error.message : "文件保存失败";
    return problem(detail, status, code, requestId);
  }
}
