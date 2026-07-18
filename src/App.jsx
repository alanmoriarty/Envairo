import React, { useEffect } from 'react';
import { Toaster } from 'sonner';
import AppRouter from './router';
import { usePlayerStore } from './store/usePlayerStore';
import { useInactivityTimeout } from './hooks/useInactivityTimeout';
import { redirectToSpotifyAuth } from './lib/spotifyAuth';
import { toast } from 'sonner';

export default function App() {
  useInactivityTimeout();
  // Sincronizar el estado entre pestañas (Host vs Guest local)
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'bq-player') {
        usePlayerStore.persist.rehydrate();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Handle Spotify 401 Unauthorized errors globally
  useEffect(() => {
    let reconnecting = false;
    const handleAuthError = () => {
      if (reconnecting) return;
      reconnecting = true;
      toast.error('Tu sesión de Spotify ha expirado. Reconectando automáticamente...', {
        duration: 3000,
        position: 'top-center'
      });
      setTimeout(() => {
        redirectToSpotifyAuth(false).catch((err) => {
          console.error('Failed to silent reconnect', err);
          reconnecting = false;
        });
      }, 2000);
    };

    window.addEventListener('spotify_auth_error', handleAuthError);
    return () => window.removeEventListener('spotify_auth_error', handleAuthError);
  }, []);

  return (
    <>
      <AppRouter />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#161224',
            border: '1px solid rgba(157,78,221,0.3)',
            color: '#F1ECF9',
            borderRadius: '12px',
            fontFamily: 'Inter, sans-serif',
          },
          className: 'shadow-glow-sm',
        }}
        richColors
      />
    </>
  );
}
