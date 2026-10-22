import { zodResolver } from "@hookform/resolvers/zod";
import {
  Box,
  Cable,
  ChevronRight,
  Eye,
  Image,
  KeyRound,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  Settings,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
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
import { CurrentVersionLabel } from "@/features/system/version-update";
import { useAuth } from "@/shared/auth/use-auth";
import { GitHubMark } from "@/shared/components/github-mark";
import { cn } from "@/shared/lib/cn";

type NavigationItem = { href: string; label: string; icon: LucideIcon };

const navigationSections: Array<{ label: "workspace" | "operations"; items: NavigationItem[] }> = [
  {
    label: "workspace",
    items: [
      { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
      { href: "/accounts", label: "nav.accounts", icon: Users },
      { href: "/account-import", label: "nav.accountImport", icon: Cable },
      { href: "/playground", label: "nav.creativeConsole", icon: MessageSquareText },
      { href: "/gallery", label: "nav.gallery", icon: Image },
    ],
  },
  {
    label: "operations",
    items: [
      { href: "/request-audits", label: "nav.audits", icon: Eye },
      { href: "/client-keys", label: "nav.clientKeys", icon: KeyRound },
      { href: "/models", label: "nav.models", icon: Box },
    ],
  },
];

const navigation = navigationSections.flatMap((section) => section.items);

export function AppShell() {
  const { t, i18n } = useTranslation();
  const { admin, logout, changePassword } = useAuth();
  const location = useLocation();
  const { resolvedTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const isMediaWorkspace = ["/playground", "/gallery"].includes(location.pathname);
  const current = navigation.find((item) => location.pathname === item.href || location.pathname.startsWith(`${item.href}/`));
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

  function navigationLinks(mobile = false): ReactNode {
    return navigationSections.map((section) => (
      <div key={section.label} className="space-y-1">
        <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {t(section.label === "workspace" ? "shell.workspace" : "shell.operations")}
        </p>
        {section.items.map(({ href, label, icon: Icon }) => (
          <NavLink
            key={href}
            to={href}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                "group relative flex min-w-0 items-center gap-2.5 rounded-lg border-2 font-semibold transition-[background-color,color,border-color,transform]",
                mobile ? "h-10 px-3 text-sm" : "h-9 px-2.5 text-[13px]",
                "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
                isActive && "border-border bg-foreground text-background hover:bg-foreground hover:text-background",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md transition-colors",
                    isActive ? "bg-background/15 text-background" : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" strokeWidth={2.4} />
                </span>
                <span className="min-w-0 flex-1 truncate">{t(label)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    ));
  }

  const brand = (
    <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5" onClick={() => setMobileOpen(false)}>
      <span className="flex size-9 shrink-0 -rotate-2 items-center justify-center rounded-xl border-2 border-border bg-foreground text-background shadow-[3px_3px_0_0_var(--shadow-ink)]">
        <span className="font-mono text-[13px] font-bold">G2</span>
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14px] font-bold text-foreground">{t("appName")}</span>
          <CurrentVersionLabel />
        </span>
        <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          2API control panel
        </span>
      </span>
    </Link>
  );

  const appearanceChip = (
    <span className="hidden items-center gap-1.5 rounded-lg border-2 border-border bg-card px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:inline-flex">
      {resolvedTheme === "dark" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
      {t("shell.autoTheme", { defaultValue: "自动" })}
    </span>
  );

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 px-1.5 text-xs font-semibold" aria-label={t("common.actions")}>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border-2 border-border bg-muted text-[11px] font-bold text-foreground">
            {(admin?.username ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-[10rem] truncate sm:inline">{admin?.username}</span>
          <MoreHorizontal className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1.5">
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

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[244px] flex-col border-r-2 border-sidebar-border bg-sidebar lg:flex">
        <div className="border-b-2 border-sidebar-border px-4 py-4">{brand}</div>
        <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label={t("shell.navigation")}>
          {navigationLinks()}
        </nav>
        <div className="border-t-2 border-sidebar-border p-3">
          <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              "flex h-9 items-center gap-2.5 rounded-lg border-2 px-2.5 text-[13px] font-semibold transition-colors",
              "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
              (isActive || settingsActive) && "border-border bg-foreground text-background hover:bg-foreground hover:text-background",
            )}
          >
            <span className="flex size-6 items-center justify-center rounded-md"><Settings className="size-3.5" /></span>
            {t("nav.settings")}
          </NavLink>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border-2 border-border bg-card p-1.5">
            <div className="flex min-w-0 items-center gap-2 px-1">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border-2 border-border bg-muted text-[11px] font-bold text-foreground">
                {(admin?.username ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 truncate text-xs font-semibold text-foreground">{admin?.username}</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
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
          </div>
        </div>
      </aside>

      <div className="lg:pl-[244px]">
        <header className="sticky top-0 z-40 border-b-2 border-border bg-background/95 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-6">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="size-9" aria-label={t("shell.openNavigation")}>
                    <Menu />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex h-dvh max-h-dvh w-[286px] flex-col gap-0 overflow-hidden border-r-2 border-sidebar-border bg-sidebar px-0 py-0 text-sidebar-foreground [&>button]:right-3 [&>button]:top-4 [&>button]:flex [&>button]:size-8 [&>button]:items-center [&>button]:justify-center [&>button]:text-sidebar-foreground">
                  <SheetHeader className="shrink-0 border-b-2 border-sidebar-border px-4 py-4 text-left">
                    {brand}
                    <SheetTitle className="sr-only">{t("appName")}</SheetTitle>
                    <SheetDescription className="sr-only">{t("shell.navigation")}</SheetDescription>
                  </SheetHeader>
                  <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3" aria-label={t("shell.navigation")}>
                    {navigationLinks(true)}
                    <NavLink
                      to="/settings"
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) => cn(
                        "flex h-10 items-center gap-2.5 rounded-lg border-2 px-3 text-sm font-semibold transition-colors",
                        "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
                        isActive && "border-border bg-foreground text-background hover:bg-foreground hover:text-background",
                      )}
                    >
                      <span className="flex size-6 items-center justify-center rounded-md"><Settings className="size-3.5" /></span>
                      {t("nav.settings")}
                    </NavLink>
                  </nav>
                </SheetContent>
              </Sheet>
              <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
                <span className="flex size-7 -rotate-2 items-center justify-center rounded-lg border-2 border-border bg-foreground font-mono text-[11px] font-bold text-background">G2</span>
                <span className="truncate text-sm font-bold">{t("appName")}</span>
              </Link>
            </div>

            <div className="hidden min-w-0 items-center gap-2 text-xs lg:flex">
              <span className="font-semibold text-muted-foreground">{t("appName")}</span>
              <ChevronRight className="size-3 text-muted-foreground" />
              <span className="truncate font-bold text-foreground">
                {t(current?.label ?? (settingsActive ? "nav.settings" : "nav.dashboard"))}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {appearanceChip}
              <span className="mr-1 hidden items-center gap-1.5 rounded-lg border-2 border-border bg-card px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:flex">
                <span className="size-1.5 rounded-full bg-foreground ink-pulse" />
                {t("shell.gatewayOnline")}
              </span>
              {accountMenu}
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:bg-muted hover:text-foreground" asChild>
                <a href="https://github.com/kaoqy/grok2api" target="_blank" rel="noreferrer" aria-label="GitHub"><GitHubMark /></a>
              </Button>
            </div>
          </div>
          <span key={location.pathname} className="route-flash" aria-hidden="true" />
        </header>

        <main className={cn("app-canvas min-h-[calc(100vh-3.5rem)] w-full px-[clamp(14px,1.6vw,30px)]", isMediaWorkspace ? "py-5" : "py-6")}>
          <div key={location.pathname} className="page-enter mx-auto w-full max-w-[1680px]">
            <Outlet />
          </div>
        </main>
      </div>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("auth.changePassword")}</DialogTitle><DialogDescription>{admin?.username}</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={passwordForm.handleSubmit(submitPassword)}>
            <div className="space-y-2"><Label htmlFor="current-password">{t("auth.currentPassword")}</Label><Input id="current-password" type="password" autoComplete="current-password" {...passwordForm.register("currentPassword")} />{passwordForm.formState.errors.currentPassword ? <p className="text-xs font-semibold text-destructive">{passwordForm.formState.errors.currentPassword.message}</p> : null}</div>
            <div className="space-y-2"><Label htmlFor="new-password">{t("auth.newPassword")}</Label><Input id="new-password" type="password" autoComplete="new-password" {...passwordForm.register("newPassword")} />{passwordForm.formState.errors.newPassword ? <p className="text-xs font-semibold text-destructive">{passwordForm.formState.errors.newPassword.message}</p> : null}</div>
            <DialogFooter><Button type="button" variant="secondary" size="sm" onClick={() => setPasswordOpen(false)}>{t("common.cancel")}</Button><Button type="submit" size="sm" disabled={passwordForm.formState.isSubmitting}>{t("common.save")}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

