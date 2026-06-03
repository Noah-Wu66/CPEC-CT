"use client";

import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Pencil,
  Pin,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import ConfirmModal from "./ConfirmModal";
import { ModelGlyph } from "./ModelVisuals";

function ConversationItem({
  conversation,
  active,
  editingId,
  editingTitle,
  editInputRef,
  activeActionsId,
  onLoadConversation,
  onRevealActions,
  onHideActions,
  onEditClick,
  onDeleteClick,
  onPinClick,
  onDuplicateClick,
  onEditingTitleChange,
  onHandleKeyDown,
  onHandleSaveEdit,
}) {
  return (
    <div
      onMouseEnter={() => onRevealActions(conversation._id)}
      onMouseLeave={() => onHideActions(conversation._id)}
      className="group relative"
    >
      {editingId === conversation._id ? (
        <div className="px-2 py-1">
          <input
            ref={editInputRef}
            type="text"
            value={editingTitle}
            onChange={(event) => onEditingTitleChange(event.target.value)}
            onKeyDown={onHandleKeyDown}
            onBlur={onHandleSaveEdit}
            className="w-full rounded-[var(--radius-md)] border border-[var(--ai-accent-soft-border)] bg-[var(--oa-card-bg)] px-4 py-3 text-sm font-medium text-foreground outline-none"
          />
        </div>
      ) : (
        <>
          <button
            onClick={() => onLoadConversation(conversation._id)}
            className={`ai-sidebar-item relative flex w-full items-center gap-3 overflow-hidden rounded-[var(--radius-md)] border px-3.5 py-3 text-left outline-none transition-all focus-visible:outline-none focus-visible:ring-0 ${
              active
                ? "ai-primary-soft text-foreground"
                : "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--ai-panel-border)] hover:bg-[var(--oa-paper-soft)] hover:text-foreground"
            }`}
            type="button"
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border transition-colors ${
              active
                ? "border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] text-[var(--ai-accent-strong)]"
                : "border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] text-[var(--text-secondary)]"
            }`}>
              <ModelGlyph model={conversation.model} size={18} />
            </span>
            <span className="min-w-0 flex-1 pr-32">
              <span className="block truncate text-sm font-semibold text-current">
                {conversation.title}
              </span>
            </span>
          </button>

          <div
            className={`absolute right-3 top-3 flex items-center gap-0.5 rounded-full border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] p-1 transition-all ${
              activeActionsId === conversation._id
                ? "opacity-100"
                : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
            }`}
          >
            <button
              onClick={(event) => onPinClick(conversation, event)}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                conversation.pinned ? "text-[var(--ai-accent-strong)] hover:bg-[var(--ai-accent-soft)]" : "text-[var(--text-secondary)] hover:bg-[var(--oa-paper-soft)]"
              }`}
              title={conversation.pinned ? "取消置顶" : "置顶"}
              type="button"
            >
              <Pin size={12} fill={conversation.pinned ? "currentColor" : "none"} />
            </button>
            <button
              onClick={(event) => onDuplicateClick(conversation, event)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--oa-paper-soft)]"
              title="复制"
              type="button"
            >
              <Copy size={12} />
            </button>
            <button
              onClick={(event) => onEditClick(conversation, event)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--oa-paper-soft)]"
              title="重命名"
              type="button"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={(event) => onDeleteClick(conversation, event)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--oa-red-soft-bg)] hover:text-[var(--oa-red)]"
              title="删除"
              type="button"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ConversationSection({
  title,
  conversations,
  currentConversationId,
  editingId,
  editingTitle,
  editInputRef,
  activeActionsId,
  onLoadConversation,
  onRevealActions,
  onHideActions,
  onEditClick,
  onDeleteClick,
  onPinClick,
  onDuplicateClick,
  onEditingTitleChange,
  onHandleKeyDown,
  onHandleSaveEdit,
}) {
  if (!Array.isArray(conversations) || conversations.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
        {title}
      </div>
      <div className="space-y-1">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation._id}
            conversation={conversation}
            active={currentConversationId === conversation._id}
            editingId={editingId}
            editingTitle={editingTitle}
            editInputRef={editInputRef}
            activeActionsId={activeActionsId}
            onLoadConversation={onLoadConversation}
            onRevealActions={onRevealActions}
            onHideActions={onHideActions}
            onEditClick={onEditClick}
            onDeleteClick={onDeleteClick}
            onPinClick={onPinClick}
            onDuplicateClick={onDuplicateClick}
            onEditingTitleChange={onEditingTitleChange}
            onHandleKeyDown={onHandleKeyDown}
            onHandleSaveEdit={onHandleSaveEdit}
          />
        ))}
      </div>
    </section>
  );
}

