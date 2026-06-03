"use client";

import {
  Menu,
} from "lucide-react";

export default function ChatHeader({
  onToggleSidebar,
  conversationTitle,
}) {
  return (
    <header className="ai-chat-header relative z-20 shrink-0 border-b border-[var(--ai-panel-border)] px-4 py-5 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <button
            onClick={onToggleSidebar}
            className="ai-control-chip inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] xl:hidden"
            type="button"
            aria-label="打开侧栏"
          >
            <Menu size={16} />
          </button>

          <div className="min-w-0">
            <div className="truncate font-heading text-2xl font-bold text-foreground">
              {conversationTitle}
            </div>
          </div>
        </div>

      </div>
    </header>
  );
}
