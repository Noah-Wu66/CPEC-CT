"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Copy,
  Download,
  Edit3,
  Trash2,
} from "lucide-react";
import Markdown from "./Markdown";
import ThinkingBlock from "./ThinkingBlock";
import ImageLightbox from "./ImageLightbox";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./ToastProvider";
import { exportMessageContent } from "@/lib/ai/client/messageExport";
import {
  AttachmentCard,
  AIAvatar,
  ResponsiveAIAvatar,
  UserAvatar,
  buildCopyText,
  normalizeCopiedText,
  isSelectionFullyInsideElement,
  Thumb,
  Citations,
  LoadingSweepText,
  ToolRunCards,
  ArtifactCards,
} from "./MessageListHelpers";
import {
  CHAT_MODELS,
} from "@/lib/ai/shared/models";
import {
  getWebBrowsingToolTitle,
  isWebBrowsingIdentifier,
  normalizeWebBrowsingIdentifier,
} from "@/lib/ai/shared/webBrowsing";

const PENDING_RUN_TEXTS = new Set(["正在处理中..."]);

function containsMarkdownTable(text) {
  if (typeof text !== "string") return false;
  const normalized = text.replace(/\r\n/g, "\n");
  return /\|.*\|[\t ]*\n[\t ]*\|?[\t ]*:?-{3,}:?[\t ]*(\|[\t ]*:?-{3,}:?[\t ]*)+\|?/u.test(normalized);
}

function isPendingRunText(text) {
  return typeof text === "string" && PENDING_RUN_TEXTS.has(text.trim());
}

function normalizeFallbackToolTimeline(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return [];

  return tools
    .filter((tool) => tool && typeof tool === "object" && typeof tool.id === "string" && tool.id)
    .map((tool) => {
      const apiName = typeof tool.apiName === "string" ? tool.apiName : "";
      const status = tool.status === "error" ? "error" : "done";
      const resultCount = Array.isArray(tool.state?.results) ? tool.state.results.length : undefined;
      const toolIdentifier = normalizeWebBrowsingIdentifier(tool.identifier);

      if (apiName === "search") {
        return {
          id: `timeline_${tool.id}`,
          kind: "search",
          status,
          query: typeof tool.arguments?.query === "string" ? tool.arguments.query : "",
          resultCount,
          message: typeof tool.content === "string" ? tool.content : "",
        };
      }

      if (apiName === "crawlSinglePage" || apiName === "crawlMultiPages") {
        const firstUrl = typeof tool.arguments?.url === "string" && tool.arguments.url
          ? tool.arguments.url
          : (
            Array.isArray(tool.arguments?.urls)
              ? tool.arguments.urls.find((item) => typeof item === "string" && item.trim())
              : ""
          ) || "";

        return {
          id: `timeline_${tool.id}`,
          kind: "reader",
          status,
          url: firstUrl,
          resultCount,
          message: typeof tool.content === "string" ? tool.content : "",
        };
      }

      return {
        id: `timeline_${tool.id}`,
        kind: "tool",
        status,
        content: typeof tool.title === "string" && tool.title
          ? tool.title
          : (isWebBrowsingIdentifier(toolIdentifier) ? getWebBrowsingToolTitle(apiName) : `${toolIdentifier || "tool"}.${tool.apiName || "run"}`),
        message: typeof tool.content === "string" ? tool.content : "",
      };
    })
    .filter(Boolean);
}

