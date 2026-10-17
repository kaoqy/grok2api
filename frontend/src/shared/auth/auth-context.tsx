import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  apiRequest,
  decodeAdminDTO,
  decodeLoggedOut,
  decodeLoginResponseDTO,
  refreshAccessToken,
  setAccessToken,
  subscribeSessionInvalidated,
  type AdminDTO,
} from "@/shared/api/client";
import { AuthContext, type AuthStatus } from "@/shared/auth/auth-state";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [admin, setAdmin] = useState<AdminDTO | null>(null);
  const [status, setStatus] = useState<AuthStatus>("restoring");

  const restoreSession = useCallback(async (): Promise<void> => {
    setStatus("restoring");
    const refreshResult = await refreshAccessToken();
    if (refreshResult === "invalid") {
      setAdmin(null);
      setStatus("anonymous");
      return;
    }
    if (refreshResult === "unavailable") {
      setStatus("unavailable");
      return;
    }

    try {
      const value = await apiRequest("/api/admin/v1/me", { retryAuth: false }, decodeAdminDTO);
      setAdmin(value);
      setStatus("authenticated");
    } catch (error) {
      setAccessToken(null);
      setAdmin(null);
      setStatus(error instanceof ApiError && error.status === 401 ? "anonymous" : "unavailable");
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeSessionInvalidated(() => {
      setAdmin(null);
      setStatus("anonymous");
    });

    const restoreTimer = window.setTimeout(() => {
      void restoreSession();
    }, 0);

    return () => {
      window.clearTimeout(restoreTimer);
      unsubscribe();
    };
  }, [restoreSession]);

  async function login(username: string, password: string): Promise<void> {
    const response = await apiRequest("/api/admin/v1/auth/login", {
      method: "POST",
      body: { username, password },
      authenticated: false,
      retryAuth: false,
    }, decodeLoginResponseDTO);
    setAccessToken(response.tokens.accessToken);
    setAdmin(response.admin);
    setStatus("authenticated");
  }

  async function logout(): Promise<void> {
    try {
      await apiRequest("/api/admin/v1/auth/logout", {
        method: "POST",
        body: {},
        authenticated: false,
        retryAuth: false,
      }, decodeLoggedOut);
    } finally {
      setAccessToken(null);
      setAdmin(null);
      setStatus("anonymous");
    }
  }

  async function setup(username: string, password: string): Promise<void> {
    const response = await apiRequest("/api/admin/v1/auth/setup", {
      method: "POST",
      body: { username, password },
      authenticated: false,
      retryAuth: false,
    }, decodeLoginResponseDTO);
    // 初始化完成后管理员已存在，同步更新缓存的 setup 状态，
    // 避免登出后又被匿名边界重定向回 /setup。
    queryClient.setQueryData(["setup", "status"], { setupRequired: false });
    setAccessToken(response.tokens.accessToken);
    setAdmin(response.admin);
    setStatus("authenticated");
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiRequest("/api/admin/v1/me/password", {
      method: "PUT",
      body: { currentPassword, newPassword },
    }, () => undefined);
  }

  return (
    <AuthContext.Provider value={{ admin, status, retryRestore: restoreSession, login, setup, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
