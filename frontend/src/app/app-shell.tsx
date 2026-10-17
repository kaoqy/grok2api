import { zodResolver } from "@hookform/resolvers/zod";
import { Box, Eye, Image, KeyRound, Languages, LayoutDashboard, LogOut, Menu, Monitor, Moon, MoreHorizontal, Settings, ShieldCheck, Sparkles, Sun, UserPlus, Users, Video } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/shared/auth/use-auth";
import { GitHubMark } from "@/shared/components/github-mark";
import { SiteFooter } from "@/shared/components/site-footer";
import { cn } from "@/shared/lib/cn";
import { CurrentVersionLabel } from "@/features/system/version-update";

const navigation = [
  { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "nav.accounts", icon: Users },
  { href: "/registration", label: "nav.registration", icon: UserPlus },
  { href: "/client-keys", label: "nav.clientKeys", icon: KeyRound },
  { href: "/models", label: "nav.models", icon: Box },
  { href: "/gallery", label: "nav.gallery", icon: Image },
  { href: "/video-gallery", label: "nav.videoGallery", icon: Video },
  { href: "/request-audits", label: "nav.audits", icon: Eye },
  { href: "/quality-guard", label: "nav.qualityGuard", icon: ShieldCheck },
  { href: "/creative-console", label: "nav.creativeConsole", icon: Sparkles },
] as const;

export function AppShell() {
  const { t, i18n } = useTranslation();
  const { admin, logout, changePassword } = useAuth();
  const location = useLocation();
  const { setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const isMediaWorkspace = ["/creative-console", "/gallery", "/video-gallery"].includes(location.pathname);
  const settingsActive = location.pathname.startsWith("/settings");

  const passwordSchema = z.object({
    currentPassword: z.string().min(1, t("errors.required")),
    newPassword: z.string().min(8, t("errors.minPassword")),
  });
  type PasswordForm = z.infer<typeof passwordSchema>;
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  async function submitPassword(values: PasswordForm): Promise<void> {
    try {
      await changePassword(values.currentPassword, values.newPassword);
      toast.success(t("auth.passwordUpdated"));
      passwordForm.reset();
      setPasswordOpen(false);
      await logout();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.generic"));
    }
  }

  // 顶栏标签：当前项用白底卡片浮起，与参考看板的分段控件一致。
  function navigationLinks(): ReactNode {
    return navigation.map(({ href, label, icon: Icon }) => (
      <NavLink
        key={href}
        to={href}
        onClick={() => setMobileOpen(false)}
        className={({ isActive }) =>
          cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
            isActive && "bg-card text-foreground shadow-[var(--shadow-panel)]",
          )
        }
      >
        <Icon className="size-3.5 shrink-0" strokeWidth={1.9} />
        <span className="truncate">{t(label)}</span>
      </NavLink>
    ));
  }

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-2 px-2 text-xs font-medium" aria-label={t("common.actions")}>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">
            {(admin?.username ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-[10rem] truncate sm:inline">{admin?.username}</span>
          <MoreHorizontal className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1.5">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="h-8"><Sun />{t("shell.appearance")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setTheme("light")}><Sun />{t("shell.light")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}><Moon />{t("shell.dark")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}><Monitor />{t("shell.system")}</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="h-8"><Languages />{t("shell.language")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => void i18n.changeLanguage("zh-CN")}>简体中文</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void i18n.changeLanguage("en")}>English</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem className="h-8" onClick={() => setPasswordOpen(true)}><KeyRound />{t("auth.changePassword")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-8" onClick={() => void logout()}><LogOut />{t("auth.signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const brand = (
    <Link to="/dashboard" className="flex min-w-0 shrink-0 items-baseline gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center self-center rounded-md bg-primary text-[12px] font-bold text-primary-foreground">G</span>
      <span className="truncate text-[15px] font-bold tracking-normal text-foreground">{t("appName")}</span>
      <CurrentVersionLabel />
    </Link>
  );

  const desktopHeader = (
    <header className="sticky top-0 z-40 hidden border-b bg-[color-mix(in_oklab,var(--card)_92%,transparent)] backdrop-blur-md lg:block">
      <div className="mx-auto flex h-[60px] max-w-[2000px] items-center gap-4 px-4 xl:px-7">
        {brand}
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={t("shell.navigation")}>
          {navigationLinks()}
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          {accountMenu}
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" asChild>
            <a href="https://github.com/kaoqy/grok2api" target="_blank" rel="noreferrer" aria-label="GitHub">
              <GitHubMark />
            </a>
          </Button>
          <NavLink
            to="/settings"
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
              settingsActive && "bg-secondary text-foreground",
            )}
            aria-label={t("nav.settings")}
          >
            <Settings className="size-4" strokeWidth={1.9} />
          </NavLink>
        </div>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen bg-background">
      {desktopHeader}

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b bg-[color-mix(in_oklab,var(--card)_92%,transparent)] px-4 backdrop-blur-md lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label={t("shell.openNavigation")}><Menu className="size-4" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex h-dvh max-h-dvh w-[280px] flex-col gap-0 overflow-hidden px-0 py-0 [&>button]:right-3 [&>button]:top-4 [&>button]:flex [&>button]:size-7 [&>button]:items-center [&>button]:justify-center">
            <SheetHeader className="shrink-0 border-b px-4 py-4 text-left">
              {brand}
              <SheetTitle className="sr-only">{t("appName")}</SheetTitle>
              <SheetDescription className="sr-only">{t("shell.navigation")}</SheetDescription>
            </SheetHeader>
            <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-3" aria-label={t("shell.navigation")}>
              {navigationLinks()}
              <NavLink
                to="/settings"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "mt-1 inline-flex h-9 items-center gap-2 rounded-md border-t pt-2 text-sm font-medium text-muted-foreground",
                    isActive && "text-foreground",
                  )
                }
              >
                <Settings className="size-4 shrink-0" strokeWidth={1.9} />
                {t("nav.settings")}
              </NavLink>
            </nav>
          </SheetContent>
        </Sheet>
        {brand}
        {accountMenu}
      </header>

      <main className={cn("mx-auto w-full max-w-[2000px] px-4 sm:px-5 xl:px-7", isMediaWorkspace ? "pt-5 pb-0" : "py-5")}>
        <Outlet />
      </main>
      {!isMediaWorkspace ? <SiteFooter /> : null}

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("auth.changePassword")}</DialogTitle><DialogDescription>{admin?.username}</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={passwordForm.handleSubmit(submitPassword)}>
            <div className="space-y-2"><Label htmlFor="current-password">{t("auth.currentPassword")}</Label><Input id="current-password" type="password" autoComplete="current-password" {...passwordForm.register("currentPassword")} />{passwordForm.formState.errors.currentPassword ? <p className="text-xs text-destructive">{passwordForm.formState.errors.currentPassword.message}</p> : null}</div>
            <div className="space-y-2"><Label htmlFor="new-password">{t("auth.newPassword")}</Label><Input id="new-password" type="password" autoComplete="new-password" {...passwordForm.register("newPassword")} />{passwordForm.formState.errors.newPassword ? <p className="text-xs text-destructive">{passwordForm.formState.errors.newPassword.message}</p> : null}</div>
            <DialogFooter><Button type="button" variant="secondary" size="sm" onClick={() => setPasswordOpen(false)}>{t("common.cancel")}</Button><Button type="submit" size="sm" disabled={passwordForm.formState.isSubmitting}>{t("common.save")}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
