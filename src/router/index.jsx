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
import PairTVPage from '../pages/PairTVPage';
import { RootLayout } from '../components/layout/RootLayout';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';

function RequireAuth({ children }) {
  const { isAuthenticated } = useAuthStore();
  const { isAdminMode } = useSettingsStore();
  // Allow access if authenticated with Spotify, OR if in remote control mode, OR if hosting via YouTube
  const isYoutubeHost = (() => {
    try {
      const store = JSON.parse(localStorage.getItem('player-storage'));
      return store?.state?.playbackEngine === 'youtube';
    } catch {
      return false;
    }
  })();
  
  if (!isAuthenticated && !isAdminMode && !isYoutubeHost) return <Navigate to="/" replace />;
  return children;
}

const router = createBrowserRouter([
  { path: '/', element: <LoginPage />, errorElement: <ErrorBoundary /> },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/terms', element: <TermsPage /> },

  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/pair', element: <PairTVPage />, errorElement: <ErrorBoundary /> },
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
