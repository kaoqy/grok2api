import { Download, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { exportConfigBackup, restoreConfigBackup } from "@/features/backup/backup-api";

// ConfigBackupPanel 提供一键备份与恢复：把运行设置、SOCKS 代理拓扑和
// 全部账号凭据（含 Cloudflare Cookie）打包成一个 JSON 文件。
export function ConfigBackupPanel() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function runExport(): Promise<void> {
    setExporting(true);
    try {
      const blob = await exportConfigBackup();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `grok2api-config-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(t("settings.backup.exported"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.generic"));
    } finally {
      setExporting(false);
    }
  }

  async function runRestore(file: File): Promise<void> {
    setRestoring(true);
    try {
      const result = await restoreConfigBackup(file);
      const restored = result.restored;
      toast.success(t("settings.backup.restored", {
        nodes: restored.nodes,
        profiles: restored.proxyProfiles,
        accounts: restored.grokBuild + restored.grokWeb + restored.grokConsole,
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.generic"));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <section className="rounded-xl border-2 border-border bg-card px-5 py-[18px] shadow-float">
      <div className="flex min-h-7 items-center justify-between gap-3 pb-1">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-foreground">{t("settings.backup.title")}</h2>
      </div>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">{t("settings.backup.description")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={exporting || restoring} onClick={() => void runExport()}>
          {exporting ? <Spinner /> : <Download />}
          {t("settings.backup.export")}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={exporting || restoring} onClick={() => fileInputRef.current?.click()}>
          {restoring ? <Spinner /> : <Upload />}
          {t("settings.backup.restore")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void runRestore(file);
          }}
        />
      </div>

      <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
        <RotateCcw className="mt-0.5 size-3.5 shrink-0" />
        {t("settings.backup.warning")}
      </p>
    </section>
  );
}
