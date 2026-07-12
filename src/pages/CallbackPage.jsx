import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSpotifyToken, getAccessToken } from '../lib/spotifyAuth';
import { getCurrentUser } from '../lib/spotifyApi';
import { useAuthStore } from '../store/useAuthStore';
import { Loader2, Music2 } from 'lucide-react';

export default function CallbackPage() {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');

    if (errorParam) {
      setError('Acceso denegado por Spotify.');
      return;
    }

    if (!code) {
      navigate('/');
      return;
    }

    (async () => {
      try {
        await fetchSpotifyToken(code);
        const user = await getCurrentUser();
        setUser(user);
        navigate('/app/dashboard');
      } catch (err) {
        setError(err.message || 'Error al autenticar');
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-bg-root flex flex-col items-center justify-center gap-4">
        <p className="text-danger text-lg font-semibold">{error}</p>
        <button onClick={() => navigate('/')} className="btn-primary">
          Volver al inicio
        </button>
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
