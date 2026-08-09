import crypto from "node:crypto";
import path from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, mkdir, readFile, rename, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ObjectId } from "mongodb";
import { matchesFileSignature } from "@/lib/storage/file-types";
import { StorageError } from "@/lib/storage/errors";
import { VOLUME_ROOT } from "@/lib/storage/paths";
import {
  deleteStoredFileRecord,
  findStoredFileByIdForUser,
  insertStoredFile,
  toStoredFileDescriptor,
} from "@/lib/storage/repository";
import type { StoredFileDescriptor, StorageScope } from "@/lib/storage/types";

const HEADER_BYTES = 8192;

type ByteStream = ReadableStream<Uint8Array> | NodeJS.ReadableStream;

interface SaveStoredFileInput {
  userId: string;
  stream: ByteStream;
  originalName: string;
  mimeType: string;
  extension: string;
  category: string;
  scope: StorageScope;
  maxBytes: number;
  expectedSize?: number;
  signal?: AbortSignal;
}

function cleanOriginalName(value: string) {
  const base = path.basename(String(value || "file")).trim();
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
  return cleaned || "file";
}

function cleanExtension(value: string) {
  const extension = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!extension || extension.length > 16) {
    throw new StorageError("文件扩展名无效", "INVALID_EXTENSION", 422);
  }
  return extension;
}

export function resolveStoragePath(relativePath: string) {
  const root = path.resolve(VOLUME_ROOT);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new StorageError("文件路径无效", "INVALID_STORAGE_PATH", 500);
  }
  return resolved;
}

async function removeIfExists(filePath: string) {
  await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error?.code !== "ENOENT") throw error;
  });
}

function toNodeReadable(stream: ByteStream) {
  if (stream instanceof Readable) return stream;
  if ("getReader" in stream) {
    const webStream = stream as ReadableStream<Uint8Array>;
    return Readable.from((async function* readWebStream() {
      const reader = webStream.getReader();
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          yield Buffer.from(result.value);
        }
      } finally {
        reader.releaseLock();
      }
    })());
  }
  return stream as NodeJS.ReadableStream;
}

export async function ensureStorageReady() {
  const root = path.resolve(VOLUME_ROOT);
  const incoming = path.join(root, ".incoming");
  const objects = path.join(root, "objects");

  await mkdir(root, { recursive: true, mode: 0o700 });
  await Promise.all([
    mkdir(incoming, { recursive: true, mode: 0o700 }),
    mkdir(objects, { recursive: true, mode: 0o700 }),
  ]);
  await Promise.all([
    chmod(root, 0o700),
    chmod(incoming, 0o700),
    chmod(objects, 0o700),
  ]);
  await access(root, constants.R_OK | constants.W_OK);
}

