import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getSetupStatus } from "@/features/auth/setup-api";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/shared/auth/use-auth";

export function AuthBoundary() {
  const { status, retryRestore } = useAuth();
  const location = useLocation();

  if (status === "restoring") {
    return <RestoringScreen />;
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (status === "unavailable") {
    return <SessionUnavailableScreen onRetry={retryRestore} />;
  }

  return <Outlet />;
}

export function AnonymousBoundary() {
  const { status, retryRestore } = useAuth();
  const location = useLocation();
  const setupQuery = useQuery({ queryKey: ["setup", "status"], queryFn: getSetupStatus, retry: false });
  if (status === "restoring") {
    return <RestoringScreen />;
  }
  if (status === "unavailable") {
    return <SessionUnavailableScreen onRetry={retryRestore} />;
  }
  if (status === "authenticated") {
    return <Navigate to="/dashboard" replace />;
  }
  // 首次初始化：把匿名访问者送到 /setup。必须排除「当前已经在 /setup」的情况，
  // 否则这里会一边渲染 <Navigate to="/setup"> 一边停留在 /setup，形成无限重定向，
  // 页面始终是空白。
  if (setupQuery.data?.setupRequired && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }
  return <Outlet />;
}

function RestoringScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Spinner className="size-5" />
    </div>
  );
}

function SessionUnavailableScreen({ onRetry }: { onRetry: () => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-medium">{t("auth.sessionUnavailable")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.sessionUnavailableDescription")}</p>
        <Button size="sm" className="mt-5" onClick={() => void onRetry()}>{t("auth.retrySession")}</Button>
      </div>
    </div>
  );
}
