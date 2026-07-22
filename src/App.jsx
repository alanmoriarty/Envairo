import React, { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import AppRouter from './router';
import { usePlayerStore } from './store/usePlayerStore';
import { usePwaStore } from './store/usePwaStore';
import { useAuthStore } from './store/useAuthStore';
import { useInactivityTimeout } from './hooks/useInactivityTimeout';
import { supabase } from './lib/supabase';
import { BackgroundVideo } from './components/layout/BackgroundVideo';
import { toast } from 'sonner';
import { AlertCircle, MonitorPlay } from 'lucide-react';

export default function App() {
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  useInactivityTimeout();
  // Sincronizar el estado entre pestañas (Host vs Guest local)
  const [engineChecked, setEngineChecked] = useState(false);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'bq-player') {
        usePlayerStore.persist.rehydrate();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    usePlayerStore.getState().setPlaybackEngine('youtube');
    setEngineChecked(true);
  }, []);

  const { setDeferredPrompt } = usePwaStore();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [setDeferredPrompt]);

  if (!engineChecked) return null;

  return (
    <>
      <BackgroundVideo />
      <AppRouter />
      
      {/* Modales de Spotify eliminados para enfocar la app en YouTube */}

      {/* Modal de Kickout (Eliminado) */}

      <Toaster
        position="top-center"
        offset="20px"
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
