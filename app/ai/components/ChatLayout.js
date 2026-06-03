"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
} from "lucide-react";
import ChatHeader from "./ChatHeader";
import Composer from "./Composer";
import MessageList from "./MessageList";
import Sidebar from "./Sidebar";

export default function ChatLayout({
  isSettingsReady,
  nickname,
  sidebarOpen,
  conversations,
  currentConversationId,
  onStartNewChat,
  onLoadConversation,
  onDeleteConversation,
  onRenameConversation,
  onTogglePinConversation,
  onDuplicateConversation,
  onCloseSidebar,
  onToggleSidebar,
  messages,
  loading,
  chatEndRef,
  messageListRef,
  onMessageListScroll,
  showScrollButton,
  onScrollToBottom,
  editingMsgIndex,
  editingContent,
  editingImageAction,
  editingImage,
  fontSizeClass,
  onEditingContentChange,
  onEditingImageSelect,
  onEditingImageRemove,
  onEditingImageKeep,
  onCancelEdit,
  onSubmitEdit,
  onCopy,
  onDeleteModelMessage,
  onDeleteUserMessage,
  onRegenerateModelMessage,
  onStartEdit,
  composerProps,
}) {
  const activeConversation = conversations.find((conversation) => conversation?._id === currentConversationId) || null;
  const conversationTitle = typeof activeConversation?.title === "string" && activeConversation.title.trim()
    ? activeConversation.title.trim()
    : "新对话";

  return (
    <div className="app-root ai-app-shell flex min-h-full flex-col">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            className="fixed inset-0 z-30 bg-[rgba(23,32,51,0.42)] backdrop-blur-[2px] xl:hidden"
            onClick={onCloseSidebar}
            aria-label="关闭侧栏"
          />
        )}
      </AnimatePresence>

      <div className="ai-shell-frame">
        <div className="ai-workspace-grid">
          <Sidebar
            isOpen={sidebarOpen}
            conversations={conversations}
            currentConversationId={currentConversationId}
            onStartNewChat={onStartNewChat}
            onLoadConversation={onLoadConversation}
            onDeleteConversation={onDeleteConversation}
            onRenameConversation={onRenameConversation}
            onTogglePinConversation={onTogglePinConversation}
            onDuplicateConversation={onDuplicateConversation}
            onClose={onCloseSidebar}
          />

          <section className="ai-main-panel min-w-0">
            <div className="ai-chat-board flex h-[calc(var(--app-height)-8.5rem)] min-h-[32rem] flex-col">
              <ChatHeader
                onToggleSidebar={onToggleSidebar}
                conversationTitle={conversationTitle}
              />

              <main className="relative flex min-h-0 flex-1 flex-col rounded-b-[var(--radius-lg)]">
                <div className="ai-conversation-stage relative flex min-h-[14rem] flex-1 overflow-hidden">
                  <MessageList
                    messages={messages}
                    loading={loading}
                    chatEndRef={chatEndRef}
                    listRef={messageListRef}
                    onScroll={onMessageListScroll}
                    editingMsgIndex={editingMsgIndex}
                    editingContent={editingContent}
                    editingImageAction={editingImageAction}
                    editingImage={editingImage}
                    fontSizeClass={fontSizeClass}
                    model={composerProps?.model}
                    modelReady={isSettingsReady}
                    onEditingContentChange={onEditingContentChange}
                    onEditingImageSelect={onEditingImageSelect}
                    onEditingImageRemove={onEditingImageRemove}
                    onEditingImageKeep={onEditingImageKeep}
                    onCancelEdit={onCancelEdit}
                    onSubmitEdit={onSubmitEdit}
                    onCopy={onCopy}
                    onDeleteModelMessage={onDeleteModelMessage}
                    onDeleteUserMessage={onDeleteUserMessage}
                    onRegenerateModelMessage={onRegenerateModelMessage}
                    onStartEdit={onStartEdit}
                    userNickname={nickname}
                  />
                </div>

                <AnimatePresence>
                  {showScrollButton && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.84, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.84, y: 10 }}
                      transition={{ type: "spring", damping: 20, stiffness: 320 }}
                      onClick={onScrollToBottom}
                      className="absolute bottom-28 right-5 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ai-panel-border)] bg-[var(--oa-card-bg)] text-[var(--oa-muted)] transition-colors hover:text-[var(--oa-ink)] active:scale-95 md:right-7"
                      type="button"
                      aria-label="滚动到底部"
                    >
                      <ChevronDown size={20} />
                    </motion.button>
                  )}
                </AnimatePresence>

                <div className="composer-wrapper ai-composer-dock relative z-20 border-t border-[var(--ai-panel-border)] px-3 py-3 md:px-4 md:py-3">
                  <Composer {...composerProps} />
                </div>
              </main>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
