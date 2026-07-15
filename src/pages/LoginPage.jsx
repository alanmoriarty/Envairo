import React from 'react';
import { Music2, AlertCircle } from 'lucide-react';
import { redirectToSpotifyAuth } from '../lib/spotifyAuth';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-bg-root flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background radial glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center mb-5 shadow-glow">
            <Music2 size={40} className="text-accent" />
          </div>
          <h1 className="text-4xl font-bold text-gradient mb-2">Envairo</h1>
          <p className="text-text-muted text-center max-w-xs">
            La forma más elegante de gestionar las canciones de tu evento
          </p>
        </div>

        {/* Auth Buttons */}
        <div className="card p-6 space-y-4 mb-6">
          <h2 className="text-lg font-semibold text-text-primary text-center mb-2">
            Accede a tu panel
          </h2>

          {/* Spotify Login */}
          <button
            onClick={redirectToSpotifyAuth}
            className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-semibold text-white transition-all duration-200 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #1DB954, #17a349)',
              boxShadow: '0 4px 20px rgba(29,185,84,0.3)',
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Iniciar sesión con Spotify
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
      </div>
    </div>
  );
}
