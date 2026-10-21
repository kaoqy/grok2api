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
  Monitor,
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
  const { setTheme } = useTheme();
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
        <p className="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-sidebar-foreground/38 uppercase">
          {t(section.label === "workspace" ? "shell.workspace" : "shell.operations")}
        </p>
        {section.items.map(({ href, label, icon: Icon }) => (
          <NavLink
            key={href}
            to={href}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                "group relative flex min-w-0 items-center gap-2.5 rounded-lg font-medium text-sidebar-foreground/65 transition-[background-color,color]",
                mobile ? "h-10 px-3 text-sm" : "h-9 px-2.5 text-[13px]",
                "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary" aria-hidden="true" /> : null}
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md transition-colors", isActive ? "bg-sidebar-primary/16 text-sidebar-primary" : "text-sidebar-foreground/55 group-hover:text-sidebar-accent-foreground")}>
                  <Icon className="size-3.5" strokeWidth={2} />
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
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_6px_18px_rgba(139,125,255,0.28)]">
        <span className="font-mono text-[13px] font-bold">G2</span>
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-sidebar bg-success" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-sidebar-accent-foreground">{t("appName")}</span>
          <CurrentVersionLabel />
        </span>
        <span className="block truncate text-[10px] tracking-[0.1em] text-sidebar-foreground/40 uppercase">Build control plane</span>
      </span>
    </Link>
  );

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-2 px-1.5 text-xs font-medium lg:px-2" aria-label={t("common.actions")}>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-[11px] font-semibold text-primary">
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

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[244px] flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="border-b border-sidebar-border px-4 py-4">{brand}</div>
        <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label={t("shell.navigation")}>
          {navigationLinks()}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/72 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              (isActive || settingsActive) && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-white/[0.035]"><Settings className="size-3.5" /></span>
            {t("nav.settings")}
          </NavLink>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-white/8 bg-white/[0.025] p-1.5">
            <div className="flex min-w-0 items-center gap-2 px-1">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground">{(admin?.username ?? "?").slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 truncate text-xs text-sidebar-accent-foreground">{admin?.username}</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-7 text-sidebar-foreground/60 hover:bg-white/8 hover:text-white"><MoreHorizontal /></Button></DropdownMenuTrigger>
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
          </div>
        </div>
      </aside>

      <div className="lg:pl-[244px]">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b bg-background/92 px-4 backdrop-blur-md lg:px-6">
          <div className="flex min-w-0 items-center gap-3 lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="size-9" aria-label={t("shell.openNavigation")}><Menu /></Button></SheetTrigger>
              <SheetContent side="left" className="flex h-dvh max-h-dvh w-[286px] flex-col gap-0 overflow-hidden border-r-sidebar-border bg-sidebar px-0 py-0 text-sidebar-foreground [&>button]:right-3 [&>button]:top-4 [&>button]:flex [&>button]:size-8 [&>button]:items-center [&>button]:justify-center [&>button]:text-sidebar-foreground">
                <SheetHeader className="shrink-0 border-b border-sidebar-border px-4 py-4 text-left">
                  {brand}
                  <SheetTitle className="sr-only">{t("appName")}</SheetTitle>
                  <SheetDescription className="sr-only">{t("shell.navigation")}</SheetDescription>
                </SheetHeader>
                <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3" aria-label={t("shell.navigation")}>
                  {navigationLinks(true)}
                  <NavLink to="/settings" onClick={() => setMobileOpen(false)} className="flex h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                    <span className="flex size-6 items-center justify-center rounded-md bg-white/[0.035]"><Settings className="size-3.5" /></span>{t("nav.settings")}
                  </NavLink>
                </nav>
              </SheetContent>
            </Sheet>
            <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-sm font-bold text-primary">G2</span>
              <span className="truncate text-sm font-semibold">{t("appName")}</span>
            </Link>
          </div>

          <div className="hidden min-w-0 items-center gap-2 text-xs lg:flex">
            <span className="font-medium text-muted-foreground">{t("appName")}</span>
            <ChevronRight className="size-3 text-muted-foreground/55" />
            <span className="truncate font-semibold text-foreground">{t(current?.label ?? (settingsActive ? "nav.settings" : "nav.dashboard"))}</span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="mr-1 hidden items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-[10px] text-muted-foreground sm:flex">
              <span className="size-1.5 rounded-full bg-success" />{t("shell.gatewayOnline")}
            </span>
            {accountMenu}
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" asChild>
              <a href="https://github.com/kaoqy/grok2api" target="_blank" rel="noreferrer" aria-label="GitHub"><GitHubMark /></a>
            </Button>
          </div>
        </header>

        <main className={cn("app-canvas min-h-[calc(100vh-3.5rem)] w-full px-[clamp(14px,1.6vw,30px)]", isMediaWorkspace ? "py-5" : "py-6")}>
          <div className="mx-auto w-full max-w-[1680px]"><Outlet /></div>
        </main>
      </div>

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
