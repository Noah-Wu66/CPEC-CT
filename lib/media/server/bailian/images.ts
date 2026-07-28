import { dashScopeRequest } from "@/lib/ai/server/bailian/dashscope";
import { IMAGE_MODEL, type ImageSize } from "@/lib/media/shared/models";
import { saveMediaFromUrl } from "@/lib/media/storage";

const IMAGE_GENERATION_PATH = "/services/aigc/multimodal-generation/generation";

async function fileToDataUrl(file: File) {
  const mimeType = file.type || "image/png";
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

function extractImageUrl(payload: Record<string, unknown>) {
  const output = typeof payload.output === "object" && payload.output
    ? payload.output as Record<string, unknown>
    : {} as Record<string, unknown>;
  const choices = Array.isArray(output.choices) ? output.choices : [];

  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as { message?: unknown }).message;
    if (!message || typeof message !== "object") continue;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const item of content) {
      if (item && typeof item === "object") {
        const image = (item as { image?: unknown }).image;
        if (typeof image === "string" && image.trim()) {
          return image.trim();
        }
      }
    }
  }

  throw new Error("图片处理完成，但没有返回可下载内容");
}

async function callQwenImage({
  userId,
  content,
  size,
  signal,
}: {
  userId: string;
  content: Array<Record<string, string>>;
  size: ImageSize;
  signal?: AbortSignal;
}) {
  const payload = await dashScopeRequest(IMAGE_GENERATION_PATH, {
    body: {
      model: IMAGE_MODEL,
      input: {
        messages: [{
          role: "user",
          content,
        }],
      },
      parameters: {
        n: 1,
        prompt_extend: true,
        watermark: false,
        size,
      },
    },
    signal,
  }) as Record<string, unknown>;

  const imageUrl = extractImageUrl(payload);
  const saved = await saveMediaFromUrl(userId, imageUrl, "image/png", "media-image", signal);
  return saved.url;
}

export async function generateAndStoreImage({
  userId,
  prompt,
  size = "2048*2048",
  signal,
}: {
  userId: string;
  prompt: string;
  size?: ImageSize;
  signal?: AbortSignal;
}) {
  return callQwenImage({
    userId,
    content: [{ text: prompt }],
    size,
    signal,
  });
}

export async function editAndStoreImage({
  userId,
  prompt,
  images,
  size = "2048*2048",
  signal,
}: {
  userId: string;
  prompt: string;
  images: File[];
  size?: ImageSize;
  signal?: AbortSignal;
}) {
  const imageContent = await Promise.all(
    images.map(async (image) => ({ image: await fileToDataUrl(image) }))
  );

  return callQwenImage({
    userId,
    content: [
      ...imageContent,
      { text: prompt },
    ],
    size,
    signal,
  });
}
