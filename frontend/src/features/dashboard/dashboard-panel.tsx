import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

type DashboardPanelProps = {
  id: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function DashboardPanel({ id, title, actions, children, className, contentClassName }: DashboardPanelProps) {
  return (
    <section className={cn("rounded-2xl border bg-card px-5 py-[18px] shadow-panel", className)} aria-labelledby={id}>
      <header className="flex min-h-7 items-center justify-between gap-3">
        <h2 id={id} className="text-[13px] font-bold uppercase tracking-[0.6px] text-muted-foreground">{title}</h2>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className={cn("mt-4", contentClassName)}>{children}</div>
    </section>
  );
}
