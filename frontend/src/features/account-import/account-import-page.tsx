import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Cable, Check, KeyRound, RotateCw, ShieldCheck, TerminalSquare, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  getAccountImportKeyStatus,
  importBuildAccount,
  importWebAccount,
  revokeAccountImportKey,
  rotateAccountImportKey,
  type AccountImportKeyDTO,
  type BuildAccountImportInput,
  type WebAccountImportInput,
} from "@/features/account-import/account-import-api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/shared/components/copy-button";
import { ErrorState } from "@/shared/components/data-state";
import { runtimeConfig } from "@/shared/config/runtime-config";
import { cn } from "@/shared/lib/cn";

const emptyForm: BuildAccountImportInput = {
  email: "",
  name: "",
  clientId: "b1a00492-073a-47ea-816f-4c329264a828",
  accessToken: "",
  refreshToken: "",
  idToken: "",
  expiresAt: "",
  proxyName: "",
  proxyUrl: "",
};

const emptyWebForm: WebAccountImportInput = {
  email: "",
  name: "",
  ssoToken: "",
  tier: "auto",
  proxyName: "",
  proxyUrl: "",
};

export function AccountImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createdKey, setCreatedKey] = useState<AccountImportKeyDTO | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [form, setForm] = useState<BuildAccountImportInput>(emptyForm);
  const [webForm, setWebForm] = useState<WebAccountImportInput>(emptyWebForm);

  const statusQuery = useQuery({
    queryKey: ["account-import", "key"],
    queryFn: getAccountImportKeyStatus,
  });

  const rotateMutation = useMutation({
    mutationFn: rotateAccountImportKey,
    onSuccess: (value) => {
      setCreatedKey(value);
      void queryClient.invalidateQueries({ queryKey: ["account-import", "key"] });
      toast.success(t("accountImport.keyCreated"));
    },
    onError: showError,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeAccountImportKey,
    onSuccess: () => {
      setRevokeOpen(false);
      setCreatedKey(null);
      void queryClient.invalidateQueries({ queryKey: ["account-import", "key"] });
      toast.success(t("accountImport.keyRevoked"));
    },
    onError: showError,
  });

  const importMutation = useMutation({
    mutationFn: importBuildAccount,
    onSuccess: (value) => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(t("accountImport.imported", { account: value.accountId ?? value.accountIds[0] ?? "-" }));
      setForm(emptyForm);
      navigate("/accounts");
    },
    onError: showError,
  });

  const webImportMutation = useMutation({
    mutationFn: importWebAccount,
    onSuccess: (value) => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(t("accountImport.webImported", { account: value.accountId ?? value.accountIds[0] ?? "-" }));
      setWebForm(emptyWebForm);
      navigate("/accounts");
    },
    onError: showError,
  });

  if (statusQuery.isError) {
    return <ErrorState message={statusQuery.error.message} onRetry={() => void statusQuery.refetch()} />;
  }

  const endpoints = statusQuery.data?.endpoints?.length
    ? statusQuery.data.endpoints
    : [statusQuery.data?.endpoint ?? "/api/import/v1/accounts/build"];
  const endpoint = `${runtimeConfig.publicApiBaseUrl}${endpoints[0]}`;
  const configured = statusQuery.data?.configured ?? false;
  const keyLoading = statusQuery.isPending;
  const example = buildCurlExample(endpoint, `${runtimeConfig.publicApiBaseUrl}/api/import/v1/accounts/web`);

  function updateField<Key extends keyof BuildAccountImportInput>(key: Key, value: BuildAccountImportInput[Key]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateWebField<Key extends keyof WebAccountImportInput>(key: Key, value: WebAccountImportInput[Key]): void {
    setWebForm((current) => ({ ...current, [key]: value }));
  }

  function submitImport(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!form.email.trim() || !form.proxyUrl.trim() || (!form.accessToken.trim() && !form.refreshToken.trim())) {
      toast.error(t("accountImport.requiredFields"));
      return;
    }
    importMutation.mutate({
      ...form,
      email: form.email.trim(),
      name: form.name?.trim(),
      clientId: form.clientId?.trim(),
      accessToken: form.accessToken.trim(),
      refreshToken: form.refreshToken.trim(),
      idToken: form.idToken?.trim(),
      expiresAt: form.expiresAt?.trim(),
      proxyName: form.proxyName?.trim(),
      proxyUrl: form.proxyUrl.trim(),
    });
  }

  function submitWebImport(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!webForm.ssoToken.trim() || !webForm.proxyUrl.trim()) {
      toast.error(t("accountImport.webRequiredFields"));
      return;
    }
    webImportMutation.mutate({
      ...webForm,
      email: webForm.email.trim(),
      name: webForm.name?.trim(),
      ssoToken: webForm.ssoToken.trim(),
      tier: webForm.tier?.trim(),
      proxyName: webForm.proxyName?.trim(),
      proxyUrl: webForm.proxyUrl.trim(),
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Cable className="size-4" /></span>
            <Badge variant="outline" className="rounded-md border-primary/25 bg-primary/8 text-primary">Grok Build</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("accountImport.title")}</h1>
          <p className="mt-1.5 max-w-[68ch] text-sm leading-6 text-muted-foreground">{t("accountImport.description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn("flex h-8 items-center gap-2 rounded-md border px-3 text-xs", keyLoading ? "border-border bg-secondary/55 text-muted-foreground" : configured ? "border-success/25 bg-success/8 text-success" : "border-warn/25 bg-warn/8 text-warn")}>
            {keyLoading ? <Spinner className="size-3" /> : <span className={cn("size-2 rounded-full", configured ? "bg-success" : "bg-warn")} />}
            {keyLoading ? t("common.loading") : configured ? t("accountImport.keyReady") : t("accountImport.keyMissing")}
          </div>
          <Button size="sm" variant="outline" onClick={() => void statusQuery.refetch()} disabled={statusQuery.isFetching}>
            <RotateCw className={statusQuery.isFetching ? "animate-spin" : undefined} />{t("common.refresh")}
          </Button>
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
          <div className="min-w-0 border-b p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><TerminalSquare className="size-4" />{t("accountImport.endpoint")}</div>
            <div className="mt-3 space-y-2">
              {endpoints.map((value) => {
                const full = `${runtimeConfig.publicApiBaseUrl}${value}`;
                return (
                  <div key={value} className="flex min-w-0 items-center gap-2 rounded-md border bg-secondary/55 px-3 py-2.5">
                    <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground">{full}</code>
                    <CopyButton value={full} copyLabel={t("common.copy")} />
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <ImportFact icon={<ShieldCheck />} value={t("accountImport.factScope")} />
              <ImportFact icon={<KeyRound />} value={t("accountImport.factAuth")} />
              <ImportFact icon={<Cable />} value={t("accountImport.factProxy")} />
            </div>
          </div>
          <div className="flex flex-col justify-between gap-4 p-5">
            <div>
              <p className="text-sm font-medium">{t("accountImport.accessKey")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("accountImport.accessKeyHelp")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => rotateMutation.mutate()} disabled={rotateMutation.isPending || keyLoading}>
                {rotateMutation.isPending ? <Spinner /> : configured ? <RotateCw /> : <KeyRound />}
                {configured ? t("accountImport.rotateKey") : t("accountImport.createKey")}
              </Button>
              {configured ? <Button size="sm" variant="outline" onClick={() => setRevokeOpen(true)} disabled={revokeMutation.isPending}><Trash2 />{t("accountImport.revokeKey")}</Button> : null}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-lg border bg-card">
          <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">{t("accountImport.workflowTitle")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("accountImport.workflowHelp")}</p>
            </div>
            <Badge variant="secondary" className="rounded-md">{t("accountImport.threeSteps")}</Badge>
          </header>
          <ol className="divide-y">
            {[
              [t("accountImport.stepCreate"), t("accountImport.stepCreateHelp")],
              [t("accountImport.stepPrepare"), t("accountImport.stepPrepareHelp")],
              [t("accountImport.stepImport"), t("accountImport.stepImportHelp")],
            ].map(([title, detail], index) => (
              <li key={title} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 px-5 py-4">
                <span className="flex size-7 items-center justify-center rounded-md border bg-secondary font-mono text-[11px] text-muted-foreground">{index + 1}</span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="min-w-0 overflow-hidden rounded-lg border bg-[#14201d] text-[#edf7f3]">
          <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">{t("accountImport.exampleTitle")}</h2>
              <p className="mt-0.5 text-xs text-white/55">{t("accountImport.exampleHelp")}</p>
            </div>
            <CopyButton value={example} copyLabel={t("common.copy")} className="border-white/15 bg-white/8 text-white hover:bg-white/12" />
          </header>
          <pre className="max-h-[360px] overflow-auto p-5 font-mono text-[11px] leading-5 text-[#cfe4dc]"><code>{example}</code></pre>
        </section>
      </div>

      <section className="rounded-lg border bg-card">
        <Tabs defaultValue="build">
          <header className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">{t("accountImport.manualTitle")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("accountImport.manualHelp")}</p>
            </div>
            <div className="flex items-center gap-2">
              <TabsList>
                <TabsTrigger value="build">{t("accountImport.buildTab")}</TabsTrigger>
                <TabsTrigger value="web">{t("accountImport.webTab")}</TabsTrigger>
              </TabsList>
              <Button size="sm" variant="ghost" onClick={() => navigate("/accounts")}><ArrowUpRight />{t("accountImport.openAccounts")}</Button>
            </div>
          </header>
          <div className="p-5">
          <TabsContent value="build">
            <form onSubmit={submitImport}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label={t("accountImport.email")} required value={form.email} onChange={(value) => updateField("email", value)} placeholder="name@example.com" />
                <Field label={t("accountImport.name")} value={form.name ?? ""} onChange={(value) => updateField("name", value)} placeholder="Grok Build 01" />
                <Field label="OAuth client ID" value={form.clientId ?? ""} onChange={(value) => updateField("clientId", value)} />
                <Field label="Access token" required value={form.accessToken} onChange={(value) => updateField("accessToken", value)} />
                <Field label="Refresh token" required value={form.refreshToken} onChange={(value) => updateField("refreshToken", value)} />
                <Field label="ID token" value={form.idToken ?? ""} onChange={(value) => updateField("idToken", value)} />
                <Field label={t("accountImport.expiresAt")} value={form.expiresAt ?? ""} onChange={(value) => updateField("expiresAt", value)} placeholder="2026-10-18T15:06:40Z" />
                <Field label={t("accountImport.proxyName")} value={form.proxyName ?? ""} onChange={(value) => updateField("proxyName", value)} placeholder="Singapore Oracle" />
                <Field label={t("accountImport.proxyUrl")} required value={form.proxyUrl} onChange={(value) => updateField("proxyUrl", value)} placeholder="socks5://user:pass@host:port" />
              </div>
              <div className="mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-[70ch] text-xs leading-5 text-muted-foreground">{t("accountImport.securityNote")}</p>
                <Button type="submit" size="sm" disabled={importMutation.isPending}>
                  {importMutation.isPending ? <Spinner /> : <Check />}{t("accountImport.importAction")}
                </Button>
              </div>
            </form>
          </TabsContent>
          <TabsContent value="web">
            <form onSubmit={submitWebImport}>
              <p className="mb-4 max-w-[70ch] text-xs leading-5 text-muted-foreground">{t("accountImport.webHelp")}</p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label={t("accountImport.email")} value={webForm.email} onChange={(value) => updateWebField("email", value)} placeholder="name@example.com" />
                <Field label={t("accountImport.name")} value={webForm.name ?? ""} onChange={(value) => updateWebField("name", value)} placeholder="Grok Web 01" />
                <Field label={t("accountImport.tier")} value={webForm.tier ?? ""} onChange={(value) => updateWebField("tier", value)} placeholder="auto" />
                <Field label={t("accountImport.ssoToken")} required value={webForm.ssoToken} onChange={(value) => updateWebField("ssoToken", value)} placeholder="sso=..." />
                <Field label={t("accountImport.proxyName")} value={webForm.proxyName ?? ""} onChange={(value) => updateWebField("proxyName", value)} placeholder="Singapore Oracle" />
                <Field label={t("accountImport.proxyUrl")} required value={webForm.proxyUrl} onChange={(value) => updateWebField("proxyUrl", value)} placeholder="socks5://user:pass@host:port" />
              </div>
              <div className="mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-[70ch] text-xs leading-5 text-muted-foreground">{t("accountImport.securityNote")}</p>
                <Button type="submit" size="sm" disabled={webImportMutation.isPending}>
                  {webImportMutation.isPending ? <Spinner /> : <Check />}{t("accountImport.importWebAction")}
                </Button>
              </div>
            </form>
          </TabsContent>
          </div>
        </Tabs>
      </section>

      <Dialog open={createdKey !== null} onOpenChange={(open) => { if (!open) setCreatedKey(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("accountImport.keyCreated")}</DialogTitle>
            <DialogDescription>{t("accountImport.keyCreatedHelp")}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-secondary/60 p-3">
            <code className="block break-all font-mono text-xs leading-5 text-foreground">{createdKey?.token}</code>
          </div>
          <DialogFooter>
            <CopyButton value={createdKey?.token ?? ""} copyLabel={t("common.copy")} />
            <Button size="sm" onClick={() => setCreatedKey(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("accountImport.revokeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("accountImport.revokeHelp")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => revokeMutation.mutate()}>{t("accountImport.revokeKey")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ImportFact({ icon, value }: { icon: ReactNode; value: string }) {
  return <div className="flex min-w-0 items-center gap-2 rounded-md border bg-secondary/35 px-3 py-2 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">{icon}<span className="truncate">{value}</span></div>;
}

function Field({ label, value, onChange, placeholder, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs">{label}{required ? <span className="ml-1 text-destructive">*</span> : null}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="font-mono text-[11px]" />
    </div>
  );
}

function buildCurlExample(endpoint: string, webEndpoint: string): string {
  return `curl -X POST '${endpoint}' \\
  -H 'Authorization: Bearer <account-import-key>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "email": "name@example.com",
    "clientId": "b1a00492-073a-47ea-816f-4c329264a828",
    "accessToken": "<access-token>",
    "refreshToken": "<refresh-token>",
    "idToken": "<id-token>",
    "expiresAt": "2026-10-18T15:06:40Z",
    "proxyName": "Singapore Oracle",
    "proxyUrl": "socks5://user:pass@host:port"
  }'

curl -X POST '${webEndpoint}' \\
  -H 'Authorization: Bearer <account-import-key>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "email": "name@example.com",
    "ssoToken": "<sso-token>",
    "tier": "auto",
    "proxyName": "Singapore Oracle",
    "proxyUrl": "socks5://user:pass@host:port"
  }'`;
}

function showError(error: unknown): void {
  toast.error(error instanceof Error ? error.message : "Request failed");
}
