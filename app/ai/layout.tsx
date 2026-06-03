import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/layout/console-shell";
import { requirePageSession } from "@/lib/auth";
import "./ai.css";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

export default async function AiLayout({ children }: { children: ReactNode }) {
  const current = await requirePageSession();

  return (
    <ConsoleShell email={current.user.email} role={current.user.role}>
      <div className="ai-shell w-full">{children}</div>
    </ConsoleShell>
  );
}
