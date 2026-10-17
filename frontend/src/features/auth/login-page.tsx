import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useForm, type FieldErrors } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/shared/auth/use-auth";
import { GitHubMark } from "@/shared/components/github-mark";
import { SiteFooter } from "@/shared/components/site-footer";

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const schema = z.object({
    username: z.string().min(1, t("auth.usernameRequired")),
    password: z.string().min(1, t("auth.passwordRequired")),
  });
  type LoginForm = z.infer<typeof schema>;
  const form = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  async function submit(values: LoginForm): Promise<void> {
    try {
      await login(values.username, values.password);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.generic"));
      form.setFocus("password");
    }
  }

  function invalid(errors: FieldErrors<LoginForm>): void {
    if (errors.username) {
      toast.error(errors.username.message);
      form.setFocus("username");
      return;
    }
    if (errors.password) {
      toast.error(errors.password.message);
      form.setFocus("password");
    }
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
        <Button variant="ghost" size="icon" className="size-[34px] border border-border bg-card text-muted-foreground shadow-[var(--shadow-panel)] hover:border-input hover:bg-secondary hover:text-foreground" asChild>
          <a href="https://github.com/kaoqy/grok2api" target="_blank" rel="noreferrer" aria-label="GitHub">
            <GitHubMark />
          </a>
        </Button>
      </header>

      <main className="mx-auto grid w-full max-w-[1040px] flex-1 items-center gap-10 px-5 py-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
        <section className="hidden min-h-[360px] flex-col justify-center lg:flex">
          <span className="flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-accent text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">{t("appName")}</p>
          <h1 className="mt-3 max-w-[520px] text-[34px] font-bold leading-[1.16]">{t("auth.productTitle")}</h1>
          <p className="mt-5 max-w-[440px] text-sm leading-7 text-muted-foreground">{t("auth.subtitle")}</p>
          <div className="mt-9 flex max-w-[440px] items-center gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-success" />
            <span>Grok Build · v1.0.0</span>
          </div>
        </section>

        <section className="w-full justify-self-center overflow-hidden rounded-[14px] border border-border bg-card shadow-[var(--shadow-float)] lg:justify-self-end">
          <div className="border-b border-border bg-secondary/55 px-6 py-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("appName")}</p>
            <h2 className="mt-2 text-xl font-bold">{t("auth.title")}</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("auth.subtitle")}</p>
          </div>
          <form className="space-y-5 px-6 py-6" onSubmit={form.handleSubmit(submit, invalid)}>
            <div className="space-y-2">
              <Label htmlFor="username">{t("auth.username")}</Label>
              <Input
                id="username"
                className="h-10 bg-secondary/60"
                autoComplete="username"
                autoFocus
                aria-invalid={Boolean(form.formState.errors.username)}
                {...form.register("username")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                className="h-10 bg-secondary/60"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(form.formState.errors.password)}
                {...form.register("password")}
              />
            </div>
            <Button type="submit" className="h-10 w-full justify-between px-4" disabled={form.formState.isSubmitting}>
              <span>{form.formState.isSubmitting ? t("auth.signingIn") : t("auth.signIn")}</span>
              <ArrowRight className="size-4" />
            </Button>
          </form>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
