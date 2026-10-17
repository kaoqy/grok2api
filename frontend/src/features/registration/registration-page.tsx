import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Loader2, Play, Settings2, Square, Terminal, UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { getRegistrationLogs, getRegistrationSettings, getRegistrationStatus, startRegistration, stopRegistration, updateRegistrationSettings } from "@/features/registration/registration-api";
import type { RegistrationSettings } from "@/features/registration/registration-api";
import { listAllEgressNodes } from "@/features/settings/settings-api";
import { PageHeader } from "@/shared/components/page-header";
import { cn } from "@/shared/lib/cn";

export function RegistrationPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [count, setCount] = useState(1);
  const [proxyNodeId, setProxyNodeId] = useState("");

  const nodesQuery = useQuery({
    queryKey: ["egress-nodes", "registration-options"],
    // enabled 过滤值必须用 enabled/disabled，传 true 会被后端判为非法过滤条件。
    queryFn: () => listAllEgressNodes({ scope: "grok_build", enabled: "enabled" }),
  });
  const statusQuery = useQuery({
    queryKey: ["registration", "status"],
    queryFn: getRegistrationStatus,
    refetchInterval: (query) => (query.state.data?.running ? 2000 : 8000),
  });
  const logsQuery = useQuery({
    queryKey: ["registration", "logs"],
    queryFn: getRegistrationLogs,
    refetchInterval: statusQuery.data?.running ? 2000 : 8000,
  });
  const settingsQuery = useQuery({
    queryKey: ["registration", "settings"],
    queryFn: getRegistrationSettings,
  });
  const startMutation = useMutation({
    mutationFn: () => startRegistration(count, proxyNodeId),
    onSuccess: () => {
      toast.success(t("registration.started"));
      void queryClient.invalidateQueries({ queryKey: ["registration"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("errors.requestFailed")),
  });
  const stopMutation = useMutation({
    mutationFn: stopRegistration,
    onSuccess: () => {
      toast.success(t("registration.stopped"));
      void queryClient.invalidateQueries({ queryKey: ["registration"] });
    },
  });
  const status = statusQuery.data;
  const buildNodes = (nodesQuery.data?.items ?? []).filter((node) => node.scope === "grok_build");
  const nodes = buildNodes.filter((node) => node.enabled && node.proxyConfigured);
  const running = status?.running === true;
  const settings = settingsQuery.data;
  const moduleEnabled = settings?.enabled === true;
  const mailReady = settings?.mailReady === true;
  const canStart = moduleEnabled && !running && proxyNodeId !== "" && count >= 1 && count <= 20 && mailReady && !startMutation.isPending;
  const logs = logsQuery.data ?? [];

  return (
    <div className="w-full space-y-6">
      <PageHeader title={t("registration.title")} description={t("registration.description")} />

      {settings && !moduleEnabled ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/35 bg-amber-500/[0.07] px-4 py-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-foreground">{t("registration.moduleDisabledTitle")}</p>
            <p className="text-xs leading-5 text-muted-foreground">{t("registration.moduleDisabledDescription")}</p>
          </div>
        </div>
      ) : null}

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-5 rounded-2xl border bg-card px-5 py-[18px] shadow-panel">
          <header className="flex items-center gap-2 pb-1">
            <Play className="size-3.5 text-primary" />
            <h2 className="text-sm font-semibold">{t("registration.launchTitle")}</h2>
          </header>

          <div className="space-y-2">
            <Label htmlFor="registration-proxy">{t("registration.proxy")}</Label>
            <Select value={proxyNodeId} onValueChange={setProxyNodeId} disabled={running}>
              <SelectTrigger id="registration-proxy" className="w-full">
                <SelectValue placeholder={t("registration.proxyPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {nodes.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.name} · {node.proxyDisplay || node.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {nodesQuery.isError ? <p className="text-xs text-destructive">{t("registration.proxyQueryFailed")}</p> : null}
            {!nodesQuery.isPending && !nodesQuery.isError && nodes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {buildNodes.length === 0 ? t("registration.noProxyNodes") : t("registration.proxyMissingAddress")}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="registration-count">{t("registration.count")}</Label>
            <Input id="registration-count" type="number" min={1} max={20} value={count} disabled={running} onChange={(event) => setCount(Number(event.target.value))} />
            <p className="text-xs text-muted-foreground">{t("registration.countHelp")}</p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button className="flex-1" disabled={!canStart} onClick={() => startMutation.mutate()}>
              {startMutation.isPending ? <Loader2 className="animate-spin" /> : <Play />}
              {running ? t("registration.running") : t("registration.start")}
            </Button>
            <Button variant="outline" disabled={!running || stopMutation.isPending} onClick={() => stopMutation.mutate()}>
              <Square />
              {t("registration.stop")}
            </Button>
          </div>

          {settings ? (
            <RegistrationSettingsPanel
              key={`${settings.enabled}-${settings.autoEnabled}-${settings.dailyTarget}-${settings.mailBase}`}
              initial={settings}
              disabled={running}
              onSaved={() => void queryClient.invalidateQueries({ queryKey: ["registration"] })}
            />
          ) : (
            <div className="flex items-center justify-center border-t pt-6">
              <Spinner className="size-4" />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border bg-card px-5 py-[18px] shadow-panel">
            <div className="flex items-center gap-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", running ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground")}>
                {running ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {running ? t("registration.running") : t("registration.idle")}
                  {statusQuery.isFetching ? <Spinner className="size-3 text-muted-foreground" /> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{status?.lastMessage || t("registration.noActivity")}</p>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
              {[
                [t("registration.total"), status?.target ?? 0],
                [t("registration.success"), status?.success ?? 0],
                [t("registration.failed"), status?.failed ?? 0],
                [t("registration.converted"), status?.converted ?? 0],
                [t("registration.todayStarted"), status?.todayStarted ?? 0],
                [t("registration.todayConverted"), status?.todayConverted ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-card px-4 py-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1.5 text-xl font-semibold tabular-nums tracking-normal">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl border bg-card shadow-panel">
            <header className="flex items-center gap-2 border-b px-5 py-3.5">
              <Terminal className="size-3.5 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{t("registration.activityTitle")}</h2>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{t("registration.logLines", { count: logs.length })}</span>
            </header>
            <div className="max-h-[420px] min-h-[220px] overflow-y-auto bg-muted/25 px-4 py-3">
              {logs.length === 0 ? (
                <p className="py-16 text-center text-xs text-muted-foreground">{t("registration.noActivity")}</p>
              ) : (
                <div className="space-y-1">
                  {logs.slice(-200).map((line, index) => (
                    <p
                      key={`${index}-${line}`}
                      className={cn(
                        "whitespace-pre-wrap break-all font-mono text-[11px] leading-5",
                        line.startsWith("ERROR:") ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function RegistrationSettingsPanel({
  initial,
  disabled,
  onSaved,
}: {
  initial: RegistrationSettings;
  disabled: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [autoEnabled, setAutoEnabled] = useState(initial.autoEnabled);
  const [dailyTarget, setDailyTarget] = useState(initial.dailyTarget || 10);
  const [mailBase, setMailBase] = useState(initial.mailBase);
  const [mailToken, setMailToken] = useState(initial.mailToken);
  const [mailPath, setMailPath] = useState(initial.mailPath);
  const [mailDomains, setMailDomains] = useState(initial.mailDomains);
  const settingsMutation = useMutation({
    mutationFn: () => updateRegistrationSettings({
      enabled,
      autoEnabled,
      dailyTarget,
      mailBase: mailBase.trim(),
      mailToken: mailToken.trim(),
      mailPath: mailPath.trim(),
      mailDomains: mailDomains.trim(),
    }),
    onSuccess: () => {
      toast.success(t("registration.settingsSaved"));
      onSaved();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("errors.requestFailed")),
  });
  const mailComplete = mailBase.trim() !== "" && mailToken.trim() !== "" && mailDomains.trim() !== "";
  const mailPartial = !mailComplete && (mailBase.trim() !== "" || mailToken.trim() !== "" || mailDomains.trim() !== "");

  return (
    <div className="space-y-4 border-t pt-5">
      <header className="flex items-center gap-2">
        <Settings2 className="size-3.5 text-primary" />
        <h2 className="text-sm font-semibold">{t("registration.settingsTitle")}</h2>
      </header>

      <ToggleRow
        id="registration-enabled"
        title={t("registration.moduleTitle")}
        description={t("registration.moduleDescription")}
        checked={enabled}
        disabled={disabled}
        onChange={setEnabled}
      />

      <ToggleRow
        id="registration-auto"
        title={t("registration.autoTitle")}
        description={t("registration.autoDescription")}
        checked={autoEnabled}
        disabled={disabled || !enabled}
        onChange={setAutoEnabled}
      />

      <div className="space-y-2">
        <Label htmlFor="registration-daily-target">{t("registration.dailyTarget")}</Label>
        <Input
          id="registration-daily-target"
          type="number"
          min={0}
          max={2500}
          value={dailyTarget}
          disabled={disabled || !enabled || !autoEnabled}
          onChange={(event) => setDailyTarget(Number(event.target.value))}
        />
      </div>

      <div className="space-y-1 border-t pt-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{t("registration.mailTitle")}</p>
          {mailComplete ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
              <CheckCircle2 className="size-3" />{t("registration.mailReady")}
            </span>
          ) : null}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{t("registration.mailDescription")}</p>
      </div>

      <Field id="registration-mail-base" label={t("registration.mailBase")} help={t("registration.mailBaseHelp")}>
        <Input id="registration-mail-base" value={mailBase} disabled={disabled} placeholder="https://mail.example.com" onChange={(event) => setMailBase(event.target.value)} />
      </Field>
      <Field id="registration-mail-token" label={t("registration.mailToken")} help={t("registration.mailTokenHelp")}>
        <Input id="registration-mail-token" type="password" autoComplete="off" value={mailToken} disabled={disabled} onChange={(event) => setMailToken(event.target.value)} />
      </Field>
      <Field id="registration-mail-domains" label={t("registration.mailDomains")} help={t("registration.mailDomainsHelp")}>
        <Input id="registration-mail-domains" value={mailDomains} disabled={disabled} placeholder="example.com,mail.example.com" onChange={(event) => setMailDomains(event.target.value)} />
      </Field>
      <Field id="registration-mail-path" label={t("registration.mailPath")} help={t("registration.mailPathHelp")}>
        <Input id="registration-mail-path" value={mailPath} disabled={disabled} placeholder="/api/mails" onChange={(event) => setMailPath(event.target.value)} />
      </Field>

      {mailPartial ? <p className="text-xs text-destructive">{t("registration.mailPartial")}</p> : null}

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={disabled || settingsMutation.isPending || mailPartial}
        onClick={() => settingsMutation.mutate()}
      >
        {settingsMutation.isPending ? <Loader2 className="animate-spin" /> : null}
        {t("registration.saveSettings")}
      </Button>
    </div>
  );
}

function ToggleRow({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">{title}</Label>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

function Field({ id, label, help, children }: { id: string; label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}
