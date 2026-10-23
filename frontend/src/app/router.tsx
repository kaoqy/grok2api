import { Navigate, createBrowserRouter } from "react-router-dom";

import { AnonymousBoundary, AuthBoundary } from "@/app/auth-boundary";
import { AppErrorBoundary } from "@/app/error-boundary";
import { DeferredAccountImportPage, DeferredAccountsPage, DeferredAppShell, DeferredClientKeysPage, DeferredDashboardPage, DeferredGalleryPage, DeferredModelsPage, DeferredPlaygroundPage, DeferredRequestAuditsPage, DeferredSettingsPage } from "@/app/deferred-pages";
import { LoginPage } from "@/features/auth/login-page";
import { SetupPage } from "@/features/auth/setup-page";

export const router = createBrowserRouter([
  {
    // A failed lazy import (stale chunk after a rebuild) must not dead-end the
    // whole app: the boundary reloads it once and then offers a way out.
    errorElement: <AppErrorBoundary />,
    element: <AnonymousBoundary />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/setup", element: <SetupPage /> },
    ],
  },
  {
    errorElement: <AppErrorBoundary />,
    element: <AuthBoundary />,
    children: [
      {
        element: <DeferredAppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: <DeferredDashboardPage /> },
          { path: "/accounts", element: <DeferredAccountsPage /> },
          { path: "/account-import", element: <DeferredAccountImportPage /> },
          { path: "/models", element: <DeferredModelsPage /> },
          { path: "/playground", element: <DeferredPlaygroundPage /> },
          { path: "/creative-console", element: <Navigate to="/playground" replace /> },
          { path: "/client-keys", element: <DeferredClientKeysPage /> },
          { path: "/gallery", element: <DeferredGalleryPage /> },
          { path: "/video-gallery", element: <Navigate to="/gallery" replace /> },
          { path: "/request-audits", element: <DeferredRequestAuditsPage /> },
          { path: "/quality-guard", element: <Navigate to="/dashboard" replace /> },
          { path: "/settings", element: <DeferredSettingsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
