import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-[var(--oa-red-soft-border)] bg-[var(--oa-red-soft-bg)] text-[var(--oa-red)]",
        secondary:
          "border-[var(--oa-card-border)] bg-[var(--oa-paper-soft)] text-[var(--oa-ink-2)]",
        destructive:
          "border-transparent [background:var(--oa-danger-gradient)] text-destructive-foreground",
        outline: "border-[var(--oa-card-border)] bg-[var(--oa-card-bg)] text-[var(--oa-muted)]",
        success:
          "border-[rgba(31,138,112,0.22)] bg-[rgba(31,138,112,0.08)] text-[var(--oa-green)]",
        warning:
          "border-[rgba(183,121,31,0.24)] bg-[rgba(183,121,31,0.1)] text-[var(--oa-gold)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
