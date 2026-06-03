// ChatApp - 主聊天应用组件
"use client";
import { useEffect, useRef, useState } from "react";
import { createChatAppActions } from "@/lib/ai/client/chat/chatAppActions";
import { decorateConversationMessages, mergeConversationMessages } from "@/lib/ai/client/chat/conversationMessages";
import { useUserSettings } from "@/lib/ai/client/hooks/useUserSettings";
import { normalizeWebSearchSettings } from "@/lib/ai/shared/webSearch";
import {
  CHAT_MODELS,
  CHAT_RUNTIME_MODE_CHAT,
  DEFAULT_MODEL,
  isPrimaryChatModelId,
} from "@/lib/ai/shared/models";
import { useToast } from "./components/ToastProvider";
import ChatLayout from "./components/ChatLayout";

const FONT_SIZE_CLASSES = { small: "text-size-small", medium: "text-size-medium", large: "text-size-large" };

export default function ChatApp({ initialUser }) {
  const toast = useToast();
  const [user] = useState(initialUser);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const mediaResolution = "MEDIA_RESOLUTION_HIGH";
  const {
    model,
    isSettingsReady,
    setModel,
    setChatMode,
    thinkingLevels,
    historyLimit,
    maxTokens,
    webSearch,
    setWebSearch,
    chatSystemPrompt,
    setChatSystemPrompt,
    systemPrompts,
    addSystemPrompt,
    updateSystemPrompt,
    deleteSystemPrompt,
    fontSize,
    completionSoundVolume,
    settingsError,
    setSettingsError,
    fetchSettings,
    nickname,
  } = useUserSettings();
  const [editingMsgIndex, setEditingMsgIndex] = useState(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingImageAction, setEditingImageAction] = useState("keep");
  const [editingImage, setEditingImage] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [serverSettingsReady, setServerSettingsReady] = useState(false);

  const chatEndRef = useRef(null);
  const messageListRef = useRef(null);
  const userInterruptedRef = useRef(false);
  const wasStreamingRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const lastUserScrollAtRef = useRef(0);
  const scrollRafRef = useRef(0);
  const chatAbortRef = useRef(null);
  const chatRequestLockRef = useRef(false);
  const syncSettingsTimeoutRef = useRef(null);
  const pendingSettingsRef = useRef({});
  const pendingConversationIdRef = useRef(null);
  const hasRestoredConversationRef = useRef(false);
  const currentConversationIdRef = useRef(null);
  const isStreamingRef = useRef(false);
  const isStreaming = messages.some((message) => message?.isStreaming === true);
  isStreamingRef.current = isStreaming;
  const SCROLL_BOTTOM_THRESHOLD = 80;
  const lastSettingsErrorRef = useRef(null);

  useEffect(() => {
    if (settingsError && settingsError !== lastSettingsErrorRef.current) {
      toast.error(settingsError);
      lastSettingsErrorRef.current = settingsError;
    }
  }, [settingsError, toast]);

  const stopOngoingChatWork = () => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    chatRequestLockRef.current = false;
    userInterruptedRef.current = false;
    if (syncSettingsTimeoutRef.current) {
      clearTimeout(syncSettingsTimeoutRef.current);
      syncSettingsTimeoutRef.current = null;
    }
    pendingSettingsRef.current = {};
    pendingConversationIdRef.current = null;
    setLoading(false);
  };

  const handleAuthExpired = () => {
    stopOngoingChatWork();
    hasRestoredConversationRef.current = false;
    setServerSettingsReady(false);
    setConversations([]);
    setCurrentConversationId(null);
    setMessages([]);
    setSettingsError(null);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  const distanceToBottom = (el) => {
    if (!el) return 0;
    const top = Number.isFinite(el.scrollTop) ? el.scrollTop : 0;
    const height = Number.isFinite(el.clientHeight) ? el.clientHeight : 0;
    const scrollHeight = Number.isFinite(el.scrollHeight) ? el.scrollHeight : 0;
    return Math.max(0, scrollHeight - (top + height));
  };

  const isNearBottom = (el) => distanceToBottom(el) <= SCROLL_BOTTOM_THRESHOLD;

  const scrollToBottom = () => {
    const el = messageListRef.current;
    if (!el) return;
    const top = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = top;
  };

  const scheduleScrollToBottom = () => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      scrollToBottom();
    });
  };

  useEffect(() => {
    fetchConversations();
    Promise.resolve(fetchSettings()).finally(() => {
      setServerSettingsReady(true);
    });
  }, [fetchSettings]);

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
    if (typeof window === "undefined") return;
    if (currentConversationId) {
      window.localStorage.setItem("studio-current-conversation", currentConversationId);
      return;
    }
    window.localStorage.removeItem("studio-current-conversation");
  }, [currentConversationId]);

  useEffect(() => {
    if (!user || !serverSettingsReady || hasRestoredConversationRef.current || conversations.length === 0) return;
    hasRestoredConversationRef.current = true;
    if (typeof window === "undefined") return;
    const savedConversationId = window.localStorage.getItem("studio-current-conversation");
    if (!savedConversationId) return;
    const exists = conversations.some((conversation) => conversation?._id === savedConversationId);
    if (exists) {
      loadConversation(savedConversationId, { silent: true });
    }
  }, [conversations, serverSettingsReady, user]);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
      chatAbortRef.current = null;
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
      if (syncSettingsTimeoutRef.current) {
        clearTimeout(syncSettingsTimeoutRef.current);
        syncSettingsTimeoutRef.current = null;
      }
      pendingSettingsRef.current = {};
      pendingConversationIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!wasStreamingRef.current && isStreaming) {
      userInterruptedRef.current = false;
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    if (userInterruptedRef.current) return;
    // 等待 DOM/Markdown 渲染完毕后执行滚动，提升移动端键盘弹出时的体验稳定性
    scheduleScrollToBottom();
    if (!isStreaming) return;
    const t = setTimeout(() => {
      if (userInterruptedRef.current) return;
      scrollToBottom();
    }, 60);
    return () => clearTimeout(t);
  }, [messages, isStreaming]);

  const handleMessageListScroll = () => {
    const el = messageListRef.current;
    if (!el) return;

    // 更新滚动到底部按钮的显示状态
    setShowScrollButton(!isNearBottom(el));

    if (isStreaming) {
      const top = el.scrollTop;
      const last = lastScrollTopRef.current;
      lastScrollTopRef.current = top;
      if (isNearBottom(el)) {
        userInterruptedRef.current = false;
        return;
      }
      // 只在"用户真实手势导致的上滑"时才中断自动滚动，避免移动端键盘/地址栏/回流引起的误判
      const recentUserGesture = Date.now() - lastUserScrollAtRef.current < 800;
      const moved = Math.abs(top - last) > 2;
      if (recentUserGesture && moved) userInterruptedRef.current = true;
    }
  };

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    let touchStartY = 0;
    let touchStartScrollTop = 0;
    const markUserGesture = () => {
      lastUserScrollAtRef.current = Date.now();
    };
    // 记录触摸开始时的位置和滚动位置
    const handleTouchStart = (e) => {
      lastUserScrollAtRef.current = Date.now();
      touchStartY = e.touches?.[0]?.clientY;
      touchStartScrollTop = el.scrollTop;
    };
    // 移动端触摸滑动时：检测向上滑动意图（手指向下移动 = 内容向上滚动）
    const handleTouchMove = (e) => {
      lastUserScrollAtRef.current = Date.now();
      if (!isStreamingRef.current) return;
      const currentY = e.touches?.[0]?.clientY;
      const deltaY = currentY - touchStartY;
      // deltaY > 0 表示手指向下移动，即用户想向上滚动查看历史
      // 同时检测 scrollTop 是否减少或用户意图明显（移动超过 10px）
      if (deltaY > 10 || el.scrollTop < touchStartScrollTop - 5) {
        userInterruptedRef.current = true;
      }
    };
    // 电脑端滚轮向上滚动时，直接标记为用户中断
    const handleWheel = (e) => {
      lastUserScrollAtRef.current = Date.now();
      // deltaY < 0 表示向上滚动
      if (isStreamingRef.current && e.deltaY < 0) {
        userInterruptedRef.current = true;
      }
    };
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("wheel", handleWheel, { passive: true });
    el.addEventListener("mousedown", markUserGesture);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("mousedown", markUserGesture);
    };
  }, []);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => {
      if (!isStreamingRef.current) return;
      if (userInterruptedRef.current) return;
      scrollToBottom();
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applyConversationSettings = (rawSettings) => {
    const settings = rawSettings && typeof rawSettings === "object"
      ? rawSettings
      : {};
    setChatMode(CHAT_RUNTIME_MODE_CHAT);
    setWebSearch(normalizeWebSearchSettings(settings.webSearch, { defaultEnabled: true }));
  };

  const sortConversations = (list) => {
    if (!Array.isArray(list)) return [];
    return list.slice().sort((a, b) => {
      const ap = a?.pinned ? 1 : 0;
      const bp = b?.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;

      const at = new Date(a?.updatedAt || 0).getTime();
      const bt = new Date(b?.updatedAt || 0).getTime();
      return bt - at;
    });
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/ai/conversations");
      if (res.status === 401) {
        handleAuthExpired();
        return;
      }
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) return;
      let nextConversations = [];
      setConversations(() => {
        nextConversations = data?.conversations
          ? sortConversations(data.conversations)
          : [];
        return nextConversations;
      });
      if (currentConversationId && !nextConversations.some((conv) => conv._id === currentConversationId)) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    } catch (error) {
      toast.error(error?.message || "读取话题列表失败");
    }
  };

  const handleConversationMissing = () => {
    stopOngoingChatWork();
    setCurrentConversationId(null);
    setMessages([]);
    fetchConversations();
  };

  const actions = createChatAppActions({
    toast,
    messages,
    setMessages,
    loading,
    setLoading,
    model,
    thinkingLevels,
    mediaResolution,
    maxTokens,
    webSearch,
    chatSystemPrompt,
    historyLimit,
    currentConversationId,
    setCurrentConversationId,
    fetchConversations,
    chatAbortRef,
    chatRequestLockRef,
    userInterruptedRef,
    editingMsgIndex,
    editingContent,
    editingImageAction,
    editingImage,
    setEditingMsgIndex,
    setEditingContent,
    setEditingImageAction,
    setEditingImage,
    completionSoundVolume,
    onAuthExpired: handleAuthExpired,
    onConversationMissing: handleConversationMissing,
    onConversationActivity: () => {},
  });

  const persistConversationModel = async (conversationIdToUpdate, nextModel) => {
    if (!conversationIdToUpdate || !nextModel) return;
    try {
      await fetch(`/api/ai/conversations/${conversationIdToUpdate}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: nextModel }),
      });
      setConversations((prev) => prev.map((conversation) => (
        conversation?._id === conversationIdToUpdate
          ? { ...conversation, model: nextModel }
          : conversation
      )));
    } catch (error) {
      toast.error(error?.message || "保存模型选择失败");
    }
  };

  const loadConversation = async (id, options = {}) => {
    const silent = options?.silent === true;
    if (currentConversationIdRef.current && currentConversationIdRef.current !== id && isStreamingRef.current) {
      stopOngoingChatWork();
    }
    if (!silent) {
      setLoading(true);
      setMessages([]);
      if (window.innerWidth < 768) setSidebarOpen(false);
    }
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, { cache: "no-store" });
      if (res.status === 401) {
        handleAuthExpired();
        throw new Error("登录已过期，请重新登录");
      }
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (res.status === 404) {
        setConversations((prev) => prev.filter((conv) => conv._id !== id));
        if (currentConversationId === id) {
          setCurrentConversationId(null);
          setMessages([]);
        }
      }
      if (!res.ok) throw new Error(data?.error || "加载会话失败");
      if (data.conversation) {
        const conversation = data.conversation;
        if (silent && currentConversationIdRef.current && currentConversationIdRef.current !== id) {
          return;
        }
        userInterruptedRef.current = false;
        setMessages((prev) => {
          const serverMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
          return silent
            ? mergeConversationMessages(serverMessages, prev)
            : decorateConversationMessages(serverMessages);
        });
        setCurrentConversationId(id);

        const conversationModelConfig = CHAT_MODELS.find((entry) => entry.id === conversation.model);
        const targetModel = conversationModelConfig?.id || model;

        if (targetModel !== model) {
          setModel(targetModel);
        }

        applyConversationSettings(conversation.settings);
      }
    } catch (e) {
      if (!silent) {
        toast.error(`加载会话失败：${e?.message}`);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  // 同步对话参数到数据库（防抖，累积多个设置变更）
  const syncConversationSettings = (settingsUpdate) => {
    if (!currentConversationId) return;
    // 如果切换了对话，清空之前的待同步设置（避免跨对话污染）
    if (pendingConversationIdRef.current && pendingConversationIdRef.current !== currentConversationId) {
      pendingSettingsRef.current = {};
      if (syncSettingsTimeoutRef.current) {
        clearTimeout(syncSettingsTimeoutRef.current);
        syncSettingsTimeoutRef.current = null;
      }
    }
    pendingConversationIdRef.current = currentConversationId;
    // 累积设置变更，而不是只保留最后一个
    pendingSettingsRef.current = { ...pendingSettingsRef.current, ...settingsUpdate };
    if (syncSettingsTimeoutRef.current) clearTimeout(syncSettingsTimeoutRef.current);
    syncSettingsTimeoutRef.current = setTimeout(async () => {
      const toSync = pendingSettingsRef.current;
      const targetId = pendingConversationIdRef.current;
      pendingSettingsRef.current = {};
      pendingConversationIdRef.current = null;
      if (!targetId) return;
      try {
        await fetch(`/api/ai/conversations/${targetId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: toSync }),
        });
      } catch (error) {
        toast.error(error?.message || "保存话题设置失败");
      }
    }, 500);
  };

  const deleteConversation = async (id, e) => {
    e?.stopPropagation?.();
    try {
      await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c._id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    } catch (error) {
      toast.error(error?.message || "删除话题失败");
    }
  };

  const startNewChat = async () => {
    userInterruptedRef.current = false;
    stopOngoingChatWork();
    setCurrentConversationId(null);
    setMessages([]);
    if (!isPrimaryChatModelId(model)) {
      setModel(DEFAULT_MODEL);
    }
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const requestModelChange = (nextModel) => {
    if (loading || messages.some((m) => m.isStreaming)) return;

    setModel(nextModel);
    if (currentConversationId) {
      persistConversationModel(currentConversationId, nextModel);
    }
  };

  const renameConversation = async (id, newTitle) => {
    try {
      await fetch(`/api/ai/conversations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      setConversations((prev) =>
        prev.map((c) => (c._id === id ? { ...c, title: newTitle } : c))
      );
    } catch (error) {
      toast.error(error?.message || "重命名话题失败");
    }
  };

  const togglePinConversation = async (id, nextPinned) => {
    try {
      await fetch(`/api/ai/conversations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: nextPinned }),
      });
      setConversations((prev) => {
        const next = prev.map((c) =>
          c._id === id ? { ...c, pinned: nextPinned, updatedAt: new Date().toISOString() } : c
        );
        return sortConversations(next);
      });
    } catch (error) {
      toast.error(error?.message || "更新置顶状态失败");
    }
  };

  const buildDuplicateTitle = (title) => {
    const sourceTitle = typeof title === "string" && title.trim() ? title.trim() : "新对话";
    const baseTitle = `${sourceTitle}（副本）`;
    const existingTitles = new Set(
      conversations
        .map((conv) => (typeof conv?.title === "string" ? conv.title.trim() : ""))
        .filter(Boolean)
    );
    if (!existingTitles.has(baseTitle)) return baseTitle;

    let index = 2;
    while (existingTitles.has(`${sourceTitle}（副本 ${index}）`)) {
      index += 1;
    }
    return `${sourceTitle}（副本 ${index}）`;
  };

  const duplicateConversation = async (id) => {
    try {
      const sourceRes = await fetch(`/api/ai/conversations/${id}`);
      if (sourceRes.status === 401) {
        handleAuthExpired();
        return;
      }

      let sourceData = null;
      try {
        sourceData = await sourceRes.json();
      } catch {
        sourceData = null;
      }

      if (!sourceRes.ok) {
        throw new Error(sourceData?.error || "读取话题失败");
      }

      const sourceConversation = sourceData?.conversation;
      if (!sourceConversation) {
        throw new Error("未找到要复制的话题");
      }

      const createRes = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: buildDuplicateTitle(sourceConversation.title),
          model: sourceConversation.model,
          messages: Array.isArray(sourceConversation.messages) ? sourceConversation.messages : [],
          settings: sourceConversation.settings && typeof sourceConversation.settings === "object"
            ? sourceConversation.settings
            : undefined,
          pinned: false,
        }),
      });

      if (createRes.status === 401) {
        handleAuthExpired();
        return;
      }

      let createData = null;
      try {
        createData = await createRes.json();
      } catch {
        createData = null;
      }

      if (!createRes.ok) {
        throw new Error(createData?.error || "复制话题失败");
      }

      const duplicatedConversation = createData?.conversation;
      if (!duplicatedConversation?._id) {
        throw new Error("复制结果异常");
      }

      setCurrentConversationId(duplicatedConversation._id);
      setMessages(Array.isArray(duplicatedConversation.messages) ? duplicatedConversation.messages : []);

      const duplicatedModelConfig = CHAT_MODELS.find((entry) => entry.id === duplicatedConversation.model);
      if (duplicatedModelConfig?.id) {
        setModel(duplicatedModelConfig.id);
      }

      applyConversationSettings(duplicatedConversation.settings);

      await fetchConversations();
      toast.success("已复制话题");
      if (window.innerWidth < 768) setSidebarOpen(false);
    } catch (error) {
      toast.error(error?.message || "复制话题失败");
    }
  };

  return (
    <ChatLayout
      isSettingsReady={isSettingsReady}
      nickname={nickname}
      sidebarOpen={sidebarOpen}
      conversations={conversations}
      currentConversationId={currentConversationId}
      onStartNewChat={startNewChat}
      onLoadConversation={loadConversation}
      onDeleteConversation={deleteConversation}
      onRenameConversation={renameConversation}
      onTogglePinConversation={togglePinConversation}
      onDuplicateConversation={duplicateConversation}
      onCloseSidebar={() => setSidebarOpen(false)}
      onToggleSidebar={() => setSidebarOpen((v) => !v)}
      messages={messages}
      loading={loading}
      chatEndRef={chatEndRef}
      messageListRef={messageListRef}
      onMessageListScroll={handleMessageListScroll}
      showScrollButton={showScrollButton}
      onScrollToBottom={scrollToBottom}
      editingMsgIndex={editingMsgIndex}
      editingContent={editingContent}
      editingImageAction={editingImageAction}
      editingImage={editingImage}
      fontSizeClass={FONT_SIZE_CLASSES[fontSize]}
      onEditingContentChange={setEditingContent}
      onEditingImageSelect={actions.onEditingImageSelect}
      onEditingImageRemove={actions.onEditingImageRemove}
      onEditingImageKeep={actions.onEditingImageKeep}
      onCancelEdit={actions.cancelEdit}
      onSubmitEdit={actions.submitEditAndRegenerate}
      onCopy={actions.copyMessage}
      onDeleteModelMessage={actions.deleteModelMessage}
      onDeleteUserMessage={actions.deleteUserMessage}
      onRegenerateModelMessage={actions.regenerateModelMessage}
      onStartEdit={actions.startEdit}
      composerProps={{
        loading,
        isStreaming,
        isWaitingForAI: loading && messages.length > 0,
        model,
        modelReady: isSettingsReady,
        onModelChange: requestModelChange,
        messages,
        historyLimit,
        webSearch,
        setWebSearch: (v) => {
          setWebSearch(v);
          syncConversationSettings({ webSearch: v });
        },
        chatSystemPrompt,
        onChatSystemPromptSave: setChatSystemPrompt,
        systemPrompts,
        addSystemPrompt,
        updateSystemPrompt,
        deleteSystemPrompt,
        onSend: actions.handleSendFromComposer,
        onStop: actions.stopStreaming,
      }}
    />
  );
}
