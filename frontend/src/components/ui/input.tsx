import * as React from "react"

import { cn } from "@/shared/lib/cn"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-8 w-full rounded-lg border-2 border-border bg-card px-3 py-1 text-xs text-foreground transition-[border-color,background-color,box-shadow] outline-none file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-foreground focus-visible:border-foreground focus-visible:shadow-[2px_2px_0_0_var(--shadow-ink)] disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
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
