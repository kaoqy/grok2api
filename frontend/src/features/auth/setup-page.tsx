import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
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

  const schema = z
    .object({
      username: z.string().min(1, t("auth.usernameRequired")),
      password: z.string().min(8, t("auth.passwordTooShort")),
      confirm: z.string().min(1, t("auth.passwordRequired")),
    })
    .refine((value) => value.password === value.confirm, {
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (statusQuery.data && !statusQuery.data.setupRequired) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border/70 px-[clamp(18px,3vw,44px)]">
        <div className="flex items-center gap-2.5 text-[16px] font-bold">
          <span className="relative flex size-2.5 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-success/20" />
            <span className="relative size-1.5 rounded-full bg-success" />
          </span>
          {t("appName")}
        </div>
        <a
          className="flex size-[34px] items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-[var(--shadow-panel)] transition-colors hover:border-input hover:bg-secondary hover:text-foreground"
          href="https://github.com/kaoqy/grok2api"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
        >
          <GitHubMark />
        </a>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <section className="w-full max-w-[430px] overflow-hidden rounded-[14px] border border-border bg-card shadow-[var(--shadow-float)]">
          <div className="border-b border-border bg-secondary/55 px-6 py-5 sm:px-7">
            <span className="flex size-9 items-center justify-center rounded-lg border border-primary/20 bg-accent text-primary">
              <ShieldCheck className="size-4" />
            </span>
            <h1 className="mt-4 text-xl font-bold">{t("auth.setupTitle")}</h1>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("auth.setupDescription")}</p>
          </div>

          <form className="space-y-5 px-6 py-6 sm:px-7" onSubmit={form.handleSubmit(submit)}>
            <div className="space-y-2">
              <Label htmlFor="setup-username">{t("auth.username")}</Label>
              <Input
                id="setup-username"
                className="h-10 bg-secondary/60"
                autoComplete="username"
                autoFocus
                aria-invalid={Boolean(form.formState.errors.username)}
                {...form.register("username")}
              />
              {form.formState.errors.username ? (
                <p className="text-xs text-destructive">{form.formState.errors.username.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-password">{t("auth.password")}</Label>
              <Input
                id="setup-password"
                className="h-10 bg-secondary/60"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(form.formState.errors.password)}
                {...form.register("password")}
              />
              {form.formState.errors.password ? (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-confirm">{t("auth.confirmPassword")}</Label>
              <Input
                id="setup-confirm"
                className="h-10 bg-secondary/60"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(form.formState.errors.confirm)}
                {...form.register("confirm")}
              />
              {form.formState.errors.confirm ? (
                <p className="text-xs text-destructive">{form.formState.errors.confirm.message}</p>
              ) : null}
            </div>
            <Button type="submit" className="h-10 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("auth.settingUp") : t("auth.setupAction")}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
