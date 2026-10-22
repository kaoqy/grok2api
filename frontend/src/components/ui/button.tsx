import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/lib/cn"

// Buttons are stickers: a thick ink border with a hard offset shadow that
// collapses when the button is pressed.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-[background-color,border-color,color,box-shadow,transform] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-2 border-border bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--shadow-ink)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_var(--shadow-ink)]",
        destructive:
          "border-2 border-border bg-background text-foreground shadow-[3px_3px_0_0_var(--shadow-ink)] hover:bg-foreground hover:text-background hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_var(--shadow-ink)]",
        outline:
          "border-2 border-border bg-card text-foreground hover:bg-foreground hover:text-background",
        secondary:
          "border-2 border-border bg-muted text-foreground hover:bg-accent",
        ghost:
          "text-foreground hover:bg-accent",
        link:
          "text-foreground underline decoration-2 underline-offset-4 hover:bg-accent",
      },
      size: {
        default: "h-8 px-3.5 text-xs",
        sm: "h-7 px-2.5 text-[11px]",
        lg: "h-9 px-4 text-sm",
        icon: "size-8 rounded-lg text-xs",
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
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
