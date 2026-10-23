import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/shared/lib/cn";

/**
 * Console primitives.
 *
 * The operator UI is a dense read-out rather than a set of marketing cards, so
 * everything here is built around a flat surface, a single hairline border and
 * a strict type scale. Colour only appears where it carries meaning.
 */

export type ConsoleTone = "neutral" | "primary" | "success" | "warn" | "danger" | "info";

// Tones are drawn with ink only: weight, border style and inversion separate
// the states instead of hue.
const toneSurface: Record<ConsoleTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-foreground text-background",
  success: "bg-foreground text-background",
  warn: "border-2 border-dashed border-foreground bg-background text-foreground",
  danger: "border-2 border-foreground bg-background text-foreground underline decoration-2 underline-offset-2",
  info: "bg-muted text-foreground",
};

export function ConsolePill({ tone = "neutral", children, className }: { tone?: ConsoleTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-md border-2 border-border px-1.5 text-[11px] font-semibold", toneSurface[tone], className)}>
      {children}
    </span>
  );
}

export function ConsoleStatusDot({ tone = "success", pulse = false }: { tone?: ConsoleTone; pulse?: boolean }) {
  const color = tone === "danger" ? "bg-foreground" : tone === "warn" ? "bg-foreground/50" : tone === "info" ? "bg-foreground/30" : "bg-foreground";
  return <span className={cn("size-1.5 shrink-0 rounded-full", color, pulse && "ink-pulse")} aria-hidden="true" />;
}

export function ConsolePanel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  labelledBy,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  labelledBy?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border-2 border-border bg-card shadow-float", className)} aria-labelledby={labelledBy}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-bold uppercase tracking-[0.06em] text-foreground">{title}</h2>
            {description ? <p className="mt-1 max-w-[70ch] text-xs leading-5 text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("min-w-0 p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function ConsoleStat({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
  loading = false,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: ConsoleTone;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-between gap-3 p-4", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? (
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md border-2 border-border", toneSurface[tone])}>
            <Icon className="size-3.5" strokeWidth={2.2} />
          </span>
        ) : null}
        <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      </div>
      <div className="min-w-0">
        {loading ? (
          <span className="flex h-7 items-center"><Spinner /></span>
        ) : (
          <p className="truncate font-mono text-[26px] leading-8 font-bold tracking-[-0.03em] text-foreground tabular-nums">{value}</p>
        )}
        {detail ? <p className="mt-1 min-w-0 truncate text-[11px] text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}

export function ConsoleKeyValue({ label, value, tone = "neutral" }: { label: ReactNode; value: ReactNode; tone?: ConsoleTone }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2">
      <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 truncate font-mono text-xs font-semibold tabular-nums", tone === "neutral" ? "text-foreground" : toneSurface[tone])}>{value}</span>
    </div>
  );
}

export function ConsoleEmpty({ icon: Icon, title, hint }: { icon?: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
      {Icon ? <Icon className="size-5 text-muted-foreground" strokeWidth={1.7} /> : null}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint ? <p className="max-w-[46ch] text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
