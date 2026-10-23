import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { CHUNK_RELOAD_KEY, isChunkLoadError, recoverFromChunkError } from "@/app/chunk-error";

export function AppErrorBoundary() {
  const error = useRouteError();
  const { t } = useTranslation();

  const chunkFailure = isChunkLoadError(error);
  useEffect(() => {
    if (!chunkFailure) return;
    recoverFromChunkError();
  }, [chunkFailure]);

  const detail = isRouteErrorResponse(error)
    ? error.statusText || String(error.status)
    : error instanceof Error
      ? error.message
      : String(error ?? "");

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-lg">
        <div className="rounded-xl border-2 border-border bg-card p-6 shadow-float">
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-foreground text-background">
              <AlertTriangle className="size-5" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-[19px] font-bold leading-7">{t("errors.app.title")}</h1>
              <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
                {chunkFailure ? t("errors.app.chunkDescription") : t("errors.app.description")}
              </p>
            </div>
          </div>

          {detail ? (
            <p className="mt-4 break-words rounded-lg border-2 border-border bg-muted px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground">
              {detail}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                try {
                  window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
                } catch {
                  // ignore
                }
                window.location.reload();
              }}
            >
              <RefreshCw />{t("errors.app.reload")}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => (window.location.href = "/dashboard")}>
              <RotateCcw />{t("errors.app.backToDashboard")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
