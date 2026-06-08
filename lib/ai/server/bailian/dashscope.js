import { resolveBailianDashScopeConfig } from "@/lib/ai/modelRoutes";

const TASK_SUCCESS_STATUSES = new Set(["SUCCEEDED", "SUCCESS", "COMPLETED"]);
const TASK_FAILED_STATUSES = new Set(["FAILED", "CANCELED", "UNKNOWN"]);
const TASK_RUNNING_STATUSES = new Set(["PENDING", "RUNNING", "SUSPENDED"]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfig() {
  return resolveBailianDashScopeConfig();
}

export function getDashScopeUrl(path) {
  const { dashScopeBaseUrl } = getConfig();
  return `${dashScopeBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * @param {string} path
 * @param {Record<string, any>} [options]
 */
export async function dashScopeRequest(path, { method = "POST", body, headers = {}, signal } = {}) {
  const { apiKey } = getConfig();
  const response = await fetch(getDashScopeUrl(path), {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok || data?.code || data?.error) {
    const message = data?.message || data?.error?.message || data?.code || `百炼请求失败（${response.status}）`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

export function getTaskId(payload) {
  return payload?.output?.task_id || payload?.task_id || payload?.data?.task_id || "";
}

export function getTaskStatus(payload) {
  return String(payload?.output?.task_status || payload?.task_status || payload?.status || "").toUpperCase();
}

/**
 * @param {string} taskId
 * @param {Record<string, any>} [options]
 */
export async function pollDashScopeTask(taskId, { signal, intervalMs = 2000, timeoutMs = 10 * 60 * 1000 } = {}) {
  const startedAt = Date.now();
  let lastPayload = null;

  while (Date.now() - startedAt < timeoutMs) {
    const payload = await dashScopeRequest(`/tasks/${encodeURIComponent(taskId)}`, {
      method: "GET",
      signal,
    });
    lastPayload = payload;
    const status = getTaskStatus(payload);

    if (TASK_SUCCESS_STATUSES.has(status)) {
      return payload;
    }
    if (TASK_FAILED_STATUSES.has(status)) {
      throw new Error(payload?.output?.message || payload?.message || "百炼任务执行失败");
    }
    if (!status || TASK_RUNNING_STATUSES.has(status)) {
      await wait(intervalMs);
      continue;
    }

    await wait(intervalMs);
  }

  const status = getTaskStatus(lastPayload);
  throw new Error(status ? `百炼任务处理超时：${status}` : "百炼任务处理超时");
}

export function extractFirstUrl(value) {
  if (!value) return "";
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractFirstUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    const direct = value.url || value.audio_url || value.image_url || value.file_url;
    if (typeof direct === "string" && /^https?:\/\//i.test(direct)) return direct;
    for (const item of Object.values(value)) {
      const found = extractFirstUrl(item);
      if (found) return found;
    }
  }
  return "";
}

export async function downloadRemoteFile(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`文件下载失败（${response.status}）`);
  }
  return {
    arrayBuffer: await response.arrayBuffer(),
    contentType: response.headers.get("content-type"),
  };
}
