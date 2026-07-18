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
  const [isSynced, setIsSynced] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState('');
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const lastScrolledIndex = useRef(-1);
  const userScrolled = useRef(false);
  const scrollTimeout = useRef(null);

  const handleScroll = () => {
    userScrolled.current = true;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      userScrolled.current = false;
    }, 4000); // Resume autoscroll after 4 seconds of inactivity
  };

  // Parse LRC format
  const parseLRC = (lrcString) => {
    const lines = lrcString.split('\n');
    const result = [];
    // Matches [mm:ss.xx], [mm:ss], [mm:ss.xxxx], or [mm:ss:xx]
    const regex = /\[(\d{2,}):(\d{2})(?:[:.](\d+))?\](.*)/;
    
    for (const line of lines) {
      const match = regex.exec(line);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        // Take up to 3 digits of ms, then pad or parseInt
        let msStr = match[3] || '0';
        if (msStr.length > 3) msStr = msStr.slice(0, 3);
        const milliseconds = parseInt(msStr.padEnd(3, '0'), 10);
        const text = match[4].trim();
        
        const timeMs = minutes * 60000 + seconds * 1000 + milliseconds;
        if (text) {
          result.push({ time: timeMs, text });
        }
      }
    }
    
    // Si la primera línea cantada tarda más de 5 segundos en aparecer,
    // agregamos una línea visual de "Intro musical" para que el usuario
    // entienda por qué la letra principal aún no se mueve.
    if (result.length > 0 && result[0].time > 5000) {
      result.unshift({ time: 0, text: '🎵 (Intro musical)' });
    }
    
    return result;
  };

  // Fetch real lyrics
  useEffect(() => {
    if (!currentTrack) {
       setLyricsLines([]);
       setIsSynced(false);
       return;
    }

    const fetchLyrics = async () => {
      setLyricsLoading(true);
      setLyricsError('');
      setActiveLineIndex(-1);
      // Set to -2 so the autoscroll useEffect is forced to trigger its initial top scroll
      lastScrolledIndex.current = -2;
      
      // Reset scroll position for new song (fallback)
      if (lyricsContainerRef.current) {
        lyricsContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
      }
      
      try {
        const artist = currentTrack.artists.split(',')[0].trim();
        const title = currentTrack.name.replace(/\(.*\)|\[.*\]/g, '').trim();
        
        // Use LRCLIB API GET endpoint (matches original ab6686c behavior exactly)
        const res = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`);
        
        if (!res.ok) throw new Error('Letras no encontradas');
        const data = await res.json();
        
        if (data.syncedLyrics) {
          const parsed = parseLRC(data.syncedLyrics);
          if (parsed.length > 0) {
            setLyricsLines(parsed);
            setIsSynced(true);
          } else {
            throw new Error('Formato LRC inválido');
          }
        } else if (data.plainLyrics) {
          const lines = data.plainLyrics.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          setLyricsLines(lines);
          setIsSynced(false);
        } else {
          throw new Error('Letras no encontradas');
        }
      } catch (err) {
        setLyricsError(err.message);
        setLyricsLines([]);
        setIsSynced(false);
      } finally {
        setLyricsLoading(false);
      }
    };

    fetchLyrics();
  }, [currentTrack]);

  // Autoscroll logic & sync
  useEffect(() => {
    if (lyricsLines.length === 0 || !karaokeOpen) return;
    if (userScrolled.current) return; // Prevent autoscroll if user is manually scrolling

    if (isSynced) {
      // Find the active line based on current progress
      let newActiveIndex = -1;
      for (let i = 0; i < lyricsLines.length; i++) {
        if (progress >= lyricsLines[i].time) {
          newActiveIndex = i;
        } else {
          break; // Since it's sorted by time, we can stop
        }
      }
      setActiveLineIndex(newActiveIndex);

      // Auto-scroll to the active element only if it changed
      if (newActiveIndex !== lastScrolledIndex.current) {
        lastScrolledIndex.current = newActiveIndex;
        if (newActiveIndex !== -1 && lyricsContainerRef.current) {
          const activeElem = document.getElementById(`lyric-line-${newActiveIndex}`);
          if (activeElem) {
            activeElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else if (newActiveIndex === -1 && lyricsContainerRef.current) {
          // If progress is before the first line, ensure we stay at the top
          lyricsContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    } else {
      // Fallback naive scrolling for plain text
      if (lyricsContainerRef.current && duration > 0) {
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
    }
  }, [karaokeOpen, progress, duration, lyricsLines, isSynced]);

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
              <div className="space-y-1 w-full min-w-0 overflow-hidden">
                <p className="text-lg font-bold text-text-primary leading-relaxed truncate px-4">
                  {isSynced ? lyricsLines[Math.max(0, activeLineIndex)]?.text : lyricsLines[0]}
                </p>
                {lyricsLines.length > 1 && (
                  <p className="text-text-muted text-sm truncate px-4">
                    {isSynced ? lyricsLines[Math.max(0, activeLineIndex) + 1]?.text : lyricsLines[1]}
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
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center text-center p-8 overflow-hidden bg-bg-root"
        >

          <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center">
            <button
              onClick={() => setKaraokeOpen(false)}
              className="fixed top-6 right-6 md:top-8 md:right-8 z-[200] p-3 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-lg border border-white/10 shadow-xl cursor-pointer transition-all hover:scale-105"
              title="Cerrar Karaoke"
            >
              <X size={28} />
            </button>

            {!currentTrack ? (
              <div className="flex-1 flex flex-col items-center justify-center w-full h-full">
                <Mic2 size={64} className="text-accent/30 mb-6 animate-bounce" />
                <p className="text-4xl font-bold text-white/50 animate-pulse">Preparando pista...</p>
              </div>
            ) : (
              <>
                <div className="mb-8 mt-4">
                  <p className="text-text-muted text-sm mb-1">Reproduciendo</p>
                  <p className="text-xl font-bold text-text-primary">{currentTrack.name}</p>
                  <p className="text-text-muted">{currentTrack.artists}</p>
                </div>

                <div 
                  ref={lyricsContainerRef}
                  onScroll={handleScroll}
                  onTouchMove={handleScroll}
                  onWheel={handleScroll}
                  className="flex-1 w-full max-w-4xl overflow-y-auto mt-4 px-4 pb-32 no-scrollbar"
                >
                  <div className="space-y-8 pt-32 pb-64 text-center">
                    {lyricsLoading ? (
                      <p className="text-2xl text-text-muted animate-pulse">Cargando letras...</p>
                    ) : lyricsError ? (
                      <p className="text-2xl text-text-muted">{lyricsError}</p>
                    ) : (
                      lyricsLines.map((line, i) => {
                        const isActive = isSynced ? i === activeLineIndex : false;
                        const isPast = isSynced ? i < activeLineIndex : false;
                        const lineText = isSynced ? line.text : line;
                        
                        return (
                          <p
                            key={i}
                            id={`lyric-line-${i}`}
                            className={`font-bold text-3xl md:text-5xl transition-all duration-300 ${
                              isSynced 
                                ? (isActive ? 'text-accent scale-105' : isPast ? 'text-white/40' : 'text-white/80')
                                : 'text-white/90 hover:text-accent'
                            }`}
                            style={{ textShadow: isActive ? '0 0 20px rgba(157, 78, 221, 0.5)' : '0 4px 20px rgba(0,0,0,0.5)' }}
                          >
                            {lineText}
                          </p>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
