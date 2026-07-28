import type {
  ImageSize,
  VideoAspectRatio,
  VideoDuration,
  VideoResolution,
} from "@/lib/media/shared/models";

async function readJson(response: Response) {
  return response.json();
}

const VIDEO_POLL_INTERVAL_MS = 15_000;
const VIDEO_MAX_POLL_ATTEMPTS = 40;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function pollVideoGeneration(taskId: string) {
  for (let attempt = 0; attempt < VIDEO_MAX_POLL_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await sleep(VIDEO_POLL_INTERVAL_MS);
    }

    const response = await fetch("/api/media/video/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(data.message || "视频生成失败");
    }

    if (data.videoUrl) {
      return String(data.videoUrl);
    }
  }

  throw new Error("视频生成超时，请稍后再试");
}

export async function generateImage(input: {
  prompt: string;
  size: ImageSize;
}) {
  const response = await fetch("/api/media/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.message || "图片生成失败");
  }
  if (!data.imageUrl) {
    throw new Error("图片生成完成，但没有返回结果");
  }
  return String(data.imageUrl);
}

export async function editImage(input: {
  prompt: string;
  size: ImageSize;
  images: File[];
}) {
  const formData = new FormData();
  formData.append("prompt", input.prompt);
  formData.append("size", input.size);
  for (const image of input.images) {
    formData.append("images", image);
  }

  const response = await fetch("/api/media/image/edit", {
    method: "POST",
    body: formData,
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.message || "图片编辑失败");
  }
  if (!data.imageUrl) {
    throw new Error("图片编辑完成，但没有返回结果");
  }
  return String(data.imageUrl);
}

export async function generateVideo(input: {
  prompt: string;
  aspectRatio: VideoAspectRatio;
  durationSeconds: VideoDuration;
  resolution: VideoResolution;
  image?: File | null;
}) {
  const formData = new FormData();
  formData.append("prompt", input.prompt);
  if (!input.image) formData.append("aspectRatio", input.aspectRatio);
  formData.append("durationSeconds", String(input.durationSeconds));
  formData.append("resolution", input.resolution);
  if (input.image) formData.append("image", input.image);

  const response = await fetch("/api/media/video", {
    method: "POST",
    body: formData,
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.message || "视频生成失败");
  }
  if (data.videoUrl) {
    return String(data.videoUrl);
  }

  const taskId = typeof data.taskId === "string" ? data.taskId.trim() : "";
  if (!taskId) {
    throw new Error("视频任务提交完成，但没有返回任务编号");
  }

  return pollVideoGeneration(taskId);
}
