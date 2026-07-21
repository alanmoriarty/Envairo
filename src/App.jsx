import React, { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import AppRouter from './router';
import { usePlayerStore } from './store/usePlayerStore';
import { useInactivityTimeout } from './hooks/useInactivityTimeout';
import { redirectToSpotifyAuth, clearSpotifyTokens } from './lib/spotifyAuth';
import { supabase } from './lib/supabase';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';

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

  // Self-heal playback engine if it was lost from local storage
  useEffect(() => {
    const fixEngine = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const intent = localStorage.getItem('auth_intent');
        const provider = intent === 'youtube' ? 'google' : (session?.user?.app_metadata?.provider || 'spotify');
        
        if (provider === 'google') {
          usePlayerStore.getState().setPlaybackEngine('youtube');
        }
      } catch(e) {}
      setEngineChecked(true);
    };
    fixEngine();
  }, []);

  // Handle Spotify 401 Unauthorized errors globally
  useEffect(() => {
    const handleAuthError = () => {
      if (usePlayerStore.getState().playbackEngine === 'youtube') return;
      setSessionExpired(true);
    };

    window.addEventListener('spotify_auth_error', handleAuthError);
    return () => window.removeEventListener('spotify_auth_error', handleAuthError);
  }, []);

  if (!engineChecked) return null;

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      await supabase.auth.signOut();
      clearSpotifyTokens();
      await redirectToSpotifyAuth(false);
    } catch (err) {
      console.error('Failed to silent reconnect', err);
      setIsReconnecting(false);
    }
  };

  return (
    <>
      <AppRouter />
      
      {/* Modal de Sesión Expirada */}
      {sessionExpired && usePlayerStore.getState().playbackEngine !== 'youtube' && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card p-8 max-w-sm w-full text-center flex flex-col items-center gap-4 animate-in zoom-in-95 fade-in relative">
            <button 
              onClick={() => setSessionExpired(false)}
              className="absolute top-2 right-2 text-text-muted hover:text-white"
            >
              ×
            </button>
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 mb-2">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-text-primary">Sesión Expirada</h2>
            <p className="text-text-muted text-sm mb-4">
              Por seguridad, Spotify cierra tu sesión cada hora. Haz clic abajo para reconectar y seguir la fiesta sin interrupciones.
            </p>
            <button
              onClick={handleReconnect}
              disabled={isReconnecting}
              className="btn-primary w-full py-3"
            >
              {isReconnecting ? 'Reconectando...' : 'Reconectar Spotify'}
            </button>
          </div>
        </div>
      )}

      <Toaster
        position="bottom-center"
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
