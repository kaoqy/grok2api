import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
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
  const form = useForm<SetupForm>({ resolver: zodResolver(schema), defaultValues: { username: "", password: "", confirm: "" } });

  async function submit(values: SetupForm): Promise<void> {
    try {
      await setup(values.username, values.password);
      // 初始化成功后 AuthProvider 会把状态切到 authenticated，
      // 由下面的重定向接管跳转，无需在提交回调里再手动导航。
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-medium">{t("auth.setupTitle")}</h1>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("auth.setupDescription")}</p>
        <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(submit)}>
          <div className="space-y-2">
            <Label htmlFor="setup-username">{t("auth.username")}</Label>
            <Input id="setup-username" className="h-9 bg-card" autoComplete="username" autoFocus {...form.register("username")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-password">{t("auth.password")}</Label>
            <Input id="setup-password" className="h-9 bg-card" type="password" autoComplete="new-password" {...form.register("password")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-confirm">{t("auth.confirmPassword")}</Label>
            <Input id="setup-confirm" className="h-9 bg-card" type="password" autoComplete="new-password" {...form.register("confirm")} />
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("auth.settingUp") : t("auth.setupAction")}
          </Button>
        </form>
      </div>
    </div>
  );
}
