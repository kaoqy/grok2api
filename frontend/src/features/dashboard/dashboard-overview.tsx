import { Activity, CircleDollarSign, Gauge, UsersRound, WholeWord, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Pie, PieChart } from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Spinner } from "@/components/ui/spinner";
import type { DashboardDTO } from "@/features/dashboard/dashboard-api";
import { formatUSD, formatUSDValue } from "@/features/dashboard/dashboard-format";
import { DashboardPanel } from "@/features/dashboard/dashboard-panel";
import { cn } from "@/shared/lib/cn";
import { formatDuration, formatNumber } from "@/shared/lib/format";
import { usdTicksToValue } from "@/shared/lib/usd";

type DashboardDataProps = {
  dashboard?: DashboardDTO;
  locale: string;
  loading: boolean;
};

export function DashboardOverview({ dashboard, locale, loading }: DashboardDataProps) {
  const { t } = useTranslation();
  const resources = dashboard?.resources;
  const usage = dashboard?.usage;
  const cacheHitRate = (usage?.inputTokens ?? 0) > 0 ? (usage?.cachedInputTokens ?? 0) / (usage?.inputTokens ?? 1) * 100 : 0;
  const averageRequestCost = (usage?.requests ?? 0) > 0 ? usdTicksToValue(usage?.billedCostUsdTicks ?? 0) / (usage?.requests ?? 1) : 0;
  const hasFirstTokenSamples = (usage?.firstTokenSamples ?? 0) > 0;
  const hasThroughputSamples = (usage?.throughputSamples ?? 0) > 0;
  const performanceDetail = hasThroughputSamples
    ? t("audits.averageOutputSpeed", { speed: formatNumber(usage?.outputTokensPerSecond ?? 0, locale, 1), count: formatNumber(usage?.throughputSamples ?? 0, locale) })
    : t(hasFirstTokenSamples ? "audits.throughputPending" : "audits.performancePending");

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-panel)]" aria-label={t("dashboard.usage")}>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetric
          icon={UsersRound}
          label={t("accounts.buildAccountCount")}
          value={formatNumber(resources?.buildAccounts ?? 0, locale)}
          detail={t("dashboard.availableSummary", { active: formatNumber(resources?.activeBuildAccounts ?? 0, locale), total: formatNumber(resources?.buildAccounts ?? 0, locale) })}
          loading={loading}
        />
        <DashboardMetric
          icon={Activity}
          label={t("dashboard.requests")}
          value={formatNumber(usage?.requests ?? 0, locale)}
          detail={t("dashboard.requestSuccessRate", { rate: formatNumber(usage?.successRate ?? 0, locale, 1) })}
          loading={loading}
        />
        <DashboardMetric
          icon={WholeWord}
          label={t("dashboard.tokens")}
          value={formatNumber(usage?.tokens ?? 0, locale)}
          detail={t("dashboard.tokenEfficiency", { rate: formatNumber(cacheHitRate, locale, 1) })}
          loading={loading}
        />
        <DashboardMetric
          icon={CircleDollarSign}
          label={t("dashboard.billing")}
          value={formatUSD(usage?.billedCostUsdTicks ?? 0, locale)}
          detail={t("dashboard.averageRequestCost", { cost: formatUSDValue(averageRequestCost, locale) })}
          loading={loading}
        />
      </div>
      <div className="border-t border-border bg-secondary/55">
        <DashboardSecondaryMetric
          icon={Gauge}
          label={t("audits.averageFirstToken")}
          value={hasFirstTokenSamples ? formatDuration(usage?.averageFirstTokenMs ?? 0) : "—"}
          detail={performanceDetail}
          loading={loading}
        />
      </div>
    </section>
  );
}

