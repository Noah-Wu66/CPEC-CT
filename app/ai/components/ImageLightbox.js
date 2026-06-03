"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { toBlobDownloadUrl } from "@/lib/ai/shared/blobUrls";

function isHttpUrl(src) {
  if (typeof src !== "string") return false;
  try {
    const u = new URL(src);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function ImageLightbox({ open, onClose, src }) {
  const downloadUrl = useMemo(() => toBlobDownloadUrl(src), [src]);
  const canDownload = useMemo(() => isHttpUrl(src) && Boolean(downloadUrl), [downloadUrl, src]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-[rgba(23,32,51,0.72)]" />

          <motion.div
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.98, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[80vh] w-full max-w-[90vw] rounded-[var(--radius-lg)] border border-[rgba(255,250,240,0.16)] bg-[rgba(23,32,51,0.36)] shadow-[var(--oa-shadow)] backdrop-blur"
          >
            <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
              {canDownload && (
                <a
                  href={downloadUrl}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(255,250,240,0.12)] bg-[rgba(255,250,240,0.1)] px-3 py-2 text-xs font-medium text-[#fffaf0]/90 transition-colors hover:bg-[rgba(255,250,240,0.2)]"
                  title="下载原图"
                >
                  <Download size={14} />
                  下载
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(255,250,240,0.12)] bg-[rgba(255,250,240,0.1)] text-[#fffaf0]/80 transition-colors hover:bg-[rgba(255,250,240,0.2)] hover:text-[#fffaf0]"
                title="关闭"
              >
                <X size={16} />
              </button>
            </div>

            <div className="w-full h-full max-h-[80vh] flex items-center justify-center p-3">
              <img
                src={src}
                alt=""
                className="max-h-[80vh] max-w-[90vw] rounded-[var(--radius-md)] bg-[rgba(23,32,51,0.42)] object-contain"
                draggable={false}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

