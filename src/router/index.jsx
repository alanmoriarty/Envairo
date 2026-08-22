import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';

import GuestPage from '../pages/GuestPage';
import DashboardPage from '../pages/DashboardPage';
import OnboardingPage from '../pages/OnboardingPage';
import SettingsPage from '../pages/SettingsPage';
import MetricsPage from '../pages/MetricsPage';
import ActivitiesPage from '../pages/ActivitiesPage';
import SupportPage from '../pages/SupportPage';
import PrivacyPage from '../pages/PrivacyPage';
import TermsPage from '../pages/TermsPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import TVDisplayPage from '../pages/TVDisplayPage';
import { RootLayout } from '../components/layout/RootLayout';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';

function RequireAuth({ children }) {
  const { isAuthenticated, user } = useAuthStore();
  const { isAdminMode, sessionId, hostSecret } = useSettingsStore();

  const isUserAuthenticated = !!(isAuthenticated && user);
  const isValidRemoteAdmin = !!(isAdminMode && sessionId && hostSecret);

  if (!isUserAuthenticated && !isValidRemoteAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
}

const router = createBrowserRouter([
  { path: '/', element: <LoginPage />, errorElement: <ErrorBoundary /> },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/terms', element: <TermsPage /> },

  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/pair', element: <Navigate to="/app/dashboard" replace /> },
  { path: '/guest/:sessionId', element: <GuestPage />, errorElement: <ErrorBoundary /> },
  {
    path: '/onboarding',
    element: (
      <ErrorBoundary>
        <RequireAuth>
          <OnboardingPage />
        </RequireAuth>
      </ErrorBoundary>
    )
  },
  {
    path: '/tv',
    element: (
      <ErrorBoundary>
        <TVDisplayPage />
      </ErrorBoundary>
    ),
    errorElement: (
      <ErrorBoundary>
        <TVDisplayPage />
      </ErrorBoundary>
    )
  },
  {
    path: '/app',
    element: (
      <ErrorBoundary>
        <RequireAuth>
          <RootLayout />
        </RequireAuth>
      </ErrorBoundary>
    ),
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'metrics', element: <MetricsPage /> },
      { path: 'activities', element: <ActivitiesPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'support', element: <SupportPage /> },
    ],
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
