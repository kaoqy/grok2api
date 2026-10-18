import { Navigate, createBrowserRouter } from "react-router-dom";

import { AnonymousBoundary, AuthBoundary } from "@/app/auth-boundary";
import { DeferredAccountsPage, DeferredAppShell, DeferredClientKeysPage, DeferredDashboardPage, DeferredGalleryPage, DeferredModelsPage, DeferredPlaygroundPage, DeferredRegistrationPage, DeferredRequestAuditsPage, DeferredSettingsPage } from "@/app/deferred-pages";
import { LoginPage } from "@/features/auth/login-page";
import { SetupPage } from "@/features/auth/setup-page";

export const router = createBrowserRouter([
  {
    element: <AnonymousBoundary />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/setup", element: <SetupPage /> },
    ],
  },
  {
    element: <AuthBoundary />,
    children: [
      {
        element: <DeferredAppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: <DeferredDashboardPage /> },
          { path: "/accounts", element: <DeferredAccountsPage /> },
          { path: "/models", element: <DeferredModelsPage /> },
          { path: "/playground", element: <DeferredPlaygroundPage /> },
          { path: "/creative-console", element: <Navigate to="/playground" replace /> },
          { path: "/client-keys", element: <DeferredClientKeysPage /> },
          { path: "/gallery", element: <DeferredGalleryPage /> },
          { path: "/video-gallery", element: <Navigate to="/gallery" replace /> },
          { path: "/request-audits", element: <DeferredRequestAuditsPage /> },
          { path: "/quality-guard", element: <Navigate to="/dashboard" replace /> },
          { path: "/registration", element: <DeferredRegistrationPage /> },
          { path: "/settings", element: <DeferredSettingsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
