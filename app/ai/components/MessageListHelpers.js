import { useState } from "react";
import { Download, ExternalLink, FileText, Search, Terminal, UserRound, X } from "lucide-react";
import { ModelAvatar } from "./ModelVisuals";
import { formatAttachmentMeta } from "@/lib/ai/shared/messageAttachments";
import { toBlobDownloadUrl } from "@/lib/ai/shared/blobUrls";
import {
  getWebBrowsingToolTitle,
  isWebBrowsingIdentifier,
  normalizeWebBrowsingIdentifier,
} from "@/lib/ai/shared/webBrowsing";

const WEB_BROWSING_PREVIEW_LIMIT = 20;

function getDomainFromUrl(url) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return ""; }
}

function WebFavicon({ url, size = 12, className = "" }) {
  const [failed, setFailed] = useState(false);
  const domain = getDomainFromUrl(url);
  if (!domain || failed) return <Search size={size} className={className} />;
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}`}
      alt=""
      width={size}
      height={size}
      className={`${className} rounded-sm`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function AIAvatar({ model, size = 24, animate = false, className = "" }) {
  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-md ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <ModelAvatar model={model} size={size} animate={animate} />
    </span>
  );
}

export function UserAvatar({ nickname = "", size = 24, className = "" }) {
  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-full ring-1 ring-white/80 ${className}`.trim()}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #edf4ff 0%, #dbeafe 52%, #c7d2fe 100%)",
        boxShadow: "0 4px 14px rgba(79, 110, 247, 0.16)",
      }}
      aria-label={typeof nickname === "string" && nickname.trim() ? `${nickname} 默认头像` : "默认用户头像"}
    >
      <span
        className="absolute inset-[1px] rounded-full"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.68) 100%)",
        }}
      />
      <UserRound
        size={Math.max(12, Math.round(size * 0.62))}
        strokeWidth={2.1}
        className="relative text-[hsl(var(--primary))]"
      />
    </span>
  );
}

export function LoadingSweepText({ text = "加载中", className = "", ariaText }) {
  // 如果是三个点，使用跳跃动画
  if (text === "...") {
    return (
      <span className={`loading-sweep ${className}`.trim()} data-text={text} aria-label={ariaText || text}>
        <span className="jump-dot">.</span>
        <span className="jump-dot">.</span>
        <span className="jump-dot">.</span>
      </span>
    );
  }
  return (
    <span className={`loading-sweep ${className}`.trim()} data-text={text} aria-label={ariaText || text}>
      {text}
    </span>
  );
}

export function ResponsiveAIAvatar({ model, mobileSize = 22, desktopSize = 26, animate = false }) {
  return (
    <>
      <span className="sm:hidden"><AIAvatar model={model} size={mobileSize} animate={animate} /></span>
      <span className="hidden sm:inline"><AIAvatar model={model} size={desktopSize} animate={animate} /></span>
    </>
  );
}

