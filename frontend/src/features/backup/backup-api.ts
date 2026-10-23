import { apiDownload, apiRequest } from "@/shared/api/client";
import { createValidatedDecoder, hasShape, isNumber } from "@/shared/api/decoder";

export type ConfigRestoreResult = {
  restored: {
    proxyProfiles: number;
    nodes: number;
    grokBuild: number;
    grokWeb: number;
    grokConsole: number;
  };
};

const restoredShape = hasShape({
  proxyProfiles: isNumber,
  nodes: isNumber,
  grokBuild: isNumber,
  grokWeb: isNumber,
  grokConsole: isNumber,
});

const restoreResultValidator = createValidatedDecoder<ConfigRestoreResult>("config restore result", (value) => {
  if (typeof value !== "object" || value === null) return false;
  const restored = (value as Record<string, unknown>).restored;
  return restoredShape(restored);
});

// exportConfigBackup 下载完整的配置备份：运行设置、代理拓扑与全部账号凭据。
export function exportConfigBackup(): Promise<Blob> {
  return apiDownload("/api/admin/v1/system/backup");
}

// restoreConfigBackup 用备份文件覆盖代理与账号配置。
export function restoreConfigBackup(file: File): Promise<ConfigRestoreResult> {
  return apiRequest(
    "/api/admin/v1/system/restore",
    {
      method: "POST",
      body: file,
      headers: { "Content-Type": "application/json" },
    },
    restoreResultValidator,
  );
}
