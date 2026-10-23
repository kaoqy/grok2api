import { RotateCcw } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EgressNodes } from "@/features/settings/egress-nodes";
import { ConfigBackupPanel } from "@/features/backup/config-backup-panel";
import { VersionUpdateSection } from "@/features/system/version-update";
import { isByteSizeUnit, isDurationUnit, MAX_ROUTING_ATTEMPTS, type ByteSizeValue, type DurationValue, UNLIMITED_ROUTING_ATTEMPTS } from "@/features/settings/settings-model";
import { useSettings } from "@/features/settings/use-settings";
import { ErrorState } from "@/shared/components/data-state";
import { cn } from "@/shared/lib/cn";

// 设置页只保留 2API 真正需要的两组参数：速率与并发、SOCKS 代理。
// 账号与 Provider 的专属调参已经从这里移走，账号状态统一在账号页处理。
export function SettingsPage() {
  const { t } = useTranslation();
  const { form, settingsQuery, updateMutation, reset } = useSettings();
  const [activeGroup, setActiveGroup] = useState("rate");
  const [unlimitedAttemptsConfirm, setUnlimitedAttemptsConfirm] = useState(false);
  const limitedRoutingAttemptsRef = useRef(3);
  const limitedVideoRoutingAttemptsRef = useRef(999);
  const dirtyCount = Object.keys(form.formState.dirtyFields).length;
  const s3Enabled = form.watch("media.s3.enabled");
  const s3SecretConfigured = form.watch("media.s3.secretKeyConfigured") || (form.watch("media.s3.secretKey") ?? "").length > 0;
  const s3SessionConfigured = form.watch("media.s3.sessionTokenConfigured") || (form.watch("media.s3.sessionToken") ?? "").length > 0;

  if (settingsQuery.isError) {
    return <ErrorState message={settingsQuery.error.message} onRetry={() => void settingsQuery.refetch()} />;
  }

  const snapshot = settingsQuery.data;
  const loading = settingsQuery.isPending;

  return (
    <form className="w-full space-y-5" onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))}>
      <header className="sticky top-14 z-30 -mx-2 flex min-h-12 items-center justify-between gap-3 border-b-2 border-border bg-background/95 px-2 py-2 backdrop-blur-md lg:z-40 lg:before:pointer-events-none lg:before:absolute lg:before:inset-x-0 lg:before:-top-[100vh] lg:before:h-[100vh] lg:before:bg-background lg:before:content-['']">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold leading-8 tracking-tight">{t("settings.title")}</h1>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t(`settings.groupDescriptions.${activeGroup}`)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="size-8" aria-label={t("common.reset")} disabled={loading || updateMutation.isPending || !form.formState.isDirty} onClick={reset}>
                <RotateCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("common.reset")}</TooltipContent>
          </Tooltip>
          <Button type="submit" size="sm" disabled={loading || updateMutation.isPending || !form.formState.isDirty}>
            {updateMutation.isPending ? <Spinner /> : null}{t("common.save")}
            {dirtyCount > 0 ? <span className="ml-1.5 rounded bg-background/25 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">{dirtyCount}</span> : null}
          </Button>
        </div>
      </header>

      {loading ? <div className="flex min-h-64 items-center justify-center"><Spinner /></div> : null}
      {snapshot ? (
        <Tabs value={activeGroup} onValueChange={setActiveGroup} className="flex min-w-0 flex-col gap-7 lg:flex-row lg:items-start">
          <TabsList className="flex h-auto w-full max-w-full shrink-0 justify-start gap-2 overflow-x-auto overscroll-x-contain bg-transparent p-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:sticky lg:top-[124px] lg:w-56 lg:flex-col lg:items-stretch lg:overflow-visible">
            <TabsTrigger className="h-9 w-auto shrink-0 justify-start rounded-lg px-3 text-xs data-[state=active]:font-bold lg:w-full" value="rate">{t("settings.groups.rate")}</TabsTrigger>
            <TabsTrigger className="h-9 w-auto shrink-0 justify-start rounded-lg px-3 text-xs data-[state=active]:font-bold lg:w-full" value="proxy">{t("settings.groups.proxy")}</TabsTrigger>
            <TabsTrigger className="h-9 w-auto shrink-0 justify-start rounded-lg px-3 text-xs data-[state=active]:font-bold lg:w-full" value="delivery">{t("settings.groups.delivery")}</TabsTrigger>
            <TabsTrigger className="h-9 w-auto shrink-0 justify-start rounded-lg px-3 text-xs data-[state=active]:font-bold lg:w-full" value="about">{t("settings.groups.about")}</TabsTrigger>
          </TabsList>

          <div className="min-w-0 flex-1">
          <SettingsPane value="rate">
          <SettingsSection title={t("settings.server.title")}>
            <div className="space-y-0">
              <SettingsField controlId="server-max-concurrent-requests" label={t("settings.server.maxConcurrentRequests")} description={t("settings.server.maxConcurrentRequestsHelp")} error={form.formState.errors.server?.maxConcurrentRequests?.message}>
                <Input id="server-max-concurrent-requests" type="number" min={1} max={100_000} {...form.register("server.maxConcurrentRequests", { valueAsNumber: true })} />
              </SettingsField>
            </div>
          </SettingsSection>

          <SettingsSection title={t("settings.clientKeys.title")}>
            <div className="space-y-0">
              <SettingsField controlId="client-key-default-rpm" label={t("settings.clientKeys.rpmLimit")} description={t("settings.clientKeys.rpmLimitHelp")} error={form.formState.errors.clientKeyDefaults?.rpmLimit?.message}><Input id="client-key-default-rpm" type="number" min={1} max={100_000} {...form.register("clientKeyDefaults.rpmLimit", { valueAsNumber: true })} /></SettingsField>
              <SettingsField controlId="client-key-default-concurrency" label={t("settings.clientKeys.maxConcurrent")} description={t("settings.clientKeys.maxConcurrentHelp")} error={form.formState.errors.clientKeyDefaults?.maxConcurrent?.message}><Input id="client-key-default-concurrency" type="number" min={1} max={1_024} {...form.register("clientKeyDefaults.maxConcurrent", { valueAsNumber: true })} /></SettingsField>
            </div>
          </SettingsSection>

          <SettingsSection title={t("settings.batch.title")}>
            <div className="space-y-0">
              <SettingsField controlId="batch-import-concurrency" label={t("settings.batch.importConcurrency")} description={t("settings.batch.importConcurrencyHelp")} error={form.formState.errors.batch?.importConcurrency?.message}><Input id="batch-import-concurrency" type="number" min={1} max={50} {...form.register("batch.importConcurrency", { valueAsNumber: true })} /></SettingsField>
              <SettingsField controlId="batch-conversion-concurrency" label={t("settings.batch.conversionConcurrency")} description={t("settings.batch.conversionConcurrencyHelp")} error={form.formState.errors.batch?.conversionConcurrency?.message}><Input id="batch-conversion-concurrency" type="number" min={1} max={50} {...form.register("batch.conversionConcurrency", { valueAsNumber: true })} /></SettingsField>
              <SettingsField controlId="batch-sync-concurrency" label={t("settings.batch.syncConcurrency")} description={t("settings.batch.syncConcurrencyHelp")} error={form.formState.errors.batch?.syncConcurrency?.message}><Input id="batch-sync-concurrency" type="number" min={1} max={50} {...form.register("batch.syncConcurrency", { valueAsNumber: true })} /></SettingsField>
              <SettingsField controlId="batch-refresh-concurrency" label={t("settings.batch.refreshConcurrency")} description={t("settings.batch.refreshConcurrencyHelp")} error={form.formState.errors.batch?.refreshConcurrency?.message}><Input id="batch-refresh-concurrency" type="number" min={1} max={50} {...form.register("batch.refreshConcurrency", { valueAsNumber: true })} /></SettingsField>
              <SettingsField controlId="batch-random-delay" label={t("settings.batch.randomDelay")} description={t("settings.batch.randomDelayHelp")} error={form.formState.errors.batch?.randomDelay?.message}><Input id="batch-random-delay" type="number" min={0} max={5_000} step={10} {...form.register("batch.randomDelay", { valueAsNumber: true })} /></SettingsField>
            </div>
          </SettingsSection>

          <SettingsSection title={t("settings.routing.title")}>
            <div className="space-y-0">
              <SettingsField controlId="routing-sticky-ttl" label={t("settings.routing.stickyTTL")} description={t("settings.routing.stickyTTLHelp")} error={form.formState.errors.routing?.stickyTTL?.message}><Controller control={form.control} name="routing.stickyTTL" render={({ field }) => <DurationInput id="routing-sticky-ttl" value={field.value} onChange={field.onChange} />} /></SettingsField>
              <SettingsField controlId="routing-cooldown-base" label={t("settings.routing.cooldownBase")} description={t("settings.routing.cooldownBaseHelp")} error={form.formState.errors.routing?.cooldownBase?.message}><Controller control={form.control} name="routing.cooldownBase" render={({ field }) => <DurationInput id="routing-cooldown-base" value={field.value} onChange={field.onChange} />} /></SettingsField>
              <SettingsField controlId="routing-cooldown-max" label={t("settings.routing.cooldownMax")} description={t("settings.routing.cooldownMaxHelp")} error={form.formState.errors.routing?.cooldownMax?.message}><Controller control={form.control} name="routing.cooldownMax" render={({ field }) => <DurationInput id="routing-cooldown-max" value={field.value} onChange={field.onChange} />} /></SettingsField>
              <SettingsField controlId="routing-capacity-wait" label={t("settings.routing.capacityWait", { defaultValue: "Saturated account wait" })} description={t("settings.routing.capacityWaitHelp")} error={form.formState.errors.routing?.capacityWait?.message}><Controller control={form.control} name="routing.capacityWait" render={({ field }) => <DurationInput id="routing-capacity-wait" value={field.value} onChange={field.onChange} />} /></SettingsField>
              <SettingsField controlId="routing-max-attempts" label={t("settings.routing.maxAttempts")} description={t("settingsRoutingAttempts.help")} error={form.formState.errors.routing?.maxAttempts?.message}>
                <Controller control={form.control} name="routing.maxAttempts" render={({ field }) => {
                  const unlimited = field.value === UNLIMITED_ROUTING_ATTEMPTS;
                  return (
                    <div className="flex h-9 items-center gap-3">
                      <Input
                        id="routing-max-attempts"
                        ref={field.ref}
                        name={field.name}
                        type="number"
                        min={1}
                        max={MAX_ROUTING_ATTEMPTS}
                        disabled={unlimited}
                        value={unlimited || !Number.isFinite(field.value) ? "" : field.value}
                        placeholder={t("settingsRoutingAttempts.unlimited")}
                        onBlur={field.onBlur}
                        onChange={(event) => field.onChange(event.currentTarget.valueAsNumber)}
                      />
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t("settingsRoutingAttempts.unlimited")}</span>
                        <Switch
                          id="routing-max-attempts-unlimited"
                          aria-label={t("settingsRoutingAttempts.unlimited")}
                          checked={unlimited}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              if (field.value > 0) limitedRoutingAttemptsRef.current = field.value;
                              setUnlimitedAttemptsConfirm(true);
                              return;
                            }
                            field.onChange(limitedRoutingAttemptsRef.current);
                          }}
                        />
                      </div>
                    </div>
                  );
                }} />
              </SettingsField>
              <SettingsField controlId="routing-video-max-attempts" label={t("settings.routing.videoMaxAttempts")} description={t("settings.routing.videoMaxAttemptsHelp")} error={form.formState.errors.routing?.videoMaxAttempts?.message}>
                <Controller control={form.control} name="routing.videoMaxAttempts" render={({ field }) => {
                  const unlimited = field.value === UNLIMITED_ROUTING_ATTEMPTS;
                  return (
                    <div className="flex h-9 items-center gap-3">
                      <Input
                        id="routing-video-max-attempts"
                        ref={field.ref}
                        name={field.name}
                        type="number"
                        min={1}
                        max={MAX_ROUTING_ATTEMPTS}
                        disabled={unlimited}
                        value={unlimited || !Number.isFinite(field.value) || field.value <= 0 ? "" : field.value}
                        placeholder={t("settingsRoutingAttempts.unlimited")}
                        onBlur={field.onBlur}
                        onChange={(event) => field.onChange(event.currentTarget.valueAsNumber)}
                      />
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t("settingsRoutingAttempts.unlimited")}</span>
                        <Switch
                          id="routing-video-max-attempts-unlimited"
                          aria-label={t("settingsRoutingAttempts.unlimited")}
                          checked={unlimited}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              if (field.value > 0) limitedVideoRoutingAttemptsRef.current = field.value;
                              field.onChange(UNLIMITED_ROUTING_ATTEMPTS);
                              return;
                            }
                            field.onChange(limitedVideoRoutingAttemptsRef.current);
                          }}
                        />
                      </div>
                    </div>
                  );
                }} />
              </SettingsField>
            </div>
            <AlertDialog open={unlimitedAttemptsConfirm} onOpenChange={setUnlimitedAttemptsConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("settingsRoutingAttempts.unlimitedTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("settingsRoutingAttempts.unlimitedDescription")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    className="border-2 border-border bg-foreground text-background hover:bg-foreground/90"
                    onClick={() => {
                      form.setValue("routing.maxAttempts", UNLIMITED_ROUTING_ATTEMPTS, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                      setUnlimitedAttemptsConfirm(false);
                    }}
                  >
                    {t("settingsRoutingAttempts.unlimitedConfirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </SettingsSection>
          </SettingsPane>

          <SettingsPane value="proxy">
          <EgressNodes title={t("settings.egress.title")} clearanceMode="manual" />
          </SettingsPane>

          <SettingsPane value="delivery">
          <SettingsSection title={t("settings.media.title")}>
            <div className="space-y-0">
              <SettingsField controlId="media-max-image-size" label={t("settings.media.maxImageSize")} description={t("settings.media.maxImageSizeHelp")} error={form.formState.errors.media?.maxImageSize?.message}>
                <Controller control={form.control} name="media.maxImageSize" render={({ field }) => <ByteSizeInput id="media-max-image-size" value={field.value} onChange={field.onChange} />} />
              </SettingsField>
              <SettingsField controlId="media-max-total-size" label={t("settings.media.maxTotalSize")} description={t("settings.media.maxTotalSizeHelp")} error={form.formState.errors.media?.maxTotalSize?.message}>
                <Controller control={form.control} name="media.maxTotalSize" render={({ field }) => <ByteSizeInput id="media-max-total-size" value={field.value} onChange={field.onChange} />} />
              </SettingsField>
              <SettingsField controlId="media-cleanup-threshold" label={t("settings.media.cleanupThresholdPercent")} description={t("settings.media.cleanupThresholdPercentHelp")} error={form.formState.errors.media?.cleanupThresholdPercent?.message}>
                <div className="flex min-w-0">
                  <Input id="media-cleanup-threshold" type="number" min={50} max={95} className="min-w-0 rounded-r-none" {...form.register("media.cleanupThresholdPercent", { valueAsNumber: true })} />
                  <div className="flex h-8 w-24 shrink-0 items-center justify-start rounded-r-md border-2 border-l-0 border-border bg-muted px-3 text-xs text-foreground">%</div>
                </div>
              </SettingsField>
              <SettingsField controlId="media-cleanup-interval" label={t("settings.media.cleanupInterval")} description={t("settings.media.cleanupIntervalHelp")} error={form.formState.errors.media?.cleanupInterval?.message}>
                <Controller control={form.control} name="media.cleanupInterval" render={({ field }) => <DurationInput id="media-cleanup-interval" value={field.value} onChange={field.onChange} />} />
              </SettingsField>
              <SettingsField controlId="frontend-public-api-base-url" label={t("settings.media.publicApiBaseURL")} description={t("settings.media.publicApiBaseURLHelp")} error={form.formState.errors.frontend?.publicApiBaseURL?.message} className="sm:col-span-2">
                <Input id="frontend-public-api-base-url" placeholder="https://api.example.com" {...form.register("frontend.publicApiBaseURL")} />
              </SettingsField>
            </div>
          </SettingsSection>

          <SettingsSection title={t("settings.media.s3Title")}>
            <div className="space-y-0">
              <SettingsField controlId="media-s3-enabled" label={t("settings.media.s3Enabled")} description={t("settings.media.s3EnabledHelp")}>
                <div className="flex min-w-0 items-center gap-2">
                  <Switch
                    id="media-s3-enabled"
                    aria-label={t("settings.media.s3Enabled")}
                    checked={s3Enabled}
                    onCheckedChange={(checked) => form.setValue("media.s3.enabled", checked, { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
                  />
                  <span className="text-xs text-muted-foreground">{s3Enabled ? t("settings.media.s3StateOn") : t("settings.media.s3StateOff")}</span>
                </div>
              </SettingsField>
              {s3Enabled ? (
                <>
                  <SettingsField controlId="media-s3-bucket" label={t("settings.media.s3Bucket")} description={t("settings.media.s3BucketHelp")} error={form.formState.errors.media?.s3?.bucket?.message}>
                    <Input id="media-s3-bucket" placeholder="grok2api-media" {...form.register("media.s3.bucket")} />
                  </SettingsField>
                  <SettingsField controlId="media-s3-region" label={t("settings.media.s3Region")} description={t("settings.media.s3RegionHelp")}>
                    <Input id="media-s3-region" placeholder="us-east-1" {...form.register("media.s3.region")} />
                  </SettingsField>
                  <SettingsField controlId="media-s3-endpoint" label={t("settings.media.s3Endpoint")} description={t("settings.media.s3EndpointHelp")}>
                    <Input id="media-s3-endpoint" placeholder="https://s3.us-east-1.amazonaws.com" {...form.register("media.s3.endpoint")} />
                  </SettingsField>
                  <SettingsField controlId="media-s3-access-key" label={t("settings.media.s3AccessKey")} description={t("settings.media.s3AccessKeyHelp")} error={form.formState.errors.media?.s3?.accessKey?.message}>
                    <Input id="media-s3-access-key" autoComplete="off" {...form.register("media.s3.accessKey")} />
                  </SettingsField>
                  <SettingsField controlId="media-s3-secret-key" label={t("settings.media.s3SecretKey")} description={t("settings.media.s3SecretKeyHelp")} badge={s3SecretConfigured ? t("settings.media.s3Configured") : undefined}>
                    <Input id="media-s3-secret-key" type="password" autoComplete="new-password" placeholder={s3SecretConfigured ? t("settings.media.s3KeepConfigured") : ""} {...form.register("media.s3.secretKey")} />
                  </SettingsField>
                  <SettingsField controlId="media-s3-session-token" label={t("settings.media.s3SessionToken")} description={t("settings.media.s3SessionTokenHelp")} badge={s3SessionConfigured ? t("settings.media.s3Configured") : undefined}>
                    <Input id="media-s3-session-token" type="password" autoComplete="new-password" placeholder={s3SessionConfigured ? t("settings.media.s3KeepConfigured") : ""} {...form.register("media.s3.sessionToken")} />
                  </SettingsField>
                  <SettingsField controlId="media-s3-prefix" label={t("settings.media.s3Prefix")} description={t("settings.media.s3PrefixHelp")}>
                    <Input id="media-s3-prefix" placeholder="grok2api" {...form.register("media.s3.prefix")} />
                  </SettingsField>
                  <SettingsField controlId="media-s3-path-style" label={t("settings.media.s3PathStyle")} description={t("settings.media.s3PathStyleHelp")}>
                    <div className="flex min-w-0 items-center gap-2">
                      <Switch
                        id="media-s3-path-style"
                        aria-label={t("settings.media.s3PathStyle")}
                        checked={form.watch("media.s3.pathStyle")}
                        onCheckedChange={(checked) => form.setValue("media.s3.pathStyle", checked, { shouldDirty: true, shouldTouch: true })}
                      />
                      <span className="text-xs text-muted-foreground">{form.watch("media.s3.pathStyle") ? t("settings.media.s3PathStyleOn") : t("settings.media.s3PathStyleOff")}</span>
                    </div>
                  </SettingsField>
                  <SettingsField controlId="media-s3-public-base-url" label={t("settings.media.s3PublicBaseURL")} description={t("settings.media.s3PublicBaseURLHelp")}>
                    <Input id="media-s3-public-base-url" placeholder="https://cdn.example.com" {...form.register("media.s3.publicBaseUrl")} />
                  </SettingsField>
                  <SettingsField controlId="media-s3-public-read" label={t("settings.media.s3PublicRead")} description={t("settings.media.s3PublicReadHelp")}>
                    <div className="flex min-w-0 items-center gap-2">
                      <Switch
                        id="media-s3-public-read"
                        aria-label={t("settings.media.s3PublicRead")}
                        checked={form.watch("media.s3.publicRead")}
                        onCheckedChange={(checked) => form.setValue("media.s3.publicRead", checked, { shouldDirty: true, shouldTouch: true })}
                      />
                      <span className="text-xs text-muted-foreground">{form.watch("media.s3.publicRead") ? t("settings.media.s3PathStyleOn") : t("settings.media.s3PathStyleOff")}</span>
                    </div>
                  </SettingsField>
                </>
              ) : null}
            </div>
          </SettingsSection>

          <SettingsSection title={t("settings.audit.retentionTitle")}>
            <div className="space-y-0">
              <SettingsField controlId="audit-retention-days" label={t("settings.audit.retentionDays")} description={t("settings.audit.retentionDaysHelp")} error={form.formState.errors.audit?.retentionDays?.message}>
                <Input id="audit-retention-days" type="number" min={0} max={365} {...form.register("audit.retentionDays", { valueAsNumber: true })} />
              </SettingsField>
              <SettingsField controlId="audit-buffer-size" label={t("settings.audit.bufferSize")} description={t("settings.audit.bufferSizeHelp")} badge={t("settings.restartRequired")} error={form.formState.errors.audit?.bufferSize?.message}>
                <Input id="audit-buffer-size" type="number" min={1} max={262_144} {...form.register("audit.bufferSize", { valueAsNumber: true })} />
              </SettingsField>
              <SettingsField controlId="audit-batch-size" label={t("settings.audit.batchSize")} description={t("settings.audit.batchSizeHelp")} error={form.formState.errors.audit?.batchSize?.message}>
                <Input id="audit-batch-size" type="number" min={1} max={4_096} {...form.register("audit.batchSize", { valueAsNumber: true })} />
              </SettingsField>
              <SettingsField controlId="audit-flush-interval" label={t("settings.audit.flushInterval")} description={t("settings.audit.flushIntervalHelp")} error={form.formState.errors.audit?.flushInterval?.message}>
                <Controller control={form.control} name="audit.flushInterval" render={({ field }) => <DurationInput id="audit-flush-interval" value={field.value} onChange={field.onChange} />} />
              </SettingsField>
              <SettingsField controlId="audit-commit-delay" label={t("settings.audit.commitDelay")} description={t("settings.audit.commitDelayHelp")} error={form.formState.errors.audit?.commitDelayMS?.message}>
                <Input id="audit-commit-delay" type="number" min={1} max={50} {...form.register("audit.commitDelayMS", { valueAsNumber: true })} />
              </SettingsField>
            </div>
          </SettingsSection>
          </SettingsPane>

          <SettingsPane value="about">
            <ConfigBackupPanel />
            <VersionUpdateSection />
          </SettingsPane>
          </div>
        </Tabs>
      ) : null}
    </form>
  );
}

function ByteSizeInput({ id, value, onChange }: { id: string; value?: ByteSizeValue; onChange: (value: ByteSizeValue) => void }) {
  const { t } = useTranslation();
  const unit = value?.unit ?? "MiB";
  return (
    <div className="flex min-w-0">
      <Input
        id={id}
        type="number"
        min="0.001"
        step="any"
        className="min-w-0 rounded-r-none"
        value={Number.isFinite(value?.value) ? value?.value : ""}
        onChange={(event) => onChange({ value: event.target.value === "" ? Number.NaN : Number(event.target.value), unit })}
      />
      <Select value={unit} onValueChange={(nextUnit) => { if (isByteSizeUnit(nextUnit)) onChange({ value: value?.value ?? 1, unit: nextUnit }); }}>
        <SelectTrigger className="w-24 shrink-0 rounded-l-none border-l-0 bg-muted" aria-label={t("settings.media.sizeUnit")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="MiB">MiB</SelectItem>
          <SelectItem value="GiB">GiB</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function DurationInput({ id, value, onChange, disabled }: { id: string; value?: DurationValue; onChange: (value: DurationValue) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const unit = value?.unit ?? "s";
  return (
    <div className="flex min-w-0">
      <Input
        id={id}
        type="number"
        min="0.001"
        step="any"
        disabled={disabled}
        className="min-w-0 rounded-r-none"
        value={Number.isFinite(value?.value) ? value?.value : ""}
        onChange={(event) => onChange({ value: event.target.value === "" ? Number.NaN : Number(event.target.value), unit })}
      />
      <Select value={unit} disabled={disabled} onValueChange={(nextUnit) => { if (isDurationUnit(nextUnit)) onChange({ value: value?.value ?? 1, unit: nextUnit }); }}>
        <SelectTrigger className="w-24 shrink-0 rounded-l-none border-l-0 bg-muted" aria-label={t("settings.durationUnit")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="s">{t("settings.units.seconds")}</SelectItem>
          <SelectItem value="m">{t("settings.units.minutes")}</SelectItem>
          <SelectItem value="h">{t("settings.units.hours")}</SelectItem>
          <SelectItem value="d">{t("settings.units.days")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function SettingsPane({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsContent value={value} forceMount className="m-0 space-y-8 data-[state=inactive]:hidden">
      {children}
    </TabsContent>
  );
}

function SettingsSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border-2 border-border bg-card px-5 py-[18px] shadow-float">
      <div className="flex min-h-7 items-center justify-between gap-3 pb-1">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-foreground">{title}</h2>
        {action}
      </div>
      <div className="min-w-0 w-full divide-y divide-border">{children}</div>
    </section>
  );
}

function SettingsField({ controlId, label, badge, description, error, className, children }: { controlId: string; label: string; badge?: string; description?: string; error?: string; className?: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className={cn("min-w-0 py-4", className)}>
      <div className="grid min-w-0 gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-center sm:gap-8">
        <div className="min-w-0">
          <div className="flex min-h-5 items-center gap-2">
            <Label htmlFor={controlId} className="text-xs font-semibold">{label}</Label>
            {badge ? <Badge variant="secondary" className="shrink-0 text-[10px]">{badge}</Badge> : null}
          </div>
          {description ? <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{description}</p> : null}
          {error ? <p className="mt-1 text-xs font-semibold text-destructive">{t("settings.invalidValue")}</p> : null}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