export function normalizeCopiedText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function getMessageText(msg) {
  if (!msg) return "";
  if (typeof msg.content === "string" && msg.content.trim()) {
    return msg.content;
  }
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .map((part) => {
        if (typeof part?.text === "string") return part.text.trim();
        if (part?.fileData?.name) return `[附件] ${part.fileData.name}`;
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

function stripThinkingBlocks(text) {
  if (typeof text !== "string" || !text) return "";
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
}

export function buildCopyText(msg) {
  if (!msg) return "";
  const raw = getMessageText(msg);
  const cleaned = msg.role === "model" ? stripThinkingBlocks(raw) : raw;
  return normalizeCopiedText(cleaned);
}

function stripMarkdown(text) {
  if (typeof text !== "string" || !text) return "";
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?|```$/g, "").trim())
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^[\*\-+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^[-*_]{3,}$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildPlainText(msg) {
  if (!msg) return "";
  const raw = getMessageText(msg);
  const cleaned = msg.role === "model" ? stripThinkingBlocks(raw) : raw;
  return normalizeCopiedText(stripMarkdown(cleaned));
}

export function isSelectionFullyInsideElement(el) {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return false;
  const anchor = sel.anchorNode;
  const focus = sel.focusNode;
  if (!anchor || !focus) return false;
  return el.contains(anchor) && el.contains(focus);
}

export function Thumb({ src, className = "", onClick }) {
  if (!src) return null;
  return (
    <button
      type="button"
      onClick={() => onClick?.(src)}
      className={`block text-left ${className}`}
      title="点击查看"
    >
      <img
        src={src}
        alt=""
        className="block h-auto max-h-[180px] w-auto max-w-[240px] rounded-lg border border-[var(--oa-card-border)] bg-[var(--oa-paper-soft)] object-cover"
        loading="eager"
        decoding="async"
      />
    </button>
  );
}

export function AttachmentCard({ file, compact = false }) {
  if (!file?.name) return null;
  const canDownload = typeof file.url === "string" && /^https?:\/\//i.test(file.url);
  const downloadUrl = canDownload
    ? toBlobDownloadUrl(file.url)
    : null;

  return (
    <div className={`flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] px-3 py-2 ${compact ? "min-w-[220px]" : "min-w-[240px]"}`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oa-paper-soft)] text-[var(--oa-muted)]">
        <FileText size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--oa-ink)]">{file.name}</div>
        <div className="truncate text-xs text-[var(--oa-muted)]">{formatAttachmentMeta(file)}</div>
        {typeof file.formatSummary === "string" && file.formatSummary.trim() ? (
          <div className="truncate text-xs text-[var(--oa-muted)]">{file.formatSummary}</div>
        ) : null}
      </div>
      {downloadUrl ? (
        <a
          href={downloadUrl}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--oa-muted)] transition-colors hover:bg-[var(--oa-paper-soft)] hover:text-[var(--oa-ink)]"
          title="下载附件"
        >
          <Download size={15} />
        </a>
      ) : null}
    </div>
  );
}

export function Citations({ citations }) {
  const [open, setOpen] = useState(false);
  if (!citations || !Array.isArray(citations) || citations.length === 0) return null;

  const uniqueCitations = [];
  const seenUrls = new Set();
  for (const c of citations) {
    if (c?.url && !seenUrls.has(c.url)) {
      seenUrls.add(c.url);
      uniqueCitations.push(c);
    }
  }

  if (uniqueCitations.length === 0) return null;

  const previewCount = Math.min(5, uniqueCitations.length);
  const previewItems = uniqueCitations.slice(0, previewCount);

  return (
    <div className="mt-3 border-t border-[var(--oa-card-border)] pt-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--oa-paper-soft)] px-2.5 py-1.5 text-xs text-[var(--oa-muted)] transition-colors hover:bg-[var(--oa-red-soft-bg)] hover:text-[var(--oa-ink)]"
        title="查看全部来源"
      >
        <Search size={12} className="text-[var(--oa-muted)]" />
        <span>信息来源</span>
        <span className="flex -space-x-1.5">
          {previewItems.map((citation, idx) => (
            <span key={idx} className="inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)]">
              <WebFavicon url={citation.url} size={12} />
            </span>
          ))}
        </span>
        {uniqueCitations.length > previewCount && (
          <span className="text-[var(--oa-muted)]">+{uniqueCitations.length - previewCount}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-[rgba(23,32,51,0.42)]"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] p-4 shadow-[var(--oa-shadow)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--oa-ink)]">
                <Search size={14} />
                信息来源
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-[var(--oa-muted)] hover:bg-[var(--oa-paper-soft)] hover:text-[var(--oa-ink)]"
                title="关闭"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="flex flex-col gap-2">
                {uniqueCitations.map((citation, idx) => {
                  const domain = getDomainFromUrl(citation.url) || citation.url;
                  return (
                    <a
                      key={idx}
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-[var(--oa-card-border)] bg-[var(--oa-paper-soft)] px-2.5 py-2 text-sm text-[var(--oa-ink)] transition-colors hover:bg-[var(--oa-red-soft-bg)]"
                      title={citation.title || citation.url}
                    >
                      <WebFavicon url={citation.url} size={16} className="flex-shrink-0" />
                      <span className="truncate flex-1">
                        {citation.title || domain}
                      </span>
                      <ExternalLink size={14} className="text-[var(--oa-muted)]" />
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildArtifactDownloadUrl(artifact) {
  if (typeof artifact?.url !== "string" || !/^https?:\/\//i.test(artifact.url)) return null;
  return toBlobDownloadUrl(artifact.url);
}

export function hasToolRunPreview(tool) {
  if (!tool || typeof tool !== "object") return false;
  const toolIdentifier = normalizeWebBrowsingIdentifier(tool.identifier);

  if (isWebBrowsingIdentifier(toolIdentifier) && Array.isArray(tool.state?.results) && tool.state.results.length > 0) {
    return true;
  }

  return Boolean(
    (typeof tool.summary === "string" && tool.summary)
    || (typeof tool.content === "string" && tool.content)
  );
}

export function ToolRunPreview({ tool }) {
  if (!hasToolRunPreview(tool)) return null;
  const toolIdentifier = normalizeWebBrowsingIdentifier(tool.identifier);

  if (isWebBrowsingIdentifier(toolIdentifier) && Array.isArray(tool.state?.results) && tool.state.results.length > 0) {
    return (
      <div className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto pr-1 mobile-scroll overscroll-contain custom-scrollbar">
        {tool.state.results.slice(0, WEB_BROWSING_PREVIEW_LIMIT).map((item, index) => {
          const href = typeof item?.url === "string" ? item.url : "";
          const title = typeof item?.title === "string" && item.title ? item.title : href;
          if (!href) return null;
          return (
            <a
              key={`${tool.id}-${index}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] px-2.5 py-2 text-xs text-[var(--oa-muted)] transition-colors hover:border-[var(--oa-red-soft-border)] hover:text-[var(--oa-blue)]"
            >
              <WebFavicon url={href} size={14} className="shrink-0" />
              <span className="truncate flex-1">{title}</span>
              <ExternalLink size={12} className="shrink-0 opacity-60" />
            </a>
          );
        })}
      </div>
    );
  }

  const previewText = typeof tool.summary === "string" && tool.summary
    ? tool.summary
    : (typeof tool.content === "string" ? tool.content : "");
  if (!previewText) return null;

  return (
    <div className="whitespace-pre-wrap break-words rounded-lg border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] px-3 py-2 text-xs text-[var(--oa-muted)]">
      {previewText}
    </div>
  );
}

