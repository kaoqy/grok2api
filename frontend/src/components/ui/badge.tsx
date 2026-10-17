import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/lib/cn"

const badgeVariants = cva(
  "inline-flex h-5 items-center justify-center rounded-full border px-2 py-0 text-[11px] font-semibold leading-none shadow-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
  {
    variants: {
      variant: {
        default:
          "border-primary/30 bg-primary/12 text-primary",
        secondary:
          "border-border bg-secondary text-muted-foreground",
        destructive:
          "border-destructive/30 bg-destructive/12 text-destructive",
        outline: "border-border bg-card text-muted-foreground",
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
