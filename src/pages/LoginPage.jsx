import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Music2, AlertCircle } from 'lucide-react';
import { redirectToSpotifyAuth } from '../lib/spotifyAuth';
import { redirectToYouTubeAuth } from '../lib/youtubeAuth';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTranslation } from '../store/useLanguageStore';
import { LanguageSelector } from '../components/ui/LanguageSelector';

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    // Interceptar parámetros de "QR de Administrador" para control remoto
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    const admin = params.get('admin');

    if (session && admin) {
      const { setSessionId, setHostSecret, setIsAdminMode } = useSettingsStore.getState();
      setSessionId(session);
      setHostSecret(admin);
      setIsAdminMode(true);
      import('sonner').then(({ toast }) => toast.success('Vinculado como Control Remoto.'));
      // Redirigir directamente al dashboard sin pedir login
      navigate('/app/dashboard');
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-bg-root flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background radial glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Language Selector Top Right */}
      <div className="absolute top-4 right-4 z-50">
        <LanguageSelector />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center mb-5 shadow-glow">
            <Music2 size={40} className="text-accent" />
          </div>
          <h1 className="text-4xl font-bold text-gradient mb-2">Envairo</h1>
          <p className="text-text-muted text-center max-w-xs">
            {t('login.title')}
          </p>
        </div>

        {/* Auth Buttons */}
        <div className="card p-6 space-y-4 mb-6">
          <h2 className="text-lg font-semibold text-text-primary text-center mb-2">
            {t('login.access')}
          </h2>

          {/* Spotify Login */}
          <button
            onClick={redirectToSpotifyAuth}
            className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #1DB954, #17a349)',
              boxShadow: '0 4px 20px rgba(29,185,84,0.3)',
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.479.659.24 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15.001 10.62 18.66 12.84c.361.181.54.78.301 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.56.3z" />
            </svg>
            {t('login.spotify')}
          </button>
          
          {/* YouTube Login */}
          <button
            onClick={redirectToYouTubeAuth}
            className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #FF0000, #cc0000)',
              boxShadow: '0 4px 20px rgba(255,0,0,0.3)',
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            {t('login.youtube_login')}
          </button>
        </div>

        {/* Alert */}
        <div className="border border-warning/30 bg-warning/10 rounded-xl p-4 flex gap-3">
          <AlertCircle size={18} className="text-warning flex-shrink-0 mt-0.5" />
          <p className="text-sm text-warning/90 leading-relaxed">
            <strong>Importante:</strong> Para usar el reproductor en vivo se requiere
            una cuenta de <strong>Spotify Premium</strong> activa.
          </p>
        </div>

        {/* Footer with Legal Links */}
        <div className="mt-8 text-center text-sm text-text-secondary/70 flex justify-center gap-4">
          <Link to="/privacy" className="hover:text-primary transition-colors">Política de Privacidad</Link>
          <span>&bull;</span>
          <Link to="/terms" className="hover:text-primary transition-colors">Términos y Condiciones</Link>
        </div>
      </div>
    </div>
  );
}
