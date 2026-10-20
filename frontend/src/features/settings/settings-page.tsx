import { RotateCcw, Sparkles } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { EgressNodes } from "@/features/settings/egress-nodes";
import { VersionUpdateSection } from "@/features/system/version-update";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isByteSizeUnit, isDurationUnit, MAX_ROUTING_ATTEMPTS, type ByteSizeValue, type DurationValue, UNLIMITED_ROUTING_ATTEMPTS } from "@/features/settings/settings-model";
import { useSettings } from "@/features/settings/use-settings";
import { ErrorState } from "@/shared/components/data-state";
import { cn } from "@/shared/lib/cn";

export function SettingsPage() {
  const { t } = useTranslation();
  const { form, settingsQuery, updateMutation, reset } = useSettings();
  const [activeGroup, setActiveGroup] = useState("build");
  const [autoCleanConfirm, setAutoCleanConfirm] = useState<"enabled" | "includeDisabled" | null>(null);
  const [unlimitedAttemptsConfirm, setUnlimitedAttemptsConfirm] = useState(false);
  const limitedRoutingAttemptsRef = useRef(3);
  const limitedVideoRoutingAttemptsRef = useRef(999);
  const autoCleanEnabled = form.watch("accounts.autoCleanReauthEnabled") === true;
  const buildForbiddenReauthEnabled = form.watch("accounts.markBuildForbiddenReauth") === true;
  const dirtyCount = Object.keys(form.formState.dirtyFields).length;

  if (settingsQuery.isError) {
    return <ErrorState message={settingsQuery.error.message} onRetry={() => void settingsQuery.refetch()} />;
  }

  const snapshot = settingsQuery.data;
  const loading = settingsQuery.isPending;
  const buildClientVersion = form.watch("providerBuild.clientVersion");
  const buildUserAgent = form.watch("providerBuild.userAgent");
  const recommendedBuild = snapshot?.recommendedProviderBuild;
  const recommendedBuildApplied = recommendedBuild != null
    && buildClientVersion === recommendedBuild.clientVersion
    && buildUserAgent === recommendedBuild.userAgent;
  const syncRecommendedBuild = () => {
    if (!recommendedBuild) return;
    form.setValue("providerBuild.clientVersion", recommendedBuild.clientVersion, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    form.setValue("providerBuild.userAgent", recommendedBuild.userAgent, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  };

  return (
    <form className="w-full space-y-5" onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))}>
      <header className="relative sticky top-14 z-30 -mx-2 flex min-h-12 items-center justify-between gap-3 bg-background/95 px-2 py-2 backdrop-blur-md lg:z-40 lg:before:pointer-events-none lg:before:absolute lg:before:inset-x-0 lg:before:-top-[100vh] lg:before:h-[100vh] lg:before:bg-background lg:before:content-['']">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.025em]">{t("settings.title")}</h1>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t(`settings.groupDescriptions.${activeGroup}`)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t("common.reset")} disabled={loading || updateMutation.isPending || !form.formState.isDirty} onClick={reset}>
                <RotateCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("common.reset")}</TooltipContent>
          </Tooltip>
          <Button type="submit" size="sm" disabled={loading || updateMutation.isPending || !form.formState.isDirty}>
            {updateMutation.isPending ? <Spinner /> : null}{t("common.save")}
            {dirtyCount > 0 ? <span className="ml-1.5 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">{dirtyCount}</span> : null}
          </Button>
        </div>
      </header>

      {loading ? <div className="flex min-h-64 items-center justify-center"><Spinner /></div> : null}
      {snapshot ? (
        <Tabs value={activeGroup} onValueChange={setActiveGroup} className="flex min-w-0 flex-col gap-7 lg:flex-row lg:items-start">
          <TabsList className="flex h-auto w-full max-w-full shrink-0 justify-start gap-1 overflow-x-auto overscroll-x-contain rounded-none bg-transparent p-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&>span]:rounded-md [&>span]:bg-muted/70 [&>span]:shadow-none lg:sticky lg:top-[124px] lg:w-56 lg:flex-col lg:items-stretch lg:overflow-visible">
            <TabsTrigger className="h-9 w-auto shrink-0 justify-start rounded-md px-3 text-xs data-[state=active]:font-medium lg:w-full" value="build">{t("models.providerGrokBuild")}</TabsTrigger>
            <TabsTrigger className="h-9 w-auto shrink-0 justify-start rounded-md px-3 text-xs data-[state=active]:font-medium lg:w-full" value="delivery">{t("settings.groups.delivery")}</TabsTrigger>
            <TabsTrigger className="h-9 w-auto shrink-0 justify-start rounded-md px-3 text-xs data-[state=active]:font-medium lg:w-full" value="policies">{t("settings.groups.policies")}</TabsTrigger>
            <TabsTrigger className="h-9 w-auto shrink-0 justify-start rounded-md px-3 text-xs data-[state=active]:font-medium lg:w-full" value="audit">{t("settings.audit.tabTitle")}</TabsTrigger>
            <TabsTrigger className="h-9 w-auto shrink-0 justify-start rounded-md px-3 text-xs data-[state=active]:font-medium lg:w-full" value="accounts">{t("settings.accounts.title")}</TabsTrigger>
            <TabsTrigger className="h-9 w-auto shrink-0 justify-start rounded-md px-3 text-xs data-[state=active]:font-medium lg:w-full" value="about">{t("updates.title")}</TabsTrigger>
          </TabsList>

          <div className="min-w-0 flex-1">
          <SettingsPane value="build">
          <SettingsSection
            title={t("models.providerGrokBuild")}
            action={recommendedBuild && !recommendedBuildApplied ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="secondary" size="sm" disabled={loading || updateMutation.isPending} onClick={syncRecommendedBuild}>
                    <Sparkles />{t("settings.provider.syncRecommendedVersion")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("settings.provider.syncRecommendedVersionDescription")}</TooltipContent>
              </Tooltip>
            ) : undefined}
          >
            <div className="space-y-0">
              <SettingsField controlId="provider-base-url" className="sm:col-span-2" label={t("settings.provider.baseURL")} description={t("settings.provider.baseURLHelp")} error={form.formState.errors.providerBuild?.baseURL?.message}><Input id="provider-base-url" {...form.register("providerBuild.baseURL")} /></SettingsField>
              <SettingsField controlId="provider-fallback-base-url" className="sm:col-span-2" label={t("settings.provider.fallbackBaseURL")} description={t("settings.provider.fallbackBaseURLHelp")} error={form.formState.errors.providerBuild?.fallbackBaseURL?.message}><Input id="provider-fallback-base-url" {...form.register("providerBuild.fallbackBaseURL")} /></SettingsField>
              <SettingsField controlId="provider-client-version" label={t("settings.provider.clientVersion")} description={t("settings.provider.clientVersionHelp")} badge={recommendedBuild ? t("settings.provider.recommendedVersion", { version: recommendedBuild.clientVersion }) : undefined} error={form.formState.errors.providerBuild?.clientVersion?.message}><Input id="provider-client-version" {...form.register("providerBuild.clientVersion")} /></SettingsField>
              <SettingsField controlId="provider-client-identifier" label={t("settings.provider.clientIdentifier")} description={t("settings.provider.clientIdentifierHelp")} error={form.formState.errors.providerBuild?.clientIdentifier?.message}><Input id="provider-client-identifier" {...form.register("providerBuild.clientIdentifier")} /></SettingsField>
              <SettingsField controlId="provider-token-auth" label={t("settings.provider.tokenAuth")} description={t("settings.provider.tokenAuthHelp")} error={form.formState.errors.providerBuild?.tokenAuth?.message}><Input id="provider-token-auth" autoComplete="off" {...form.register("providerBuild.tokenAuth")} /></SettingsField>
              <SettingsField controlId="provider-user-agent" label={t("settings.provider.userAgent")} description={t("settings.provider.userAgentHelp")} error={form.formState.errors.providerBuild?.userAgent?.message}><Input id="provider-user-agent" {...form.register("providerBuild.userAgent")} /></SettingsField>
              <SettingsField controlId="provider-response-header-timeout" label={t("settingsBuildTransport.responseHeaderTimeout")} description={t("settingsBuildTransport.responseHeaderTimeoutHelp")} error={form.formState.errors.providerBuild?.responseHeaderTimeout?.message}><Controller control={form.control} name="providerBuild.responseHeaderTimeout" render={({ field }) => <DurationInput id="provider-response-header-timeout" value={field.value} onChange={field.onChange} />} /></SettingsField>
              <SettingsField controlId="provider-stream-idle-timeout" label={t("settingsBuildTransport.streamIdleTimeout")} description={t("settingsBuildTransport.streamIdleTimeoutHelp")} error={form.formState.errors.providerBuild?.streamIdleTimeout?.message}><Controller control={form.control} name="providerBuild.streamIdleTimeout" render={({ field }) => <DurationInput id="provider-stream-idle-timeout" value={field.value} onChange={field.onChange} />} /></SettingsField>
            </div>
          </SettingsSection>
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
                  <div className="flex h-8 w-24 shrink-0 items-center justify-start rounded-r-md bg-secondary/55 px-3 text-xs text-foreground">%</div>
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

          {/* Build 通道不走 Cloudflare Clearance，Web/Console 专用配置已移除。 */}
          <EgressNodes title={t("settings.egress.title")} clearanceMode="manual" />
          </SettingsPane>

          <SettingsPane value="policies">
          <SettingsSection title={t("settings.server.title")}>
            <div className="space-y-0">
              <SettingsField controlId="server-max-concurrent-requests" label={t("settings.server.maxConcurrentRequests")} description={t("settings.server.maxConcurrentRequestsHelp")} error={form.formState.errors.server?.maxConcurrentRequests?.message}>
                <Input id="server-max-concurrent-requests" type="number" min={1} max={100_000} {...form.register("server.maxConcurrentRequests", { valueAsNumber: true })} />
              </SettingsField>
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
              <SettingsField controlId="routing-prefer-free-build" label={t("settings.routing.preferFreeBuild")} description={t("settings.routing.preferFreeBuildHelp")}><Controller control={form.control} name="routing.preferFreeBuild" render={({ field }) => <div className="flex h-9 items-center"><Switch id="routing-prefer-free-build" checked={field.value} onCheckedChange={field.onChange} /></div>} /></SettingsField>
              <SettingsField controlId="routing-mark-build-chat-denied-as-reauth" label={t("settings.routing.markBuildChatDeniedAsReauth")} description={t("settings.routing.markBuildChatDeniedAsReauthHelp")}><Controller control={form.control} name="routing.markBuildChatDeniedAsReauth" render={({ field }) => <div className="flex h-9 items-center"><Switch id="routing-mark-build-chat-denied-as-reauth" checked={field.value} onCheckedChange={field.onChange} /></div>} /></SettingsField>
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
                    className="bg-destructive text-white hover:bg-destructive/90"
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

          <SettingsSection title={t("settings.clientKeys.title")}>
            <div className="space-y-0">
              <SettingsField controlId="client-key-default-rpm" label={t("settings.clientKeys.rpmLimit")} description={t("settings.clientKeys.rpmLimitHelp")} error={form.formState.errors.clientKeyDefaults?.rpmLimit?.message}><Input id="client-key-default-rpm" type="number" min={1} max={100_000} {...form.register("clientKeyDefaults.rpmLimit", { valueAsNumber: true })} /></SettingsField>
              <SettingsField controlId="client-key-default-concurrency" label={t("settings.clientKeys.maxConcurrent")} description={t("settings.clientKeys.maxConcurrentHelp")} error={form.formState.errors.clientKeyDefaults?.maxConcurrent?.message}><Input id="client-key-default-concurrency" type="number" min={1} max={1_024} {...form.register("clientKeyDefaults.maxConcurrent", { valueAsNumber: true })} /></SettingsField>
            </div>
          </SettingsSection>
          </SettingsPane>

          <SettingsPane value="audit">
            <SettingsSection title={t("settings.audit.retentionTitle")}>
              <div className="space-y-0">
                <SettingsField
                  controlId="audit-retention-days"
                  label={t("settings.audit.retentionDays")}
                  description={t("settings.audit.retentionDaysHelp")}
                  error={form.formState.errors.audit?.retentionDays?.message}
                >
                  <Input
                    id="audit-retention-days"
                    type="number"
                    min={0}
                    max={365}
                    {...form.register("audit.retentionDays", { valueAsNumber: true })}
                  />
                </SettingsField>

              </div>
            </SettingsSection>

            <SettingsSection title={t("settings.audit.performanceTitle")}>
              <div className="space-y-0">
                <SettingsField
                  controlId="audit-buffer-size"
                  label={t("settings.audit.bufferSize")}
                  description={t("settings.audit.bufferSizeHelp")}
                  badge={t("settings.restartRequired")}
                  error={form.formState.errors.audit?.bufferSize?.message}
                >
                  <Input
                    id="audit-buffer-size"
                    type="number"
                    min={1}
                    max={262_144}
                    {...form.register("audit.bufferSize", { valueAsNumber: true })}
                  />
                </SettingsField>
                <SettingsField
                  controlId="audit-batch-size"
                  label={t("settings.audit.batchSize")}
                  description={t("settings.audit.batchSizeHelp")}
                  error={form.formState.errors.audit?.batchSize?.message}
                >
                  <Input
                    id="audit-batch-size"
                    type="number"
                    min={1}
                    max={4_096}
                    {...form.register("audit.batchSize", { valueAsNumber: true })}
                  />
                </SettingsField>
                <SettingsField
                  controlId="audit-flush-interval"
                  label={t("settings.audit.flushInterval")}
                  description={t("settings.audit.flushIntervalHelp")}
                  error={form.formState.errors.audit?.flushInterval?.message}
                >
                  <Controller
                    control={form.control}
                    name="audit.flushInterval"
                    render={({ field }) => (
                      <DurationInput id="audit-flush-interval" value={field.value} onChange={field.onChange} />
                    )}
                  />
                </SettingsField>
                <SettingsField
                  controlId="audit-commit-delay"
                  label={t("settings.audit.commitDelay")}
                  description={t("settings.audit.commitDelayHelp")}
                  error={form.formState.errors.audit?.commitDelayMS?.message}
                >
                  <Input
                    id="audit-commit-delay"
                    type="number"
                    min={1}
                    max={50}
                    {...form.register("audit.commitDelayMS", { valueAsNumber: true })}
                  />
                </SettingsField>
              </div>
            </SettingsSection>
          </SettingsPane>

          <SettingsPane value="accounts">
            <SettingsSection title={t("settings.accounts.invalidationTitle")}>
              <div className="space-y-0">
                <SettingsField controlId="accounts-mark-build-forbidden-reauth" label={t("settingsBuildForbidden.markInvalid")} description={t("settingsBuildForbidden.markInvalidHelp")}>
                  <Controller control={form.control} name="accounts.markBuildForbiddenReauth" render={({ field }) => (
                    <div className="flex h-9 items-center">
                      <Switch id="accounts-mark-build-forbidden-reauth" checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </div>
                  )} />
                </SettingsField>
                <SettingsField
                  controlId="accounts-build-forbidden-reauth-codes"
                  className="sm:col-span-2"
                  label={t("settingsBuildForbidden.codes")}
                  description={t("settingsBuildForbidden.codesHelp")}
                  error={form.formState.errors.accounts?.buildForbiddenReauthCodes ? t("settingsBuildForbidden.codesInvalid") : undefined}
                >
                  <Textarea
                    id="accounts-build-forbidden-reauth-codes"
                    className="min-h-24 font-mono"
                    disabled={!buildForbiddenReauthEnabled}
                    placeholder={t("settingsBuildForbidden.codesPlaceholder")}
                    {...form.register("accounts.buildForbiddenReauthCodes")}
                  />
                </SettingsField>
              </div>
            </SettingsSection>

            <SettingsSection title={t("settings.accounts.botRiskSchedulingTitle")}>
              <div className="space-y-0">
                <SettingsField
                  controlId="accounts-exclude-build-bot-flagged"
                  label={t("settings.accounts.excludeBuildBotFlaggedFromScheduling")}
                  description={t("settings.accounts.excludeBuildBotFlaggedFromSchedulingHelp")}
                >
                  <Controller
                    control={form.control}
                    name="accounts.excludeBuildBotFlaggedFromScheduling"
                    render={({ field }) => (
                      <div className="flex h-9 items-center">
                        <Switch
                          id="accounts-exclude-build-bot-flagged"
                          checked={Boolean(field.value)}
                          onCheckedChange={field.onChange}
                        />
                      </div>
                    )}
                  />
                </SettingsField>
              </div>
            </SettingsSection>

            <SettingsSection title={t("settings.accounts.cleanupTitle")}>
              <div className="space-y-0">
                <SettingsField controlId="accounts-auto-clean-reauth-enabled" label={t("settings.accounts.autoCleanReauthEnabled")} description={t("settings.accounts.autoCleanReauthEnabledHelp")}>
                  <Controller control={form.control} name="accounts.autoCleanReauthEnabled" render={({ field }) => (
                    <div className="flex h-9 items-center">
                      <Switch
                        id="accounts-auto-clean-reauth-enabled"
                        checked={Boolean(field.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setAutoCleanConfirm("enabled");
                            return;
                          }
                          field.onChange(false);
                          form.setValue("accounts.autoCleanIncludeDisabled", false, { shouldDirty: true, shouldTouch: true });
                        }}
                      />
                    </div>
                  )} />
                </SettingsField>
                <SettingsField controlId="accounts-auto-clean-reauth-interval" label={t("settings.accounts.autoCleanReauthInterval")} description={t("settings.accounts.autoCleanReauthIntervalHelp")} error={form.formState.errors.accounts?.autoCleanReauthInterval?.message}>
                  <Controller control={form.control} name="accounts.autoCleanReauthInterval" render={({ field }) => (
                    <DurationInput id="accounts-auto-clean-reauth-interval" value={field.value} onChange={field.onChange} disabled={!autoCleanEnabled} />
                  )} />
                </SettingsField>
                <SettingsField controlId="accounts-auto-clean-reauth-min-age" label={t("settings.accounts.autoCleanReauthMinAge")} description={t("settings.accounts.autoCleanReauthMinAgeHelp")} error={form.formState.errors.accounts?.autoCleanReauthMinAge?.message}>
                  <Controller control={form.control} name="accounts.autoCleanReauthMinAge" render={({ field }) => (
                    <DurationInput id="accounts-auto-clean-reauth-min-age" value={field.value} onChange={field.onChange} disabled={!autoCleanEnabled} />
                  )} />
                </SettingsField>
                <SettingsField controlId="accounts-auto-clean-include-disabled" label={t("settings.accounts.autoCleanIncludeDisabled")} description={t("settings.accounts.autoCleanIncludeDisabledHelp")}>
                  <Controller control={form.control} name="accounts.autoCleanIncludeDisabled" render={({ field }) => (
                    <div className="flex h-9 items-center">
                      <Switch
                        id="accounts-auto-clean-include-disabled"
                        checked={Boolean(field.value)}
                        disabled={!autoCleanEnabled}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setAutoCleanConfirm("includeDisabled");
                            return;
                          }
                          field.onChange(false);
                        }}
                      />
                    </div>
                  )} />
                </SettingsField>
              </div>
              <AlertDialog open={autoCleanConfirm !== null} onOpenChange={(open) => { if (!open) setAutoCleanConfirm(null); }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {autoCleanConfirm === "includeDisabled"
                        ? t("settings.accounts.autoCleanIncludeDisabledTitle")
                        : t("settings.accounts.autoCleanEnableTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {autoCleanConfirm === "includeDisabled"
                        ? t("settings.accounts.autoCleanIncludeDisabledDescription")
                        : t("settings.accounts.autoCleanEnableDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() => {
                        if (autoCleanConfirm === "includeDisabled") {
                          form.setValue("accounts.autoCleanIncludeDisabled", true, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                        } else {
                          form.setValue("accounts.autoCleanReauthEnabled", true, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                        }
                        setAutoCleanConfirm(null);
                      }}
                    >
                      {t("settings.accounts.autoCleanConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </SettingsSection>
          </SettingsPane>

          <SettingsPane value="about">
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
        <SelectTrigger className="w-24 shrink-0 rounded-l-none bg-secondary/55" aria-label={t("settings.media.sizeUnit")}>
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
        <SelectTrigger className="w-24 shrink-0 rounded-l-none bg-secondary/55" aria-label={t("settings.durationUnit")}>
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
    <section className="rounded-2xl border bg-card px-5 py-[18px] shadow-panel">
      <div className="flex min-h-7 items-center justify-between gap-3 pb-1">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.6px] text-muted-foreground">{title}</h2>
        {action}
      </div>
      <div className="min-w-0 w-full divide-y">{children}</div>
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
            <Label htmlFor={controlId} className="text-xs font-medium">{label}</Label>
            {badge ? <Badge variant="secondary" className="shrink-0 text-[10px]">{badge}</Badge> : null}
          </div>
          {description ? <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{description}</p> : null}
          {error ? <p className="mt-1 text-xs text-destructive">{t("settings.invalidValue")}</p> : null}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
