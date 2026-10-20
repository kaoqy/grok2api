import { CircleCheck, CircleX, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AccountDTO } from "@/features/accounts/accounts-api";
import type { EgressNodeDTO, EgressScope } from "@/features/settings/settings-api";
import { cn } from "@/shared/lib/cn";

const scopeLabelKey: Record<EgressScope, string> = {
  grok_build: "models.providerGrokBuild",
  grok_web: "models.providerGrokWeb",
  grok_console: "console.name",
  grok_web_asset: "settings.egress.scopeWebAsset",
  grok_console_asset: "console.name",
};

// AccountEgressCell 展示账号实际绑定的 SOCKS 出口：节点名称 + 代理地址。
// 没有手工绑定时区分「自动分配」与「未绑定」，避免把自动调度误看成漏配。
export function AccountEgressCell({ account, node }: { account: AccountDTO; node?: EgressNodeDTO }) {
  const { t } = useTranslation();

  if (!node) {
    const label = account.egressAssignmentMode === "auto" ? t("accounts.egressAuto") : t("accounts.egressUnbound");
    return (
      <div className="flex min-h-9 min-w-0 flex-col justify-center gap-0.5">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Minus className="size-3.5 shrink-0" />
          {label}
        </span>
      </div>
    );
  }

  const scopeLabel = t(scopeLabelKey[node.scope] ?? "models.providerGrokBuild");
  const health = node.probeStatus === "healthy"
    ? { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400" }
    : node.probeStatus === "unhealthy"
      ? { icon: CircleX, className: "text-destructive" }
      : { icon: Minus, className: "text-muted-foreground" };
  const HealthIcon = health.icon;

  return (
    <div className="flex min-h-9 min-w-0 flex-col justify-center gap-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 truncate text-xs font-medium">{node.name}</span>
          </TooltipTrigger>
          <TooltipContent className="min-w-52 space-y-1 px-2.5 py-2">
            <p className="text-xs font-medium">{node.name}</p>
            <p className="text-xs text-primary-foreground/70">{scopeLabel}</p>
            {node.proxyDisplay ? <p className="break-all text-xs text-primary-foreground/70">{node.proxyDisplay}</p> : null}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} aria-label={t("settings.egress.health")} className="inline-flex cursor-help focus-visible:outline-none">
              <HealthIcon className={cn("size-3.5 shrink-0", health.className)} />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {node.probeStatus === "healthy"
              ? t("settings.egress.healthy")
              : node.probeStatus === "unhealthy"
                ? t("settings.egress.unhealthy")
                : t("settings.egress.notTested")}
          </TooltipContent>
        </Tooltip>
      </div>
      {node.proxyDisplay ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 truncate text-[11px] text-muted-foreground">{node.proxyDisplay}</span>
          </TooltipTrigger>
          <TooltipContent className="break-all">{node.proxyDisplay}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-[11px] text-muted-foreground">{t("accounts.egressDirect")}</span>
      )}
    </div>
  );
}
