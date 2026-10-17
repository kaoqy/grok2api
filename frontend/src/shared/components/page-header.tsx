import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="flex min-h-8 shrink-0 flex-col gap-3 pb-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[17px] font-bold leading-6 tracking-normal text-foreground">{title}</h1>
        <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
