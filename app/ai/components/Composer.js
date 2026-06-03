"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  FileText,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import { useToast } from "./ToastProvider";
import ModelSelector from "./ModelSelector";
import SettingsMenu from "./SettingsMenu";
import {
  getModelAttachmentSupport,
  isImageGenModel,
} from "@/lib/ai/shared/models";
import {
  getAttachmentInputType,
  getAttachmentAcceptForModel,
  getAttachmentLimits,
  IMAGE_MIME_TYPES,
  MAX_CHAT_ATTACHMENTS,
} from "@/lib/ai/shared/attachments";
import { createLocalAttachment, isImageAttachment } from "@/lib/ai/shared/messageAttachments";

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result || null);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MIN_TEXTAREA_HEIGHT = 24;
const MAX_TEXTAREA_HEIGHT = 220;

function resizeTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  const nextHeight = Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT);
  el.style.height = `${nextHeight}px`;
  el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
}

export default function Composer({
  loading,
  isStreaming,
  isWaitingForAI,
  model,
  modelReady,
  onModelChange,
  messages,
  webSearch,
  setWebSearch,
  chatSystemPrompt,
  onChatSystemPromptSave,
  systemPrompts,
  addSystemPrompt,
  updateSystemPrompt,
  deleteSystemPrompt,
  onSend,
  onStop,
}) {
  const toast = useToast();
  const [input, setInput] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState([]);
  const [isMainInputFocused, setIsMainInputFocused] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const mountedRef = useRef(true);
  const {
    supportsImages,
    supportsDocuments,
    supportsVideo,
    supportsAudio,
    supportsFilePicker,
  } = getModelAttachmentSupport(model);
  const attachmentAccept = getAttachmentAcceptForModel({
    supportsDocuments,
    supportsImages,
    supportsVideo,
    supportsAudio,
  });
  const isImageModel = isImageGenModel(model);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const setAppHeight = () => {
      const vv = window.visualViewport;
      if (isMainInputFocused) {
        document.documentElement.style.setProperty("--app-height", `${Math.round(vv?.height)}px`);
        document.documentElement.style.setProperty("--app-offset-top", `${Math.round(vv?.offsetTop)}px`);
      } else {
        document.documentElement.style.setProperty("--app-height", "100dvh");
        document.documentElement.style.setProperty("--app-offset-top", "0px");
      }
    };
    setAppHeight();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", setAppHeight);
    vv?.addEventListener("scroll", setAppHeight);
    window.addEventListener("resize", setAppHeight);
    return () => {
      vv?.removeEventListener("resize", setAppHeight);
      vv?.removeEventListener("scroll", setAppHeight);
      window.removeEventListener("resize", setAppHeight);
    };
  }, [isMainInputFocused]);

  useEffect(() => {
    const el = textareaRef.current;
    resizeTextarea(el);
  }, [input, model]);

  useEffect(() => {
    if (!supportsFilePicker) {
      if (selectedAttachments.length > 0) {
        setTimeout(() => setSelectedAttachments([]), 0);
      }
      return;
    }
    const next = selectedAttachments.filter((item) => {
      const inputType = getAttachmentInputType(item.category);
      if (inputType === "image") return supportsImages;
      if (inputType === "video") return supportsVideo;
      if (inputType === "audio") return supportsAudio;
      if (inputType === "file") return supportsDocuments;
      return false;
    });
    if (next.length !== selectedAttachments.length) {
      setTimeout(() => setSelectedAttachments(next), 0);
    }
  }, [selectedAttachments, supportsAudio, supportsDocuments, supportsFilePicker, supportsImages, supportsVideo]);

  const convertToPng = (file) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const baseName = file.name.replace(/\.[^.]+$/, "");
              const newFile = new File([blob], `${baseName}.png`, { type: "image/png" });
              resolve(newFile);
            } else {
              resolve(null);
            }
          },
          "image/png",
          1.0
        );
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  };

  const processFiles = async (files) => {
    if (!supportsFilePicker) return;
    if (!files.length) return;

    const remainingSlots = MAX_CHAT_ATTACHMENTS - selectedAttachments.length;
    const filesToAdd = files.slice(0, remainingSlots);
    const nextAttachments = [];
    const blockedUnsupported = [];
    const invalidFiles = [];
    const oversizedFiles = [];

    if (files.length > remainingSlots) {
      toast.warning(`一次最多添加 ${MAX_CHAT_ATTACHMENTS} 个文件，超出的已跳过`);
    }

    for (const file of filesToAdd) {
      const local = createLocalAttachment({ file });
      if (!local.category) {
        invalidFiles.push(file.name);
        continue;
      }

      const limits = getAttachmentLimits(local.category);
      if (limits?.maxBytes && file.size > limits.maxBytes) {
        oversizedFiles.push(file.name);
        continue;
      }

      const inputType = getAttachmentInputType(local.category);
      const isSupported = (
        (inputType === "image" && supportsImages)
        || (inputType === "video" && supportsVideo)
        || (inputType === "audio" && supportsAudio)
        || (inputType === "file" && supportsDocuments)
      );

      if (!isSupported) {
        blockedUnsupported.push(file.name);
        continue;
      }

      if (isImageAttachment(local)) {
        let processedFile = file;
        if (!IMAGE_MIME_TYPES.includes(file.type)) {
          const converted = await convertToPng(file);
          if (!converted) {
            invalidFiles.push(file.name);
            continue;
          }
          processedFile = converted;
        }
        const preview = await readAsDataUrl(processedFile).catch(() => null);
        nextAttachments.push({
          ...createLocalAttachment({ file: processedFile, preview }),
          uploadStatus: "uploading",
          blobUrl: null,
        });
      } else {
        const att = { ...local, uploadStatus: "uploading", blobUrl: null };
        nextAttachments.push(att);
      }
    }

    if (oversizedFiles.length > 0) {
      toast.warning(`以下文件超过大小限制，已跳过：${oversizedFiles.join("、")}`);
    }
    if (invalidFiles.length > 0) {
      toast.warning(`以下文件类型不支持或读取失败，已跳过：${invalidFiles.join("、")}`);
    }
    if (blockedUnsupported.length > 0) {
      toast.warning("当前模型或当前模式不支持这类附件，已跳过");
    }

    if (nextAttachments.length > 0 && mountedRef.current) {
      setSelectedAttachments((prev) => [...prev, ...nextAttachments].slice(0, MAX_CHAT_ATTACHMENTS));

      for (const att of nextAttachments) {
        uploadAttachmentInBackground(att);
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    await processFiles(files);
  };

  const handlePaste = async (e) => {
    if (!supportsImages) return;
    const clipboardItems = Array.from(e.clipboardData?.items || []);
    if (!clipboardItems.length) return;

    const imageFiles = clipboardItems
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);

    if (!imageFiles.length) return;
    await processFiles(imageFiles);
  };

  const uploadAttachmentInBackground = async (att) => {
    try {
      const blob = await upload(att.file.name, att.file, {
        access: "public",
        handleUploadUrl: "/api/ai/upload",
        clientPayload: JSON.stringify({
          kind: "chat",
          model,
          originalName: att.file.name,
          declaredMimeType: att.file.type || att.mimeType,
        }),
      });
      if (!mountedRef.current) return;
      setSelectedAttachments((prev) =>
        prev.map((item) =>
          item.id === att.id ? { ...item, uploadStatus: "ready", blobUrl: blob.url } : item
        )
      );
    } catch (err) {
      if (!mountedRef.current) return;
      setSelectedAttachments((prev) =>
        prev.map((item) =>
          item.id === att.id ? { ...item, uploadStatus: "error" } : item
        )
      );
      toast.error(`「${att.name}」上传失败：${err?.message || "未知错误"}`);
    }
  };

  const removeAttachment = (attachmentId) => {
    setSelectedAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
  };

  const clearAllAttachments = () => {
    setSelectedAttachments([]);
  };

  const isUploading = selectedAttachments.some((item) => item.uploadStatus === "uploading");
  const sendDisabled = !isStreaming && !isWaitingForAI
    && (isUploading || (!input.trim() && selectedAttachments.length === 0));

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (!isMobile) {
        e.preventDefault();
        if (!loading && !isUploading) handleSend();
      }
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if ((!text && selectedAttachments.length === 0) || loading || isUploading) return;
    const validAttachments = selectedAttachments.filter((item) => item.uploadStatus === "ready");
    if (!text && validAttachments.length === 0) return;
    onSend({ text, attachments: validAttachments });
    setInput("");
    clearAllAttachments();
  };

  return (
    <div className="w-full">
      <AnimatePresence>
        {selectedAttachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
          >
            {selectedAttachments.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--ai-panel-border)] bg-[var(--oa-card-bg)] px-3.5 py-3"
              >
                {isImageAttachment(item) ? (
                  <div className="h-10 w-10 overflow-hidden rounded-[var(--radius-md)] border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)]">
                    {item.preview ? <img src={item.preview} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                ) : (
                  <div className="ai-primary-soft flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border">
                    <FileText size={16} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--text-primary)]">{item.name}</div>
                  <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {item.uploadStatus === "uploading" ? "上传中" : item.uploadStatus === "error" ? "上传失败" : "已就绪"}
                  </div>
                </div>
                <button
                  onClick={() => removeAttachment(item.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--ai-panel-muted)] hover:text-[var(--oa-red)]"
                  type="button"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--ai-panel-border)] bg-[var(--ai-shell-surface-strong)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ai-panel-border)] px-4 py-3 md:px-5">
          <ModelSelector
            model={model}
            onModelChange={onModelChange}
            ready={modelReady}
          />
          {!isImageModel && (
            <SettingsMenu
              model={model}
              ready={modelReady}
              webSearch={webSearch}
              setWebSearch={setWebSearch}
              chatSystemPrompt={chatSystemPrompt}
              onChatSystemPromptSave={onChatSystemPromptSave}
              systemPrompts={systemPrompts}
              addSystemPrompt={addSystemPrompt}
              updateSystemPrompt={updateSystemPrompt}
              deleteSystemPrompt={deleteSystemPrompt}
            />
          )}
        </div>

        <div className="px-4 py-3 md:px-5 md:py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--ai-panel-border)] bg-[var(--oa-card-bg)] px-3 py-3 md:px-4">
              {(selectedAttachments.length > 0 || isUploading) ? (
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedAttachments.length > 0 ? <span>已选 {selectedAttachments.length} 个附件</span> : null}
                    {isUploading ? <span>上传中</span> : null}
                  </div>
                  {selectedAttachments.length > 0 ? (
                    <button
                      onClick={clearAllAttachments}
                      className="ai-control-chip rounded-full px-3 py-1 text-[11px] font-bold"
                      type="button"
                    >
                      清空附件
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center gap-3">
                {supportsFilePicker ? (
                  <>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                      accept={attachmentAccept}
                      multiple
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={selectedAttachments.length >= MAX_CHAT_ATTACHMENTS}
                      className="ai-control-chip inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] disabled:opacity-40"
                      type="button"
                      title="上传附件"
                    >
                      <Paperclip size={16} />
                    </button>
                  </>
                ) : null}

                <div className="min-w-0 flex-1">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onFocus={() => setIsMainInputFocused(true)}
                    onBlur={() => setIsMainInputFocused(false)}
                    placeholder={isImageModel ? "描述你想生成的图片" : "输入内容"}
                    className="block min-h-6 w-full resize-none border-none bg-transparent py-0 text-[15px] leading-6 text-[var(--text-primary)] outline-none focus:ring-0 scrollbar-none"
                    rows={1}
                  />
                </div>
              </div>
            </div>

            <div className="flex shrink-0 self-center items-center">
              <button
                onClick={isStreaming || isWaitingForAI ? onStop : handleSend}
                disabled={sendDisabled}
                className={`flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] transition-colors active:scale-[0.96] ${
                  isStreaming || isWaitingForAI
                    ? "[background:var(--oa-danger-gradient)] text-[#fffaf0]"
                    : "ai-primary-action"
                } disabled:cursor-not-allowed disabled:border-[var(--oa-control-border)] disabled:bg-[var(--oa-paper-soft)] disabled:text-[var(--oa-muted)]`}
                type="button"
                aria-label={isStreaming || isWaitingForAI ? "停止生成" : "发送"}
              >
                {isStreaming || isWaitingForAI ? (
                  <Square size={16} fill="currentColor" />
                ) : (
                  <ArrowUp size={18} strokeWidth={2.6} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
