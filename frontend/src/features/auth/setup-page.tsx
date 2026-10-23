import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Cable, ShieldCheck, TerminalSquare } from "lucide-react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { getSetupStatus } from "@/features/auth/setup-api";
import { useAuth } from "@/shared/auth/use-auth";
import { GitHubMark } from "@/shared/components/github-mark";

export function SetupPage() {
  const { t } = useTranslation();
  const { setup } = useAuth();
  const statusQuery = useQuery({ queryKey: ["setup", "status"], queryFn: getSetupStatus });
  const schema = z.object({
    username: z.string().min(1, t("auth.usernameRequired")),
    password: z.string().min(8, t("auth.passwordTooShort")),
    confirm: z.string().min(1, t("auth.passwordRequired")),
  }).refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: t("auth.passwordMismatch"),
  });
  type SetupForm = z.infer<typeof schema>;
  const form = useForm<SetupForm>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "", confirm: "" },
  });

  async function submit(values: SetupForm): Promise<void> {
    try {
      await setup(values.username, values.password);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.generic"));
    }
  }

  if (statusQuery.isPending) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Spinner className="size-5" /></div>;
  }
  if (statusQuery.data && !statusQuery.data.setupRequired) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-canvas grid min-h-screen bg-background lg:grid-cols-[minmax(380px,42%)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r-2 border-border bg-card px-10 py-9 lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-[0.05] [background-image:radial-gradient(var(--foreground)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-10 -rotate-2 items-center justify-center rounded-xl border-2 border-border bg-foreground font-mono text-sm font-bold text-background shadow-[3px_3px_0_0_var(--shadow-ink)]">G2</span>
          <div>
            <p className="text-[15px] font-bold">{t("appName")}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">2API control plane</p>
          </div>
        </div>
        <div className="relative my-auto max-w-[560px] py-14">
          <span className="flex size-11 items-center justify-center rounded-xl border-2 border-border bg-foreground text-background shadow-[3px_3px_0_0_var(--shadow-ink)]"><ShieldCheck className="size-5" strokeWidth={2.2} /></span>
          <h1 className="mt-7 max-w-[13ch] text-[38px] font-bold leading-[1.1] tracking-[-0.04em]">{t("auth.setupTitle")}</h1>
          <p className="mt-5 max-w-[48ch] text-sm leading-7 text-muted-foreground">{t("auth.setupDescription")}</p>
          <div className="mt-9 grid gap-2">
            <SetupFact icon={<TerminalSquare />} label={t("auth.setupFactRouting")} />
            <SetupFact icon={<Cable />} label={t("auth.setupFactImport")} />
            <SetupFact icon={<ShieldCheck />} label={t("auth.setupFactSecurity")} />
          </div>
        </div>
        <div className="relative flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <span>First-run configuration · v1.0.0</span>
          <a href="https://github.com/kaoqy/grok2api" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground"><GitHubMark /></a>
        </div>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[430px]">
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 -rotate-2 items-center justify-center rounded-lg border-2 border-border bg-foreground font-mono text-sm font-bold text-background shadow-[3px_3px_0_0_var(--shadow-ink)]">G2</span>
              <span className="text-[15px] font-bold">{t("appName")}</span>
            </div>
            <a href="https://github.com/kaoqy/grok2api" target="_blank" rel="noreferrer" className="flex size-9 items-center justify-center rounded-lg border-2 border-border bg-card text-muted-foreground"><GitHubMark /></a>
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("appName")}</p>
          <h1 className="mt-2 text-[30px] font-bold leading-9 tracking-[-0.035em]">{t("auth.setupTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("auth.setupDescription")}</p>
          <form className="mt-8 space-y-5 border-t-2 border-border pt-7" onSubmit={form.handleSubmit(submit)}>
            <div className="space-y-2">
              <Label htmlFor="setup-username">{t("auth.username")}</Label>
              <Input id="setup-username" className="h-11 bg-card" autoComplete="username" autoFocus aria-invalid={Boolean(form.formState.errors.username)} {...form.register("username")} />
              {form.formState.errors.username ? <p className="text-xs font-semibold text-destructive">{form.formState.errors.username.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-password">{t("auth.password")}</Label>
              <Input id="setup-password" className="h-11 bg-card" type="password" autoComplete="new-password" aria-invalid={Boolean(form.formState.errors.password)} {...form.register("password")} />
              {form.formState.errors.password ? <p className="text-xs font-semibold text-destructive">{form.formState.errors.password.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-confirm">{t("auth.confirmPassword")}</Label>
              <Input id="setup-confirm" className="h-11 bg-card" type="password" autoComplete="new-password" aria-invalid={Boolean(form.formState.errors.confirm)} {...form.register("confirm")} />
              {form.formState.errors.confirm ? <p className="text-xs font-semibold text-destructive">{form.formState.errors.confirm.message}</p> : null}
            </div>
            <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("auth.settingUp") : t("auth.setupAction")}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

function SetupFact({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border-2 border-border bg-muted px-3 py-2.5 text-xs font-medium text-foreground [&_svg]:size-3.5">
      {icon}{label}
    </div>
  );
}
