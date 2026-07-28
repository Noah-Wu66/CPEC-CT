import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/audio/auth/session";
import { editAndStoreImage } from "@/lib/media/server/bailian/images";
import {
  IMAGE_EDIT_ACCEPTED_MIME_TYPES,
  IMAGE_EDIT_MAX_BYTES,
  IMAGE_EDIT_MAX_IMAGES,
  IMAGE_PROMPT_MAX_LENGTH,
  IMAGE_SIZE_OPTIONS,
  type ImageSize,
} from "@/lib/media/shared/models";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";

const ALLOWED_SIZES = new Set<string>(IMAGE_SIZE_OPTIONS.map((item) => item.id));
const ALLOWED_MIME_TYPES = new Set<string>(IMAGE_EDIT_ACCEPTED_MIME_TYPES);

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
    }

    const formData = await request.formData();
    const prompt = String(formData.get("prompt") || "").trim();
    const size = String(formData.get("size") || "2048*2048");
    const imageEntries = formData.getAll("images");

    if (!prompt) {
      return NextResponse.json({ success: false, message: "请输入图片描述" }, { status: 400 });
    }

    if (prompt.length > IMAGE_PROMPT_MAX_LENGTH) {
      return NextResponse.json(
        { success: false, message: `描述最多支持 ${IMAGE_PROMPT_MAX_LENGTH} 个字符` },
        { status: 400 }
      );
    }

    if (!ALLOWED_SIZES.has(size)) {
      return NextResponse.json({ success: false, message: "不支持的图片尺寸" }, { status: 400 });
    }

    if (imageEntries.length === 0 || imageEntries.some((entry) => !(entry instanceof File))) {
      return NextResponse.json({ success: false, message: "请上传 1–3 张参考图片" }, { status: 400 });
    }

    if (imageEntries.length > IMAGE_EDIT_MAX_IMAGES) {
      return NextResponse.json(
        { success: false, message: `参考图片最多支持 ${IMAGE_EDIT_MAX_IMAGES} 张` },
        { status: 400 }
      );
    }

    const images = imageEntries as File[];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      if (!ALLOWED_MIME_TYPES.has(image.type)) {
        return NextResponse.json(
          { success: false, message: `第 ${index + 1} 张参考图片格式不支持` },
          { status: 400 }
        );
      }

      if (image.size <= 0 || image.size > IMAGE_EDIT_MAX_BYTES) {
        return NextResponse.json(
          { success: false, message: `第 ${index + 1} 张参考图片大小不能超过 10MB` },
          { status: 400 }
        );
      }
    }

    const imageUrl = await editAndStoreImage({
      userId: session.userId,
      prompt,
      images,
      size: size as ImageSize,
      signal: request.signal,
    });

    return NextResponse.json({ success: true, imageUrl });
  } catch (error) {
    logError("media.image", "edit image", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "图片编辑失败" },
      { status: 500 }
    );
  }
}