export async function saveStoredFile(input: SaveStoredFileInput): Promise<StoredFileDescriptor> {
  await ensureStorageReady();

  const originalName = cleanOriginalName(input.originalName);
  const extension = cleanExtension(input.extension);
  const publicId = crypto.randomBytes(24).toString("base64url");
  const relativePath = path.posix.join("objects", input.userId, input.scope, `${publicId}.${extension}`);
  const finalPath = resolveStoragePath(relativePath);
  const temporaryPath = resolveStoragePath(path.posix.join(".incoming", `${crypto.randomUUID()}.part`));
  await mkdir(path.dirname(finalPath), { recursive: true });

  let size = 0;
  const sha256 = crypto.createHash("sha256");
  const headerChunks: Buffer[] = [];
  let capturedHeaderBytes = 0;
  const inspector = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > input.maxBytes) {
        callback(new StorageError("文件大小超过系统限制", "FILE_TOO_LARGE", 413));
        return;
      }
      sha256.update(buffer);
      if (capturedHeaderBytes < HEADER_BYTES) {
        const slice = buffer.subarray(0, HEADER_BYTES - capturedHeaderBytes);
        headerChunks.push(slice);
        capturedHeaderBytes += slice.length;
      }
      callback(null, buffer);
    },
  });

  try {
    await pipeline(
      toNodeReadable(input.stream),
      inspector,
      createWriteStream(temporaryPath, { flags: "wx" }),
      input.signal ? { signal: input.signal } : {}
    );

    if (size <= 0) {
      throw new StorageError("文件内容为空", "EMPTY_FILE", 422);
    }
    if (Number.isFinite(input.expectedSize) && input.expectedSize !== size) {
      throw new StorageError("文件上传不完整", "INCOMPLETE_UPLOAD", 400);
    }
    if (!matchesFileSignature(extension, Buffer.concat(headerChunks))) {
      throw new StorageError("文件内容与扩展名不匹配", "INVALID_FILE_SIGNATURE", 422);
    }

    await rename(temporaryPath, finalPath);
  } catch (error) {
    await removeIfExists(temporaryPath);
    throw error;
  }

  try {
    const file = await insertStoredFile({
      publicId,
      userId: new ObjectId(input.userId),
      relativePath,
      originalName,
      mimeType: input.mimeType,
      extension,
      category: input.category,
      scope: input.scope,
      size,
      sha256: sha256.digest("hex"),
      parseStatus: ["text", "code", "document", "spreadsheet", "data"].includes(input.category)
        ? "pending"
        : "ready",
    });
    return toStoredFileDescriptor(file);
  } catch (error) {
    await removeIfExists(finalPath);
    throw error;
  }
}

export function saveStoredBuffer(input: Omit<SaveStoredFileInput, "stream" | "expectedSize"> & { buffer: Buffer }) {
  return saveStoredFile({
    ...input,
    stream: Readable.from(input.buffer),
    expectedSize: input.buffer.length,
  });
}

export async function saveStoredResponse(
  response: Response,
  input: Omit<SaveStoredFileInput, "stream" | "expectedSize">
) {
  if (!response.ok || !response.body) {
    throw new StorageError(`远程文件下载失败（${response.status}）`, "REMOTE_DOWNLOAD_FAILED", 502);
  }
  const contentLengthHeader = response.headers.get("content-length");
  const expectedSizeHeader = contentLengthHeader === null ? undefined : Number(contentLengthHeader);
  return saveStoredFile({
    ...input,
    stream: response.body,
    mimeType: input.mimeType,
    expectedSize: Number.isFinite(expectedSizeHeader) && Number(expectedSizeHeader) >= 0
      ? Number(expectedSizeHeader)
      : undefined,
  });
}

export async function getStoredFilePathForUser(fileId: string, userId: string) {
  const file = await findStoredFileByIdForUser(fileId, userId);
  if (!file) {
    throw new StorageError("文件不存在或无权访问", "FILE_NOT_FOUND", 404);
  }
  return { file, absolutePath: resolveStoragePath(file.relativePath) };
}

export async function readStoredFileBufferForUser(fileId: string, userId: string, maxBytes: number) {
  const resolved = await getStoredFilePathForUser(fileId, userId);
  if (resolved.file.size > maxBytes) {
    throw new StorageError("文件大小超过处理限制", "FILE_TOO_LARGE", 413);
  }
  return { file: resolved.file, buffer: await readFile(resolved.absolutePath) };
}

export function createStoredFileReadStream(relativePath: string, options?: { start?: number; end?: number }) {
  return createReadStream(resolveStoragePath(relativePath), options);
}

export async function deleteStoredFile(fileId: string, userId: string) {
  const file = await findStoredFileByIdForUser(fileId, userId);
  if (!file) return false;

  // 先删除 Volume 中的正文，再删除 MongoDB 元数据。这样即使物理删除失败，
  // 元数据仍可用于下一次幂等重试，不会留下无法定位的 Volume 孤儿文件。
  await removeIfExists(resolveStoragePath(file.relativePath));
  return Boolean(await deleteStoredFileRecord(fileId, userId));
}
