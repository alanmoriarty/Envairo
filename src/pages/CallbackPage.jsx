import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/spotifyApi';
import { useAuthStore } from '../store/useAuthStore';
import { Loader2, Music2 } from 'lucide-react';

export default function CallbackPage() {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [error, setError] = useState(null);
  const fetchedRef = React.useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      try {
        // Supabase already parsed the URL hash by now.
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        
        if (authError) throw authError;
        
        if (!session) {
          navigate('/');
          return;
        }

        // Save the Spotify access token for the Web Playback SDK
        if (session.provider_token) {
          localStorage.setItem('spotify_access_token', session.provider_token);
        }

        const user = await getCurrentUser();
        setUser(user);
        
        if (user.product === 'premium') {
          navigate('/app/dashboard');
        } else {
          navigate('/app/metrics');
        }
      } catch (err) {
        setError(err.message || 'Error al autenticar');
      }
    })();
  }, [navigate, setUser]);

  if (error) {
    const isAuthError = error.includes('403') || error.toLowerCase().includes('forbidden') || error.includes('API error 403');

    return (
      <div className="min-h-screen bg-bg-root flex flex-col items-center justify-center p-4">
        <div className="card p-8 flex flex-col items-center text-center max-w-md w-full animate-in zoom-in-95">
          <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center text-danger mb-4">
            <Music2 size={32} />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">
            {isAuthError ? 'Cuenta no autorizada' : 'Error de Autenticación'}
          </h2>
          <p className="text-text-muted text-sm mb-6">
            {isAuthError
              ? 'Para ser anfitrión en Envairo QR necesitas una cuenta de Spotify Premium.'
              : error}
          </p>
          <div className="flex flex-col w-full gap-3">
            {isAuthError && (
              <a
                href="https://www.spotify.com/premium/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full py-3 flex items-center justify-center"
              >
                Obtener Spotify Premium
              </a>
            )}
            <button
              onClick={() => {
                localStorage.removeItem('spotify_access_token');
                localStorage.removeItem('spotify_refresh_token');
                navigate('/');
              }}
              className="btn-ghost w-full py-3 text-sm text-text-muted hover:text-text-primary"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-root flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center shadow-glow animate-pulse-glow">
        <Music2 size={32} className="text-accent" />
      </div>
      <div className="flex items-center gap-3">
        <Loader2 size={20} className="text-accent animate-spin" />
        <p className="text-text-muted">Conectando con Spotify...</p>
      </div>
    </div>
  );
}
