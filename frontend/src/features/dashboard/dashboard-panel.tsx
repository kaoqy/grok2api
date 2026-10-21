import type { ReactNode } from "react";

import { ConsolePanel } from "@/components/console/console";
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
    <ConsolePanel
      className={className}
      labelledBy={id}
      title={<span id={id}>{title}</span>}
      actions={actions}
      bodyClassName={cn("min-w-0", contentClassName)}
    >
      {children}
    </ConsolePanel>
  );
}
