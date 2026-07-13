import React, { useState, useEffect, useRef } from 'react';
import { Zap, HelpCircle, Mic2, Users, X } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';

// Remove mock DEMO_LYRICS
const ICE_BREAKER_OPTIONS = [
  ['María 🌸', 'Carlos 🎸', 'Ana 💃', 'Pedro 🎤'],
  ['La mesa del fondo 🍻', 'El DJ 🎧', 'Los de la barra 🥂', 'Los bailarines 💃'],
  ['@ElAnfitión', '@PedritoVIP', '@LaLocaDelBaile', '@MisterMisterio'],
];

export default function ActivitiesPage() {
  const { currentTrack, progress, duration } = usePlayerStore();
  const [iceOptions] = useState(ICE_BREAKER_OPTIONS[Math.floor(Math.random() * ICE_BREAKER_OPTIONS.length)]);
  const [revealed, setRevealed] = useState(false);
  const [answer] = useState(Math.floor(Math.random() * 4));
  const [selected, setSelected] = useState(null);

  // Karaoke
  const [karaokeOpen, setKaraokeOpen] = useState(false);
  const karaokeRef = useRef(null);
  const lyricsContainerRef = useRef(null);

  const [lyricsLines, setLyricsLines] = useState([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState('');

  // Fetch real lyrics
  useEffect(() => {
    if (!currentTrack) {
       setLyricsLines([]);
       return;
    }

    const fetchLyrics = async () => {
      setLyricsLoading(true);
      setLyricsError('');
      try {
        const artist = currentTrack.artists.split(',')[0].trim();
        const title = currentTrack.name.replace(/\(.*\)|\[.*\]/g, '').trim();
        const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
        
        if (!res.ok) throw new Error('Letras no encontradas');
        const data = await res.json();
        
        if (data.lyrics) {
          const cleaned = data.lyrics.replace(/Paroles de la chanson.*?\r?\n\r?\n/, '');
          const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          setLyricsLines(lines);
        } else {
          throw new Error('Letras no encontradas');
        }
      } catch (err) {
        setLyricsError(err.message);
        setLyricsLines([]);
      } finally {
        setLyricsLoading(false);
      }
    };

    fetchLyrics();
  }, [currentTrack]);

  // Autoscroll logic
  useEffect(() => {
    if (karaokeOpen && lyricsLines.length > 0 && lyricsContainerRef.current && duration > 0) {
      const scrollRatio = progress / duration;
      const container = lyricsContainerRef.current;
      const adjustedRatio = Math.max(0, Math.min(1, (scrollRatio - 0.1) / 0.8));
      const maxScroll = container.scrollHeight - container.clientHeight;
      
      if (maxScroll > 0) {
        container.scrollTo({
          top: maxScroll * adjustedRatio,
          behavior: document.visibilityState === 'visible' ? 'smooth' : 'auto'
        });
      }
    }
  }, [karaokeOpen, progress, duration, lyricsLines]);

  // Close karaoke automatically if user switches tabs to prevent audio/performance issues
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setKaraokeOpen(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const openKaraoke = () => {
    setKaraokeOpen(true);
    if (karaokeRef.current?.requestFullscreen) {
      karaokeRef.current.requestFullscreen();
    }
  };

  const handleOptionSelect = (i) => {
    setSelected(i);
    setRevealed(true);
  };

  const resetIcebreaker = () => {
    setSelected(null);
    setRevealed(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Zap size={22} className="text-accent" /> Actividades
        </h1>
        <p className="text-text-muted text-sm mt-1">Anima tu evento con juegos interactivos</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Icebreaker */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Users size={18} className="text-accent" />
            <h2 className="font-bold text-text-primary">Rompehielos</h2>
          </div>
          <p className="text-text-muted text-sm mb-5">
            ¿Quién pidió la canción actual? ¡Adivina!
          </p>

          {currentTrack ? (
            <div className="flex items-center gap-3 p-3 bg-accent/10 border border-accent/20 rounded-xl mb-5">
              {currentTrack.image && (
                <img src={currentTrack.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
              )}
              <div>
                <p className="text-sm font-bold text-text-primary">{currentTrack.name}</p>
                <p className="text-xs text-text-muted">{currentTrack.artists}</p>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-bg-elevated rounded-xl mb-5 text-sm text-text-muted text-center">
              Inicia la reproducción para activar el juego
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            {iceOptions.map((opt, i) => (
              <button
                key={i}
                onClick={() => !revealed && handleOptionSelect(i)}
                className={`p-3 rounded-xl text-sm font-semibold transition-all border ${
                  !revealed
                    ? 'bg-bg-elevated border-white/5 hover:border-accent/40 hover:bg-accent/10 text-text-primary'
                    : i === answer
                    ? 'bg-success/20 border-success/50 text-success'
                    : i === selected
                    ? 'bg-danger/20 border-danger/50 text-danger'
                    : 'bg-bg-elevated border-white/5 text-text-subtle'
                }`}
              >
                {opt}
                {revealed && i === answer && ' ✓'}
              </button>
            ))}
          </div>

          {revealed && (
            <div className="text-center space-y-2 animate-slide-up">
              <p className={`font-bold ${selected === answer ? 'text-success' : 'text-danger'}`}>
                {selected === answer ? '🎉 ¡Correcto!' : '❌ ¡Fallaste!'}
              </p>
              <button onClick={resetIcebreaker} className="btn-secondary text-sm py-2 px-4">
                Jugar de nuevo
              </button>
            </div>
          )}
        </div>

        {/* Karaoke */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Mic2 size={18} className="text-accent" />
            <h2 className="font-bold text-text-primary">Modo Karaoke</h2>
          </div>
          <p className="text-text-muted text-sm mb-5">
            Las letras de la canción en pantalla completa para que todos canten
          </p>

          {/* Lyrics preview */}
          <div className="bg-bg-elevated rounded-xl p-4 mb-5 min-h-[120px] flex flex-col items-center justify-center text-center">
            {lyricsLoading ? (
              <p className="text-text-muted text-sm animate-pulse">Buscando letras reales...</p>
            ) : lyricsError ? (
              <p className="text-text-muted text-sm">{lyricsError}</p>
            ) : lyricsLines.length > 0 ? (
              <div className="space-y-1">
                <p className="text-lg font-bold text-text-primary leading-relaxed truncate px-4">
                  {lyricsLines[0]}
                </p>
                {lyricsLines.length > 1 && (
                  <p className="text-text-muted text-sm truncate px-4">
                    {lyricsLines[1]}
                  </p>
                )}
              </div>
            ) : (
               <p className="text-text-subtle text-sm">Reproduce una canción para buscar letras</p>
            )}
          </div>

          <button onClick={openKaraoke} className="btn-primary w-full flex items-center justify-center gap-2">
            <Mic2 size={16} />
            Activar Modo Karaoke
          </button>
        </div>
      </div>

      {/* Karaoke fullscreen overlay */}
      {karaokeOpen && (
        <div
          ref={karaokeRef}
          className="fixed inset-0 z-[100] bg-bg-root flex flex-col items-center justify-center text-center p-8"
          style={{ background: 'radial-gradient(ellipse at center, #1E1830 0%, #0D0B14 100%)' }}
        >
          <button
            onClick={() => setKaraokeOpen(false)}
            className="absolute top-6 right-6 btn-ghost"
          >
            <X size={24} />
          </button>

          {currentTrack && (
            <div className="mb-8">
              <p className="text-text-muted text-sm mb-1">Reproduciendo</p>
              <p className="text-xl font-bold text-text-primary">{currentTrack.name}</p>
              <p className="text-text-muted">{currentTrack.artists}</p>
            </div>
          )}

          <div 
            ref={lyricsContainerRef}
            className="flex-1 w-full max-w-4xl overflow-y-auto mt-4 px-4 pb-32 scroll-smooth no-scrollbar"
          >
            <div className="space-y-8 pt-32 pb-64 text-center">
              {lyricsLoading ? (
                <p className="text-2xl text-text-muted animate-pulse">Cargando letras...</p>
              ) : lyricsError ? (
                <p className="text-2xl text-text-muted">{lyricsError}</p>
              ) : (
                lyricsLines.map((line, i) => (
                  <p
                    key={i}
                    className="font-bold text-3xl md:text-5xl text-white/90 hover:text-accent transition-colors"
                    style={{ textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
                  >
                    {line}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
