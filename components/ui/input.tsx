import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 md:h-10 w-full rounded-[var(--radius-md)] border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] px-3 py-2 text-base text-[var(--oa-ink)] shadow-sm ring-offset-background transition-all md:text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[var(--oa-muted)] hover:border-[var(--oa-control-hover-border)] hover:shadow-[var(--oa-control-hover-shadow)] focus-visible:border-[var(--oa-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(29,79,115,0.18)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-[var(--oa-paper-soft)] disabled:opacity-60",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
