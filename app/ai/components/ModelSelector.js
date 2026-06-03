"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CHAT_MODELS,
  getGroupedSelectableModels,
  MODEL_GROUP_TITLES,
} from "@/lib/ai/shared/models";
import { ModelGlyph } from "./ModelVisuals";

export default function ModelSelector({
  model,
  onModelChange,
  ready = true,
  fullWidth = false,
}) {
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const triggerRef = useRef(null);
  const mounted = typeof window !== "undefined";
  const currentModel = ready ? CHAT_MODELS.find((item) => item.id === model) : null;
  const currentModelLabel = currentModel?.name || "模型";
  const groupedModels = getGroupedSelectableModels();

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.min(window.innerWidth - 24, 260);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const bottom = Math.max(12, window.innerHeight - rect.top + 8);
    setMenuStyle({
      left: `${left}px`,
      bottom: `${bottom}px`,
      width: `${width}px`,
    });
  }, []);

  useEffect(() => {
    if (!showModelMenu || !mounted) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [mounted, showModelMenu, updateMenuPosition]);

  return (
    <div ref={triggerRef} className="relative">
      <button
        onClick={() => {
          if (!ready) return;
          if (!showModelMenu) updateMenuPosition();
          setShowModelMenu((value) => !value);
        }}
        className={`ai-control-chip flex items-center gap-2 rounded-full px-3.5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:text-[var(--oa-blue)] disabled:opacity-50 ${fullWidth ? "w-full justify-between" : "max-w-full"}`}
        type="button"
        disabled={!ready}
      >
        <span className="inline-flex h-4 w-4 items-center justify-center shrink-0">
          {currentModel ? (
            <ModelGlyph model={currentModel.id} provider={currentModel.provider} size={14} />
          ) : (
            <span className="block h-4 w-4 rounded-sm bg-[var(--ai-panel-muted)]" aria-hidden />
          )}
        </span>
        <span className={fullWidth ? "max-w-[148px] truncate" : "hidden max-w-[160px] truncate sm:inline-block"}>
          {currentModelLabel}
        </span>
      </button>

      {mounted ? createPortal(
        <AnimatePresence>
          {ready && showModelMenu && menuStyle ? (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60]"
                onClick={() => setShowModelMenu(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="ai-floating-panel fixed z-[61] rounded-[var(--radius-lg)] p-2"
                style={{ ...menuStyle, borderColor: "var(--oa-muted-soft)" }}
              >
                <div className="max-h-[420px] overflow-y-auto pr-1 mobile-scroll custom-scrollbar">
                  {Array.from(groupedModels.entries()).map(([provider, items], groupIdx) => (
                    <div key={provider}>
                      {groupIdx > 0 ? (
                        <div className="mx-2.5 my-1.5 h-px bg-[var(--ai-panel-border)]" aria-hidden />
                      ) : null}
                      <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        {MODEL_GROUP_TITLES[provider] || provider}
                      </div>
                      {items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (!ready) return;
                            setShowModelMenu(false);
                            onModelChange(item.id);
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-colors md:text-[13px] ${
                            model === item.id
                              ? "ai-primary-soft"
                              : "text-[var(--text-secondary)] hover:bg-[var(--ai-panel-muted)] hover:text-[var(--text-primary)]"
                          }`}
                          type="button"
                        >
                          <ModelGlyph model={item.id} provider={item.provider} size={16} />
                          <div className="min-w-0 flex-1 text-left leading-tight break-words">{item.name}</div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>,
        document.body
      ) : null}
    </div>
  );
}
