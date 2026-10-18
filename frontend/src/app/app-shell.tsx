import { zodResolver } from "@hookform/resolvers/zod";
import { Box, Eye, Image, KeyRound, Languages, LayoutDashboard, LogOut, Menu, MessageSquareText, Monitor, Moon, MoreHorizontal, Settings, Sun, UserPlus, Users } from "lucide-react";
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
  { href: "/playground", label: "nav.creativeConsole", icon: MessageSquareText },
  { href: "/request-audits", label: "nav.audits", icon: Eye },
  { href: "/client-keys", label: "nav.clientKeys", icon: KeyRound },
  { href: "/models", label: "nav.models", icon: Box },
  { href: "/gallery", label: "nav.gallery", icon: Image },
] as const;

export function AppShell() {
  const { t, i18n } = useTranslation();
  const { admin, logout, changePassword } = useAuth();
  const location = useLocation();
  const { setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const isMediaWorkspace = ["/playground", "/gallery"].includes(location.pathname);
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

  // 顶栏标签采用 WorkBuddy 的胶囊分段导航：整组落在次级暖色底上，
  // 当前项用白底、细描边和浅阴影浮起。
  function navigationLinks(mobile = false): ReactNode {
    return navigation.map(({ href, label, icon: Icon }) => (
      <NavLink
        key={href}
        to={href}
        onClick={() => setMobileOpen(false)}
        className={({ isActive }) =>
          cn(
            "inline-flex shrink-0 items-center gap-1.5 border border-transparent font-medium text-muted-foreground transition-[background-color,border-color,color,box-shadow] hover:bg-card/70 hover:text-foreground",
            mobile ? "h-9 w-full rounded-md px-3 text-sm" : "h-8 rounded-[7px] px-3 text-[12px]",
            isActive && "border-border bg-card font-semibold text-foreground shadow-[var(--shadow-panel)]",
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
    <Link to="/dashboard" className="flex min-w-0 shrink-0 items-center gap-2.5">
      <span className="relative flex size-2.5 shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-success/20" />
        <span className="relative size-1.5 rounded-full bg-success" />
      </span>
      <span className="truncate text-[17px] font-bold tracking-normal text-foreground">{t("appName")}</span>
      <CurrentVersionLabel />
    </Link>
  );

  const desktopHeader = (
    <header className="sticky top-0 z-40 hidden border-b bg-[color-mix(in_oklab,var(--background)_92%,transparent)] shadow-[var(--shadow-panel)] backdrop-blur-[10px] lg:block">
      <div className="mx-auto flex min-h-16 max-w-[2000px] items-center gap-4 px-[clamp(14px,1.4vw,28px)] py-3">
        {brand}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-[10px] border border-border bg-secondary p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={t("shell.navigation")}>
          {navigationLinks()}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          {accountMenu}
          <Button variant="ghost" size="icon" className="size-[34px] border border-border bg-card text-muted-foreground shadow-[var(--shadow-panel)] hover:border-input hover:bg-secondary" asChild>
            <a href="https://github.com/kaoqy/grok2api" target="_blank" rel="noreferrer" aria-label="GitHub">
              <GitHubMark />
            </a>
          </Button>
          <NavLink
            to="/settings"
            className={cn(
              "flex size-[34px] shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-[var(--shadow-panel)] transition-colors hover:border-input hover:bg-secondary hover:text-foreground",
              settingsActive && "border-primary/45 bg-accent text-accent-foreground",
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

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b bg-[color-mix(in_oklab,var(--background)_92%,transparent)] px-4 shadow-[var(--shadow-panel)] backdrop-blur-[10px] lg:hidden">
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
              {navigationLinks(true)}
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

      <main className={cn("mx-auto w-full max-w-[2000px] px-[clamp(14px,1.4vw,28px)]", isMediaWorkspace ? "pt-5 pb-0" : "py-5")}>
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
