import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import CallbackPage from '../pages/CallbackPage';
import GuestPage from '../pages/GuestPage';
import DashboardPage from '../pages/DashboardPage';
import SettingsPage from '../pages/SettingsPage';
import MetricsPage from '../pages/MetricsPage';
import ActivitiesPage from '../pages/ActivitiesPage';
import SupportPage from '../pages/SupportPage';
import PrivacyPage from '../pages/PrivacyPage';
import TermsPage from '../pages/TermsPage';
import { RootLayout } from '../components/layout/RootLayout';
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
  { path: '/', element: <LoginPage /> },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/terms', element: <TermsPage /> },
  { path: '/callback', element: <CallbackPage /> },
  { path: '/guest/:sessionId', element: <GuestPage /> },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <RootLayout />
      </RequireAuth>
    ),
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
