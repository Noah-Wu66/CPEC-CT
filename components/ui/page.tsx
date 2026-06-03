import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "blue" | "cyan" | "green" | "gold" | "plum" | "red";

const toneClass: Record<Tone, string> = {
  blue: "!border-[rgba(29,79,115,0.2)] !bg-[rgba(29,79,115,0.08)] !text-[var(--oa-blue)]",
  cyan: "!border-[rgba(31,138,112,0.18)] !bg-[rgba(31,138,112,0.08)] !text-[var(--oa-green)]",
  green: "!border-[rgba(31,138,112,0.18)] !bg-[rgba(31,138,112,0.08)] !text-[var(--oa-green)]",
  gold: "!border-[rgba(183,121,31,0.2)] !bg-[rgba(183,121,31,0.09)] !text-[var(--oa-gold)]",
  plum: "!border-[rgba(104,79,119,0.18)] !bg-[rgba(104,79,119,0.08)] !text-[var(--ai-plum)]",
  red: "!border-[rgba(217,74,56,0.22)] !bg-[rgba(217,74,56,0.08)] !text-[var(--oa-red)]"
};

interface MetricCardProps {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  className?: string;
}

export function MetricCard({ label, value, description, icon, tone = "blue", className }: MetricCardProps) {
  return (
    <div className={cn("group rounded-[12px] border border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] p-4 shadow-[var(--oa-shadow-soft)] transition-all hover:-translate-y-0.5 hover:border-[var(--oa-red-soft-border)] hover:shadow-[var(--oa-shadow)]", className)}>
      <div className="flex items-start gap-3">
        {icon ? (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border shadow-[0_12px_22px_rgba(29,79,115,0.08)]", toneClass[tone])}>
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-bold text-[var(--oa-muted)]">{label}</p>
          <div className="mt-1 font-heading text-2xl font-extrabold leading-none text-[var(--oa-ink)]">{value}</div>
          {description ? <div className="mt-2 text-xs leading-5 text-[var(--oa-muted)]">{description}</div> : null}
        </div>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("empty-state", className)}>
      {icon ? <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[11px] border border-[var(--oa-card-border)] bg-[var(--oa-paper-soft)] text-[var(--oa-muted)]">{icon}</div> : null}
      <h3 className="font-heading text-lg font-bold text-[var(--oa-ink)]">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-6 text-[var(--oa-muted)]">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
