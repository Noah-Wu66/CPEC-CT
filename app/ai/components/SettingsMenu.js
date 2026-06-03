"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Settings2, MessageSquareQuote, X } from "lucide-react";
import { getModelConfig } from "@/lib/ai/shared/models";
import { DEFAULT_WEB_SEARCH_SETTINGS } from "@/lib/ai/shared/webSearch";
import SystemPromptModal from "./SystemPromptModal";

export default function SettingsMenu({
  model,
  webSearch,
  setWebSearch,
  chatSystemPrompt,
  onChatSystemPromptSave,
  systemPrompts,
  addSystemPrompt,
  updateSystemPrompt,
  deleteSystemPrompt,
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const mounted = typeof window !== "undefined";
  const modelConfig = getModelConfig(model);
  const supportsWebSearch = modelConfig?.supportsWebSearch === true;
  const webSearchSettings = webSearch && typeof webSearch === "object"
    ? { ...DEFAULT_WEB_SEARCH_SETTINGS, ...webSearch }
    : DEFAULT_WEB_SEARCH_SETTINGS;

  const updateWebSearch = (patch) => {
    setWebSearch((prev) => ({
      ...(prev && typeof prev === "object" ? prev : DEFAULT_WEB_SEARCH_SETTINGS),
      ...patch,
    }));
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowSettings((value) => !value)}
        className={`ai-control-chip flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm transition-colors ${showSettings
          ? "ai-primary-soft"
          : "text-[var(--text-secondary)]"
          }`}
        type="button"
      >
        <Settings2 size={14} />
        <span className="hidden sm:inline">设置</span>
      </button>

      {mounted ? createPortal(
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[55] flex items-center justify-center bg-[rgba(23,32,51,0.42)] p-4 backdrop-blur-[2px]"
              onClick={() => setShowSettings(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                onClick={(e) => e.stopPropagation()}
                className="ai-shell ai-floating-panel w-full max-w-sm overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--ai-shadow)]"
              >
                <div className="flex items-center justify-between border-b border-[var(--ai-panel-border)] px-5 py-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    <Settings2 size={16} className="text-[var(--ai-accent-strong)]" />
                    对话设置
                  </h3>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="rounded-full p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--ai-panel-muted)] hover:text-[var(--text-primary)]"
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* 智能联网 */}
                  {supportsWebSearch ? (
                    <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--ai-panel-border)] bg-[var(--oa-card-bg)] px-4 py-3">
                      <span className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                        <Search size={15} className="text-[var(--ai-accent-strong)]" />
                        智能联网
                      </span>
                      <button
                        onClick={() => updateWebSearch({ enabled: !webSearchSettings.enabled })}
                        type="button"
                        className={`relative h-[22px] w-10 rounded-full transition-colors ${webSearchSettings.enabled ? "bg-[var(--oa-blue)]" : "bg-[var(--oa-border)]"}`}
                      >
                        <span className={`absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-[var(--oa-elevated)] transition-transform ${webSearchSettings.enabled ? "translate-x-[18px]" : ""}`} />
                      </button>
                    </div>
                  ) : null}

                  {/* 系统提示词 */}
                  <div>
                    <label className="mb-2 block px-1 text-xs font-medium text-[var(--text-muted)]">
                      系统提示词
                    </label>
                    <button
                      onClick={() => {
                        setShowSettings(false);
                        setShowPromptModal(true);
                      }}
                      type="button"
                      className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--ai-panel-border)] bg-[var(--oa-card-bg)] px-4 py-3 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--oa-paper-soft)]"
                    >
                      <span className="flex items-center gap-2">
                        <MessageSquareQuote size={15} />
                        配置提示词
                      </span>
                      <span className="rounded-full bg-[var(--ai-panel-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                        {chatSystemPrompt ? "已设置" : "默认无"}
                      </span>
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      ) : null}
      <SystemPromptModal
        open={showPromptModal}
        onClose={() => setShowPromptModal(false)}
        chatSystemPrompt={chatSystemPrompt}
        onChatSystemPromptSave={onChatSystemPromptSave}
        systemPrompts={systemPrompts}
        addSystemPrompt={addSystemPrompt}
        updateSystemPrompt={updateSystemPrompt}
        deleteSystemPrompt={deleteSystemPrompt}
      />
    </div>
  );
}
