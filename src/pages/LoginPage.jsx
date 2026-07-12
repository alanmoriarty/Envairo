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
            {/* Spotify SVG Icon */}
            <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Iniciar sesión con Spotify
          </button>

          {/* Google Button (visual only) */}
          <button
            onClick={() => alert('Integración con Google pendiente. Usa Spotify para la demo real.')}
            className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-semibold bg-white text-gray-800 hover:bg-gray-100 transition-all duration-200 active:scale-95 shadow-md"
          >
            {/* Google SVG Icon */}
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
              <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z"/>
              <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"/>
              <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
            </svg>
            Continuar con Google
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