function SidebarPanel({
  conversations,
  currentConversationId,
  editingId,
  editingTitle,
  editInputRef,
  activeActionsId,
  onStartNewChat,
  onLoadConversation,
  onRenameConversation,
  onClose,
  onDuplicateConversation,
  setDeleteConfirm,
  setPinConfirm,
  setEditingId,
  setEditingTitle,
  setActiveActionsId,
  mobile = false,
}) {
  const pinnedConversations = conversations.filter((conversation) => conversation?.pinned);
  const recentConversations = conversations.filter((conversation) => !conversation?.pinned);
  const shouldCollapse = () => typeof window !== "undefined" && window.innerWidth < 1280;

  const handleDeleteClick = (conversation, event) => {
    event.stopPropagation();
    setDeleteConfirm({ open: true, id: conversation._id, title: conversation.title });
  };

  const handleEditClick = (conversation, event) => {
    event.stopPropagation();
    setEditingId(conversation._id);
    setEditingTitle(conversation.title);
  };

  const handlePinClick = (conversation, event) => {
    event.stopPropagation();
    const nextPinned = !conversation.pinned;
    setPinConfirm({ open: true, id: conversation._id, title: conversation.title, nextPinned });
  };

  const handleSaveEdit = () => {
    const trimmed = editingTitle.trim();
    const currentTitle = conversations.find((conversation) => conversation._id === editingId);
    if (trimmed && currentTitle && trimmed !== currentTitle.title) {
      onRenameConversation(editingId, trimmed);
    }
    setEditingId(null);
    setEditingTitle("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleLoadConversation = (conversationId) => {
    onLoadConversation(conversationId);
    if (shouldCollapse()) onClose?.();
  };

  const handleStartNewChat = () => {
    onStartNewChat();
    if (shouldCollapse()) onClose?.();
  };

  const handleDuplicateClick = async (conversation, event) => {
    event.stopPropagation();
    await onDuplicateConversation?.(conversation._id);
    if (shouldCollapse()) onClose?.();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSaveEdit();
    } else if (event.key === "Escape") {
      handleCancelEdit();
    }
  };

  return (
    <div className="ai-sidebar-panel flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--ai-panel-border)] bg-[var(--ai-shell-surface)]">
      <div className="ai-sidebar-summary border-b border-[var(--ai-panel-border)] px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          {mobile ? (
            <button
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--ai-panel-border)] bg-[var(--oa-card-bg)] text-[var(--text-secondary)] transition-colors hover:text-foreground"
              type="button"
              aria-label="关闭侧栏"
            >
              <X size={16} />
            </button>
          ) : null}

          <button
            onClick={handleStartNewChat}
            className="ai-primary-action inline-flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-3.5 text-sm font-semibold transition-colors"
            type="button"
          >
            <Plus size={16} />
            新建对话
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-4 custom-scrollbar">
        {conversations.length > 0 ? (
          <div className="space-y-4">
            {pinnedConversations.length > 0 ? (
              <ConversationSection
                title="置顶会话"
                conversations={pinnedConversations}
                currentConversationId={currentConversationId}
                editingId={editingId}
                editingTitle={editingTitle}
                editInputRef={editInputRef}
                activeActionsId={activeActionsId}
                onLoadConversation={handleLoadConversation}
                onRevealActions={setActiveActionsId}
                onHideActions={(id) => setActiveActionsId((current) => (current === id ? null : current))}
                onEditClick={handleEditClick}
                onDeleteClick={handleDeleteClick}
                onPinClick={handlePinClick}
                onDuplicateClick={handleDuplicateClick}
                onEditingTitleChange={setEditingTitle}
                onHandleKeyDown={handleKeyDown}
                onHandleSaveEdit={handleSaveEdit}
              />
            ) : null}

            <ConversationSection
              title={pinnedConversations.length > 0 ? "最近会话" : "全部会话"}
              conversations={recentConversations}
              currentConversationId={currentConversationId}
              editingId={editingId}
              editingTitle={editingTitle}
              editInputRef={editInputRef}
              activeActionsId={activeActionsId}
              onLoadConversation={handleLoadConversation}
              onRevealActions={setActiveActionsId}
              onHideActions={(id) => setActiveActionsId((current) => (current === id ? null : current))}
              onEditClick={handleEditClick}
              onDeleteClick={handleDeleteClick}
              onPinClick={handlePinClick}
              onDuplicateClick={handleDuplicateClick}
              onEditingTitleChange={setEditingTitle}
              onHandleKeyDown={handleKeyDown}
              onHandleSaveEdit={handleSaveEdit}
            />
          </div>
        ) : (
          <div className="flex items-start justify-center px-3 py-8">
            <div className="w-full rounded-[var(--radius-lg)] border border-dashed border-[var(--ai-panel-border)] bg-[var(--oa-card-bg)] px-4 py-6 text-center text-sm font-semibold text-foreground">
              暂无会话
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Sidebar({
  isOpen,
  conversations,
  currentConversationId,
  onStartNewChat,
  onLoadConversation,
  onDeleteConversation,
  onRenameConversation,
  onClose,
  onTogglePinConversation,
  onDuplicateConversation,
}) {
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, title: "" });
  const [pinConfirm, setPinConfirm] = useState({ open: false, id: null, title: "", nextPinned: false });
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [activeActionsId, setActiveActionsId] = useState(null);
  const editInputRef = useRef(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleConfirmDelete = async () => {
    try {
      if (deleteConfirm.id) {
        await onDeleteConversation(deleteConfirm.id);
      }
    } finally {
      setDeleteConfirm({ open: false, id: null, title: "" });
    }
  };

  const handleConfirmPin = async () => {
    try {
      if (pinConfirm.id) {
        await onTogglePinConversation(pinConfirm.id, pinConfirm.nextPinned);
      }
    } finally {
      setPinConfirm({ open: false, id: null, title: "", nextPinned: false });
    }
  };

  const panelProps = {
    conversations,
    currentConversationId,
    editingId,
    editingTitle,
    editInputRef,
    activeActionsId,
    onStartNewChat,
    onLoadConversation,
    onRenameConversation,
    onClose,
    onDuplicateConversation,
    setDeleteConfirm,
    setPinConfirm,
    setEditingId,
    setEditingTitle,
    setActiveActionsId,
  };

  return (
    <>
      <aside
        className={`fixed bottom-0 left-0 top-0 z-40 flex w-[360px] max-w-[92vw] p-3 transition-transform duration-300 xl:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarPanel {...panelProps} mobile />
      </aside>

      <aside className="hidden xl:block xl:w-[320px]">
        <div className="sticky top-20 h-[calc(100dvh-8.5rem)] min-h-[32rem] w-full">
          <SidebarPanel {...panelProps} />
        </div>
      </aside>

      <ConfirmModal
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, id: null, title: "" })}
        onConfirm={handleConfirmDelete}
        title="删除对话"
        message={`确定删除「${deleteConfirm.title}」吗？删除后会同步清理整段上下文。`}
        confirmText="删除"
        danger
      />
      <ConfirmModal
        open={pinConfirm.open}
        onClose={() => setPinConfirm({ open: false, id: null, title: "", nextPinned: false })}
        onConfirm={handleConfirmPin}
        title={pinConfirm.nextPinned ? "置顶对话" : "调整排序"}
        message={
          pinConfirm.nextPinned
            ? `「${pinConfirm.title}」会固定在列表上方。`
            : `「${pinConfirm.title}」会回到常规列表。`
        }
        confirmText={pinConfirm.nextPinned ? "置顶" : "确认"}
      />
    </>
  );
}