export default function MessageList({
  messages,
  loading,
  chatEndRef,
  listRef,
  onScroll,
  editingMsgIndex,
  editingContent,
  fontSizeClass,
  model,
  onEditingContentChange,
  onCancelEdit,
  onSubmitEdit,
  onCopy,
  onDeleteModelMessage,
  onDeleteUserMessage,
  onStartEdit,
  userNickname,
}) {
  const editTextareaRef = useRef(null);
  const exportMenuRef = useRef(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, index: null, role: null });
  const [openExportMenuIndex, setOpenExportMenuIndex] = useState(null);
  const prevMessagesRef = useRef([]);
  const canEditUserMessage = true;
  const toast = useToast();
  const hasWaitingFirstChunk = messages.some((message) => message?.isWaitingFirstChunk);
  const hasStreamingContent = messages.some((message) => (message?.isStreaming && !message?.isWaitingFirstChunk) || message?.isSearching);

  useEffect(() => {
    prevMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!exportMenuRef.current?.contains(event.target)) {
        setOpenExportMenuIndex(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpenExportMenuIndex(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setOpenExportMenuIndex(null);
  }, [messages]);

  const isNewMessage = (msg, index) => {
    const prevMsgs = prevMessagesRef.current;
    return !prevMsgs[index] || prevMsgs[index].id !== msg.id;
  };

  const openLightbox = (src) => {
    if (!src) return;
    setLightboxSrc(src);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setLightboxSrc(null);
  };

  const handleDeleteClick = (index, role) => {
    setDeleteConfirm({ open: true, index, role });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.index !== null) {
      if (deleteConfirm.role === "user") {
        onDeleteUserMessage(deleteConfirm.index);
      } else {
        onDeleteModelMessage(deleteConfirm.index);
      }
    }
    setDeleteConfirm({ open: false, index: null, role: null });
  };

  const resizeEditTextarea = () => {
    const el = editTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 24)}px`;
  };

  const scrollEditIntoView = () => {
    const el = editTextareaRef.current;
    const container = listRef?.current;
    if (!el || !container) return;
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const delta = elRect.top - (cRect.top + cRect.height / 2);
    container.scrollTo({ top: container.scrollTop + delta, behavior: "auto" });
  };

  useEffect(() => {
    if (editingMsgIndex === null || editingMsgIndex === undefined) return;
    resizeEditTextarea();
    const el = editTextareaRef.current;
    if (el) {
      try { el.focus({ preventScroll: true }); } catch { el.focus(); }
    }
    requestAnimationFrame(scrollEditIntoView);
    const t = setTimeout(scrollEditIntoView, 80);
    return () => clearTimeout(t);
  }, [editingMsgIndex]);

  useEffect(() => {
    if (editingMsgIndex !== null && editingMsgIndex !== undefined) resizeEditTextarea();
  }, [editingContent, editingMsgIndex]);

  const handleBubbleCopy = (e) => {
    const el = e.currentTarget;
    if (!el || !isSelectionFullyInsideElement(el)) return;
    const selText = window.getSelection?.()?.toString?.();
    if (!selText) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", normalizeCopiedText(selText));
  };

  const handleExportMessage = async (format, msg) => {
    const labelMap = { markdown: "Markdown", pdf: "PDF", docx: "Docx" };
    try {
      await exportMessageContent(format, buildCopyText(msg));
      toast.success(`已导出 ${labelMap[format] || "文件"}`);
    } catch (error) {
      toast.error(error?.message || "导出失败");
    } finally {
      setOpenExportMenuIndex(null);
    }
  };

  return (
    <div
      ref={listRef}
      onScroll={onScroll}
      className={`ai-message-list relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 scroll-smooth custom-scrollbar mobile-scroll sm:px-5 md:px-6 md:py-6 ${fontSizeClass}`}
    >
      <ImageLightbox open={lightboxOpen} onClose={closeLightbox} src={lightboxSrc} />

      <ConfirmModal
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, index: null, role: null })}
        onConfirm={handleConfirmDelete}
        title="删除消息"
        message={`确定要删除这条${deleteConfirm.role === "user" ? "你的" : "AI"}消息吗？此操作无法撤销。`}
        confirmText="删除"
        danger
      />

      {messages.length === 0 ? (
        loading ? (
          <div className="flex min-h-full flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--ai-panel-border)] bg-[var(--ai-shell-surface-strong)] px-6 py-4">
              <LoadingSweepText text="..." ariaText="加载中" className="loading-sweep-dots text-xl" />
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="min-h-[280px]"
          />
        )
      ) : (
        messages.map((msg, i) => {
          const displayUserName = typeof userNickname === "string" && userNickname.trim() ? userNickname.trim() : "您";
          const fallbackThinkingTimeline = normalizeFallbackToolTimeline(msg.tools);
          const displayParts = Array.isArray(msg.parts) && msg.role === "model"
            ? msg.parts.filter((part) => !(typeof part?.text === "string" && isPendingRunText(part.text)) && !part?.thought)
            : msg.parts;
          const hasParts = Array.isArray(displayParts) && displayParts.some((part) =>
            part?.inlineData?.url || part?.fileData?.name || (typeof part?.text === "string" && part.text.trim().length > 0)
          );
          const hasVisibleContent = typeof msg.content === "string" && msg.content.trim().length > 0 && !isPendingRunText(msg.content);
          const hasTableContent = (
            (hasVisibleContent && containsMarkdownTable(msg.content))
            || (hasParts && displayParts.some((part) => containsMarkdownTable(part?.text)))
          );
          const hasBodyOutput =
            hasVisibleContent
            || (hasParts && displayParts.some((part) => part && typeof part.text === "string" && part.text.trim().length > 0));
          const resolvedThinkingTimeline = Array.isArray(msg.thinkingTimeline) && msg.thinkingTimeline.length > 0
            ? msg.thinkingTimeline
            : fallbackThinkingTimeline;
          const hasThinkingTimeline = Array.isArray(resolvedThinkingTimeline)
            && resolvedThinkingTimeline.some((step) => step?.kind === "search" || step?.kind === "reader" || step?.kind === "sandbox" || step?.kind === "thought" || step?.kind === "upload" || step?.kind === "parse" || step?.kind === "tool" || step?.kind === "planner" || step?.kind === "writer");
          const hasToolRuns = Array.isArray(msg.tools) && msg.tools.length > 0;
          const hasArtifacts = Array.isArray(msg.artifacts) && msg.artifacts.length > 0;
          const shouldRenderToolCards = msg.role === "model" && hasToolRuns && !hasThinkingTimeline && msg.tools.some((t) => t?.id);
          const shouldRenderBubble = hasParts || hasVisibleContent || shouldRenderToolCards || (msg.role === "model" && hasArtifacts);
          
          if (msg.role === "model" && !msg.thought && !hasVisibleContent && !hasParts && !msg.isSearching && !msg.searchError && !hasThinkingTimeline && !hasToolRuns && !hasArtifacts && msg.isWaitingFirstChunk) {
            return null;
          }

          return (
            <motion.div
              key={msg.id}
              initial={isNewMessage(msg, i) ? { opacity: 0, y: 20 } : false}
              animate={{ opacity: 1, y: 0 }}
              className={`group mx-auto flex w-full max-w-5xl flex-col gap-3 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              {msg.role === "model" && (msg.thought || hasVisibleContent || (msg.isStreaming && !msg.isWaitingFirstChunk) || hasParts || msg.isSearching || msg.searchError || hasThinkingTimeline || hasToolRuns || hasArtifacts) && (
                <div className="flex items-center gap-2 pl-1">
                  <AIAvatar model={model} size={24} animate={msg.isStreaming} />
                  <span className="ai-surface-pill ai-model-pill">
                    {CHAT_MODELS.find((m) => m.id === model)?.name}
                  </span>
                </div>
              )}

              <div className={`flex flex-col w-full ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.role === "user" && (
                  <div className="relative mb-1 flex items-center gap-2 pr-1">
                    <span className="max-w-[150px] truncate text-[11px] font-medium text-[var(--text-secondary)]">
                      {displayUserName}
                    </span>
                    <UserAvatar nickname={displayUserName} size={22} />
                  </div>
                )}
                {msg.role === "model" && (msg.thought || msg.isSearching || msg.searchError || hasThinkingTimeline) && (
                  <ThinkingBlock
                    thought={msg.thought}
                    isStreaming={msg.isThinkingStreaming}
                    isSearching={msg.isSearching}
                    searchQuery={msg.searchQuery}
                    searchError={msg.searchError}
                    timeline={resolvedThinkingTimeline}
                    tools={msg.tools}
                    bodyText={hasBodyOutput ? "1" : ""}
                  />
                )}

                {editingMsgIndex === i && msg.role === "user" && canEditUserMessage ? (
                  <div className="w-full flex flex-col items-end gap-2">
                    <div className="msg-bubble-user w-full max-w-full">
                      <textarea
                        ref={editTextareaRef}
                        value={editingContent}
                        onChange={(e) => onEditingContentChange(e.target.value)}
                        className="block max-h-[45vh] w-full resize-none overflow-y-auto bg-transparent p-0 text-sm leading-6 text-[#fffaf0] outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={onCancelEdit} className="rounded-full bg-[rgba(255,250,240,0.86)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,250,240,0.96)]">取消</button>
                      <button onClick={() => onSubmitEdit(i)} className="ai-primary-action rounded-full px-3 py-1.5 text-xs transition-colors">提交</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {shouldRenderBubble && (
                      <div
                        className={`relative group/bubble px-4 py-3 sm:px-5 sm:py-4 transition-all duration-300 ${
                          msg.role === "user" ? "msg-bubble-user max-w-[92%] sm:max-w-[85%] md:max-w-[75%]" : `msg-bubble-ai ${hasTableContent ? "w-full" : "w-full md:max-w-[96%]"}`
                        } ${msg.isStreaming ? "ai-glow ai-glow-active" : ""}`}
                        onCopy={handleBubbleCopy}
                      >
                        {hasParts ? (
                          <div className="flex flex-col gap-2">
                            {(() => {
                              const entries = displayParts.map((part, idx) => ({ part, idx }));
                              const isUser = msg.role === "user";
                              const ordered = isUser
                                ? [...entries.filter(e => e.part?.inlineData?.url), ...entries.filter(e => e.part?.fileData?.name), ...entries.filter(e => e.part?.text)]
                                : entries.filter(e => !e.part?.thought);

                              return ordered.map(({ part, idx }) => {
                                const url = part?.inlineData?.url;
                                if (url) return <Thumb key={idx} src={url} onClick={openLightbox} />;
                                if (part?.fileData?.name) return <AttachmentCard key={idx} file={part.fileData} compact={isUser} />;
                                if (part?.text?.trim()) {
                                  return (
                                    <Markdown
                                      key={idx}
                                      enableHighlight={!msg.isStreaming}
                                      enableMath={true}
                                      className={isUser ? "prose-invert" : ""}
                                    >
                                      {part.text}
                                    </Markdown>
                                  );
                                }
                                return null;
                              });
                            })()}
                          </div>
                        ) : hasVisibleContent ? (
                          <Markdown
                            enableHighlight={!msg.isStreaming}
                            enableMath={true}
                            className={msg.role === "user" ? "prose-invert" : ""}
                          >
                            {msg.content}
                          </Markdown>
                        ) : null}
                        {shouldRenderToolCards && <ToolRunCards tools={msg.tools} />}
                        {msg.role === "model" && hasArtifacts && <ArtifactCards artifacts={msg.artifacts} />}
                        {msg.role === "model" && !msg.isStreaming && msg.citations && <Citations citations={msg.citations} />}
                      </div>
                    )}

                    {!msg.isStreaming && (
                      <div className={`ai-message-actions mt-2 flex flex-wrap gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                        {msg.role === "model" && (hasParts || hasVisibleContent) && (
                          <div className="relative" ref={openExportMenuIndex === i ? exportMenuRef : null}>
                            <button onClick={() => setOpenExportMenuIndex(prev => prev === i ? null : i)} className="ai-message-action" type="button">
                              <Download size={14} />
                            </button>
                            <AnimatePresence>
                              {openExportMenuIndex === i && (
                                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="ai-floating-panel absolute right-0 top-full z-20 mt-1 min-w-[150px] rounded-[var(--radius-lg)] p-1.5">
                                  {["markdown", "pdf", "docx"].map(format => (
                                    <button key={format} onClick={() => handleExportMessage(format, msg)} className="w-full rounded-[var(--radius-md)] px-3 py-2 text-left text-sm uppercase transition-colors hover:bg-[var(--ai-panel-muted)]" type="button">{format}</button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                        <button onClick={() => onCopy(buildCopyText(msg))} className="ai-message-action" type="button"><Copy size={14} /></button>
                        <button onClick={() => handleDeleteClick(i, msg.role)} className="ai-message-action ai-message-action-danger" type="button"><Trash2 size={14} /></button>
                        {msg.role === "user" && canEditUserMessage && (
                          <button onClick={() => onStartEdit(i, msg)} className="ai-message-action" type="button"><Edit3 size={14} /></button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          );
        })
      )}

      {messages.length > 0 && (loading || hasWaitingFirstChunk) && !hasStreamingContent && (
        <div className="mx-auto flex w-full max-w-5xl items-start gap-3">
          <ResponsiveAIAvatar model={model} desktopSize={24} animate />
          <div className="rounded-[var(--radius-lg)] border border-[var(--ai-panel-border)] bg-[var(--ai-shell-surface-strong)] px-5 py-3">
            <LoadingSweepText text="..." className="loading-sweep-dots text-xl" />
          </div>
        </div>
      )}

      <div ref={chatEndRef} />
    </div>
  );
}