export function ToolRunCards({ tools }) {
  if (!Array.isArray(tools) || tools.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {tools.map((tool) => {
        if (!tool?.id) return null;
        const toolIdentifier = normalizeWebBrowsingIdentifier(tool.identifier);
        const isWeb = isWebBrowsingIdentifier(toolIdentifier);
        const icon = isWeb ? <Search size={13} /> : <Terminal size={13} />;
        const title = typeof tool.title === "string" && tool.title
          ? tool.title
          : (isWeb ? getWebBrowsingToolTitle(tool.apiName) : `${toolIdentifier || "tool"}.${tool.apiName || "run"}`);
        const statusText = tool.status === "error" ? "失败" : (tool.status === "running" ? "运行中" : "完成");

        return (
          <div
            key={tool.id}
            className="rounded-[var(--radius-md)] border border-[var(--oa-card-border)] bg-[var(--oa-paper-soft)] px-3 py-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--oa-card-bg)] text-[var(--oa-muted)]">
                {icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--oa-ink)]">{title}</div>
                <div className="text-[11px] text-[var(--oa-muted)]">{statusText}</div>
              </div>
            </div>
            <ToolRunPreview tool={tool} />
          </div>
        );
      })}
    </div>
  );
}

export function ArtifactCards({ artifacts }) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {artifacts.map((artifact, index) => {
        const downloadUrl = buildArtifactDownloadUrl(artifact);
        const title = typeof artifact?.title === "string" && artifact.title ? artifact.title : `产物 ${index + 1}`;
        const meta = [
          typeof artifact?.extension === "string" && artifact.extension ? artifact.extension.toUpperCase() : "",
          Number.isFinite(artifact?.size) && artifact.size > 0 ? formatAttachmentMeta({ size: artifact.size }) : "",
        ].filter(Boolean).join(" · ");

        return (
          <div
            key={`${artifact?.url || title}-${index}`}
            className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] px-3 py-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oa-paper-soft)] text-[var(--oa-muted)]">
              <FileText size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--oa-ink)]">{title}</div>
              <div className="truncate text-xs text-[var(--oa-muted)]">{meta || "沙盒导出产物"}</div>
            </div>
            {downloadUrl ? (
              <a
                href={downloadUrl}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--oa-muted)] transition-colors hover:bg-[var(--oa-paper-soft)] hover:text-[var(--oa-ink)]"
                title="下载产物"
              >
                <Download size={15} />
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
