import React, { useState, useEffect, useRef } from 'react';
import { Zap, HelpCircle, Mic2, Users, X } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';

// Mock lyrics for karaoke demo
const DEMO_LYRICS = [
  { time: 0, text: 'En el silencio de la noche' },
  { time: 3, text: 'Tu voz me llama sin cesar' },
  { time: 6, text: 'Y entre las sombras de mi mente' },
  { time: 9, text: 'Solo te puedo recordar' },
  { time: 12, text: 'Envairo — La música nos une' },
  { time: 15, text: 'Pide tu canción favorita' },
  { time: 18, text: 'Y déjate llevar por el ritmo' },
  { time: 21, text: 'Esta noche es tuya, disfruta' },
];

const ICE_BREAKER_OPTIONS = [
  ['María 🌸', 'Carlos 🎸', 'Ana 💃', 'Pedro 🎤'],
  ['La mesa del fondo 🍻', 'El DJ 🎧', 'Los de la barra 🥂', 'Los bailarines 💃'],
  ['@ElAnfitión', '@PedritoVIP', '@LaLocaDelBaile', '@MisterMisterio'],
];

export default function ActivitiesPage() {
  const { currentTrack } = usePlayerStore();
  const [iceOptions] = useState(ICE_BREAKER_OPTIONS[Math.floor(Math.random() * ICE_BREAKER_OPTIONS.length)]);
  const [revealed, setRevealed] = useState(false);
  const [answer] = useState(Math.floor(Math.random() * 4));
  const [selected, setSelected] = useState(null);

  // Karaoke
  const [karaokeOpen, setKaraokeOpen] = useState(false);
  const [karaokeTime, setKaraokeTime] = useState(0);
  const karaokeRef = useRef(null);

  useEffect(() => {
    if (!karaokeOpen) return;
    const interval = setInterval(() => {
      setKaraokeTime((t) => (t + 1) % (DEMO_LYRICS.length * 3 + 3));
    }, 1000);
    return () => clearInterval(interval);
  }, [karaokeOpen]);

  const currentLyricIdx = DEMO_LYRICS.reduce((acc, l, i) => {
    if (karaokeTime >= l.time) return i;
    return acc;
  }, 0);

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
            {DEMO_LYRICS.map((line, i) => (
              <p
                key={i}
                className={`text-lg font-bold transition-all duration-300 leading-relaxed karaoke-word ${
                  i === currentLyricIdx && karaokeOpen ? 'active' : 'text-text-muted'
                }`}
                style={{ display: i === currentLyricIdx ? 'block' : i === currentLyricIdx - 1 || i === currentLyricIdx + 1 ? 'block' : 'none' }}
              >
                {line.text}
              </p>
            ))}
            {!karaokeOpen && (
              <p className="text-text-subtle text-sm">Haz clic en "Activar Karaoke" para iniciar</p>
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

          <div className="space-y-4">
            {DEMO_LYRICS.map((line, i) => (
              <p
                key={i}
                className={`font-bold transition-all duration-500 karaoke-word ${
                  i === currentLyricIdx
                    ? 'active text-5xl md:text-6xl'
                    : Math.abs(i - currentLyricIdx) === 1
                    ? 'text-2xl text-text-muted'
                    : 'text-lg text-text-subtle opacity-30'
                }`}
              >
                {line.text}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
