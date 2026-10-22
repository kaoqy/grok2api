import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/lib/cn"

const badgeVariants = cva(
  "inline-flex h-5 items-center justify-center rounded-md border-2 px-1.5 py-0 text-[11px] font-semibold leading-none shadow-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
  {
    variants: {
      variant: {
        default:
          "border-border bg-foreground text-background",
        secondary:
          "border-border bg-muted text-foreground",
        destructive:
          "border-foreground bg-background text-foreground underline decoration-2 underline-offset-2",
        outline:
          "border-border bg-card text-foreground",
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
