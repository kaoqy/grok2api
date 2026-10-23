import type { ReactNode } from "react";

// PageHeader 是所有页面统一的标题条：粗体标题 + 墨色分隔线，
// 让页面之间保持同一套版式节奏。
export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="flex min-h-8 shrink-0 flex-col gap-3 border-b-2 border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold leading-8 tracking-[-0.03em] text-foreground">{title}</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
