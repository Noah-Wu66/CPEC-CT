"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Plus, Trash2, Edit3, MessageSquareQuote, Check } from "lucide-react";
import { useToast } from "./ToastProvider";

export default function SystemPromptModal({
  open,
  onClose,
  chatSystemPrompt,
  onChatSystemPromptSave,
  systemPrompts,
  addSystemPrompt,
  updateSystemPrompt,
  deleteSystemPrompt,
}) {
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Inline edit state for preset
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(chatSystemPrompt || "");
      setEditingId(null);
    }
  }, [open, chatSystemPrompt]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onChatSystemPromptSave(draft);
      toast.success(draft.trim() ? "系统提示词已生效" : "系统提示词已清除");
      onClose();
    } catch (e) {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePreset = () => {
    if (!draft.trim()) {
      toast.warning("当前内容为空，请输入内容后再存为预设");
      return;
    }
    setEditingId("new");
    setEditName("新预设");
    setEditContent(draft);
  };

  const handleEditPreset = (e, preset) => {
    e.stopPropagation();
    setEditingId(preset._id);
    setEditName(preset.name);
    setEditContent(preset.content);
  };

  const submitPreset = async () => {
    if (!editName.trim() || !editContent.trim()) {
      toast.warning("名称和内容不能为空");
      return;
    }
    try {
      if (editingId === "new") {
        await addSystemPrompt(editName, editContent);
        toast.success("已创建预设");
      } else {
        await updateSystemPrompt(editingId, editName, editContent);
        toast.success("已更新预设");
      }
      setEditingId(null);
    } catch (e) {
      toast.error(e?.message || "保存失败");
    }
  };

  const applyPreset = (preset) => {
    setDraft(preset.content);
    toast.success(`已应用预设：${preset.name}`);
  };

  const handleDeletePreset = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("确定删除此预设吗？")) return;
    try {
      await deleteSystemPrompt(id);
      toast.success("已删除预设");
      if (editingId === id) setEditingId(null);
    } catch (e) {
      toast.error("删除失败");
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[rgba(23,32,51,0.42)] p-4 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="ai-shell flex h-[calc(100dvh-2rem)] max-h-[800px] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] shadow-[var(--oa-shadow)] sm:h-[calc(100dvh-3rem)] md:flex-row"
          >
            {/* Left Panel: Presets */}
            <div className="flex h-1/3 w-full shrink-0 flex-col border-b border-[var(--oa-card-border)] bg-[var(--oa-paper-soft)] md:h-auto md:w-72 md:border-b-0 md:border-r lg:w-80">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--oa-card-head-border)] px-5 py-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--oa-ink)]">
                  <MessageSquareQuote size={16} className="text-primary" />
                  预设库
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {systemPrompts && systemPrompts.length > 0 ? (
                  systemPrompts.map((preset) => (
                    <div
                      key={preset._id}
                      onClick={() => applyPreset(preset)}
                      className="group relative flex cursor-pointer flex-col rounded-[var(--radius-lg)] border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] p-3.5 shadow-sm transition-all hover:border-[var(--oa-red-soft-border)] hover:shadow-[var(--oa-shadow-soft)] active:scale-[0.98]"
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <h4 className="truncate pr-8 text-sm font-semibold text-[var(--oa-ink)]">{preset.name}</h4>
                        <div className="absolute right-2 top-2 flex opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => handleEditPreset(e, preset)} className="rounded-lg border border-[var(--oa-card-border)] bg-[var(--oa-control-bg)] p-1.5 text-[var(--oa-muted)] shadow-sm transition-colors hover:text-[var(--oa-blue)]"><Edit3 size={14}/></button>
                          <button onClick={(e) => handleDeletePreset(e, preset._id)} className="ml-1 rounded-lg border border-[var(--oa-card-border)] bg-[var(--oa-control-bg)] p-1.5 text-[var(--oa-muted)] shadow-sm transition-colors hover:text-[var(--oa-red)]"><Trash2 size={14}/></button>
                        </div>
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-[var(--oa-muted)]">{preset.content}</p>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--oa-paper)]">
                      <MessageSquareQuote size={20} className="text-[var(--oa-muted)]" />
                    </div>
                    <p className="text-sm text-[var(--oa-muted)]">暂无预设</p>
                    <p className="mt-1 text-xs text-[var(--oa-muted-soft)]">在右侧编辑内容后可存为预设</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel: Editor */}
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--oa-card-bg)]">
              {/* Header */}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--oa-card-head-border)] px-4 py-4 sm:px-6">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-[var(--oa-ink)]">系统提示词配置</h2>
                  <p className="mt-1 text-xs text-[var(--oa-muted)]">控制大模型的默认行为、背景设定和回复风格。仅在 Chat 模式下生效。</p>
                </div>
                <button onClick={onClose} className="shrink-0 rounded-[var(--radius-md)] p-2 text-[var(--oa-muted)] transition-colors hover:bg-[var(--oa-paper-soft)] hover:text-[var(--oa-ink)]">
                  <X size={20} />
                </button>
              </div>
              
              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
                {editingId ? (
                  <div className="flex min-h-full flex-col animate-in fade-in slide-in-from-bottom-2">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[var(--oa-ink)]">
                        {editingId === "new" ? "新建预设" : "编辑预设"}
                      </h3>
                    </div>
                    <input
                      type="text"
                      placeholder="预设名称，例如：前端专家"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="mb-4 w-full rounded-[var(--radius-md)] border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] p-3.5 text-sm text-[var(--oa-ink)] transition-all focus:border-[var(--oa-blue)] focus:outline-none focus:shadow-[var(--oa-control-focus-shadow)]"
                    />
                    <textarea
                      className="custom-scrollbar min-h-[14rem] w-full flex-1 resize-none rounded-[var(--radius-md)] border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] p-4 text-sm leading-relaxed text-[var(--oa-ink)] transition-all focus:border-[var(--oa-blue)] focus:outline-none focus:shadow-[var(--oa-control-focus-shadow)]"
                      placeholder="输入预设的提示词内容..."
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                    />
                    <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-3">
                      <button onClick={() => setEditingId(null)} className="rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-medium text-[var(--oa-muted)] transition-colors hover:bg-[var(--oa-paper-soft)] hover:text-[var(--oa-ink)]">
                        取消
                      </button>
                      <button onClick={submitPreset} className="flex items-center gap-2 rounded-[var(--radius-md)] [background:var(--oa-primary-gradient)] px-6 py-2.5 text-sm font-medium text-[#fffaf0] shadow-sm transition-all active:scale-95">
                        <Check size={16} />
                        保存预设
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-full flex-col animate-in fade-in">
                    <div className="mb-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="text-sm font-semibold text-[var(--oa-ink)]">
                        当前会话生效内容
                      </label>
                      <button onClick={handleCreatePreset} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--oa-blue)] transition-colors hover:bg-[var(--oa-red-soft-bg)]">
                        <Plus size={14} /> 存为新预设
                      </button>
                    </div>
                    <textarea
                      className="custom-scrollbar min-h-[14rem] w-full flex-1 resize-none rounded-[var(--radius-lg)] border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] p-5 text-[15px] leading-relaxed text-[var(--oa-ink)] shadow-inner transition-all focus:border-[var(--oa-blue)] focus:outline-none focus:shadow-[var(--oa-control-focus-shadow)]"
                      placeholder="默认无。在这里输入的内容，将会在每次发送消息时，追加到大模型的系统提示词最后。"
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                    />
                  </div>
                )}
              </div>
              
              {/* Footer */}
              {!editingId && (
                <div className="flex shrink-0 flex-col gap-3 border-t border-[var(--oa-card-head-border)] bg-[var(--oa-card-bg)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="text-xs text-[var(--oa-muted)]">
                    配置保存后立即对后续对话生效
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <button onClick={onClose} className="rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-medium text-[var(--oa-muted)] transition-colors hover:bg-[var(--oa-paper-soft)] hover:text-[var(--oa-ink)]">
                      取消
                    </button>
                    <button disabled={saving} onClick={handleSave} className="flex items-center gap-2 rounded-[var(--radius-md)] [background:var(--oa-primary-gradient)] px-6 py-2.5 text-sm font-medium text-[#fffaf0] shadow-sm transition-all active:scale-95 disabled:opacity-50">
                      <Check size={16} />
                      {saving ? "保存中..." : "应用配置"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
