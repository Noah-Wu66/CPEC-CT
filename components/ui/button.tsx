import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] text-sm font-bold ring-offset-background transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px enabled:hover:-translate-y-0.5",
  {
    variants: {
      variant: {
        default: "border border-transparent [background:var(--oa-primary-gradient)] text-primary-foreground shadow-[0_10px_24px_rgba(29,79,115,0.18)] hover:shadow-[0_10px_20px_rgba(23,32,51,0.08)]",
        destructive: "border border-transparent [background:var(--oa-danger-gradient)] text-destructive-foreground shadow-sm hover:shadow-[0_10px_20px_rgba(23,32,51,0.08)]",
        outline: "border border-[var(--oa-control-border)] bg-[var(--oa-control-bg)] text-[var(--oa-ink)] hover:bg-[var(--oa-paper-soft)] hover:shadow-[0_10px_20px_rgba(23,32,51,0.08)]",
        secondary: "border border-[var(--oa-control-border)] bg-[var(--oa-paper-soft)] text-[var(--oa-ink)] hover:bg-[var(--oa-paper-soft)] hover:shadow-[0_10px_20px_rgba(23,32,51,0.08)]",
        ghost: "text-[var(--oa-ink-2)] hover:bg-[var(--oa-paper-soft)] hover:text-[var(--oa-ink)]",
        link: "text-[var(--oa-blue)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2 md:h-10",
        sm: "h-10 px-4 md:h-9 md:px-3",
        lg: "h-12 px-8 md:h-11",
        icon: "h-11 w-11 md:h-10 md:w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, children, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        className: cn(buttonVariants({ variant, size, className }), (children.props as Record<string, unknown>)?.className),
        ref,
        ...props,
      })
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