export function DashboardResources({ dashboard, locale, loading }: DashboardDataProps) {
  const { t } = useTranslation();
  const resources = dashboard?.resources;
  const activeAccounts = resources?.activeBuildAccounts ?? 0;
  const totalAccounts = resources?.buildAccounts ?? 0;
  const unavailableAccounts = Math.max(0, totalAccounts - activeAccounts);
  const availability = totalAccounts > 0 ? activeAccounts / totalAccounts * 100 : 0;
  const chartConfig = {
    active: {
      label: t("dashboard.activeAccounts"),
      theme: { light: "oklch(0.68 0.14 160)", dark: "oklch(0.74 0.12 160)" },
    },
    unavailable: {
      label: t("dashboard.unavailableAccounts"),
      theme: { light: "oklch(0.88 0.01 250)", dark: "oklch(0.36 0.01 250)" },
    },
  } satisfies ChartConfig;
  const chartData = totalAccounts > 0 ? [
    { status: "active", value: activeAccounts, fill: "var(--color-active)" },
    { status: "unavailable", value: unavailableAccounts, fill: "var(--color-unavailable)" },
  ] : [
    { status: "unavailable", value: 1, fill: "var(--color-unavailable)" },
  ];

  return (
    <DashboardPanel
      id="dashboard-resources-title"
      title={t("dashboard.resourcesTitle")}
      className="flex h-full min-h-[360px] flex-col"
      contentClassName="flex flex-1"
    >
      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center"><Spinner className="size-5" /></div>
      ) : (
        <div className="grid min-h-[260px] w-full flex-1 grid-cols-[minmax(0,1fr)_minmax(128px,0.8fr)] items-center gap-4">
          <div className="relative mx-auto size-44 max-w-full">
            <ChartContainer config={chartConfig} className="size-full aspect-square" aria-label={t("dashboard.resourcesTitle")}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="status"
                  innerRadius={56}
                  outerRadius={78}
                  paddingAngle={activeAccounts > 0 && unavailableAccounts > 0 ? 3 : 0}
                  strokeWidth={0}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-medium tabular-nums">{formatNumber(availability, locale, 0)}%</span>
              <span className="mt-1 text-[10px] text-muted-foreground">{t("dashboard.availability")}</span>
            </div>
          </div>

          <div className="min-w-0 divide-y divide-border/60">
            <ResourceSummary
              color="bg-emerald-500"
              label={t("dashboard.activeAccounts")}
              value={formatNumber(activeAccounts, locale)}
              detail={t("dashboard.availableSummary", { active: formatNumber(activeAccounts, locale), total: formatNumber(totalAccounts, locale) })}
            />
            <ResourceSummary
              color="bg-muted-foreground/35"
              label={t("dashboard.unavailableAccounts")}
              value={formatNumber(unavailableAccounts, locale)}
              detail={t("dashboard.unavailableSummary", { unavailable: formatNumber(unavailableAccounts, locale), total: formatNumber(totalAccounts, locale) })}
            />
            <ResourceSummary
              color="bg-violet-500"
              label={t("dashboard.enabledModels")}
              value={formatNumber(resources?.enabledModels ?? 0, locale)}
              detail={t("dashboard.modelsAvailableSummary", { enabled: formatNumber(resources?.enabledModels ?? 0, locale), total: formatNumber(resources?.totalModels ?? 0, locale) })}
            />
            <ResourceSummary
              color="bg-sky-500"
              label={t("dashboard.activeClientKeys")}
              value={formatNumber(resources?.activeClientKeys ?? 0, locale)}
              detail={t("dashboard.keysAvailableSummary", { active: formatNumber(resources?.activeClientKeys ?? 0, locale), total: formatNumber(resources?.totalClientKeys ?? 0, locale) })}
            />
          </div>
        </div>
      )}
    </DashboardPanel>
  );
}

function DashboardMetric({ icon: Icon, label, value, detail, loading }: { icon: LucideIcon; label: string; value: string; detail: string; loading: boolean }) {
  return (
    <article className="group min-h-[126px] border-b border-border px-5 py-4 transition-colors even:bg-secondary/20 hover:bg-secondary/35 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(4n)]:border-r-0" aria-busy={loading}>
      <header className="flex min-h-5 items-center justify-between gap-3">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-secondary text-muted-foreground transition-colors group-hover:border-primary/20 group-hover:bg-accent group-hover:text-primary">
          <Icon className="size-3.5" />
        </span>
      </header>
      <div className="mt-3 flex min-h-9 items-center text-[28px] font-bold leading-9 tracking-normal tabular-nums">{loading ? <Spinner /> : value}</div>
      <p className={cn("mt-1 min-h-4 truncate text-[11px] text-muted-foreground", loading && "invisible")} title={detail}>{detail}</p>
    </article>
  );
}

function DashboardSecondaryMetric({ icon: Icon, label, value, detail, loading }: { icon: LucideIcon; label: string; value: string; detail: string; loading: boolean }) {
  return (
    <div className="flex min-h-[82px] items-center gap-3 px-5 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-[var(--shadow-panel)]">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className="mt-1 flex items-baseline gap-2 text-lg font-bold tabular-nums">
          {loading ? <Spinner className="size-4" /> : value}
          <span className="min-w-0 truncate text-[10px] font-normal text-muted-foreground">{detail}</span>
        </p>
      </div>
    </div>
  );
}

function ResourceSummary({ color, label, value, detail }: { color: string; label: string; value: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full", color)} />
        <div className="min-w-0">
          <p className="truncate text-xs">{label}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={detail}>{detail}</p>
        </div>
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}
