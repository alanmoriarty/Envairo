import React, { useRef, useEffect } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useYouTubeSDK } from '../../hooks/useYouTubeSDK';
import {
  Play, Pause, SkipForward, SkipBack,
  Volume2, VolumeX, Music2, Wifi, WifiOff, RotateCcw
} from 'lucide-react';

const formatArtists = (artists) => {
  if (typeof artists === 'string') return artists;
  if (Array.isArray(artists)) return artists.map(a => a.name || a).join(', ');
  if (typeof artists === 'object' && artists !== null && artists.name) return artists.name;
  return 'Artista Desconocido';
};

export function PersistentPlayer() {
  // Granular selectors: PersistentPlayer MUST subscribe to progress/duration/isPlaying
  // because it renders the progress bar. These are the only components that SHOULD
  // re-render on every progress tick.
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const progress = usePlayerStore(s => s.progress);
  const duration = usePlayerStore(s => s.duration);
  const volume = usePlayerStore(s => s.volume);
  const sdkReady = usePlayerStore(s => s.sdkReady);
  const queue = usePlayerStore(s => s.queue);
  const pendingResume = usePlayerStore(s => s.pendingResume);
  const setPendingResume = usePlayerStore(s => s.setPendingResume);
  const setVolume = usePlayerStore(s => s.setVolume);
  const activeDeviceId = usePlayerStore(s => s.activeDeviceId);
  const deviceId = usePlayerStore(s => s.deviceId);
  const playbackEngine = usePlayerStore(s => s.playbackEngine);


  const { controls: youtubeControls, ytReady } = useYouTubeSDK();

  const controls = youtubeControls;
  const isReady = ytReady;
  const progressRef = useRef(null);

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  const { user } = useAuthStore.getState();
  const isPremium = user?.product === 'premium';

  // Solo requerimos Premium si estamos usando Spotify
  if (playbackEngine === 'spotify' && !isPremium) return null;

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const handleProgressClick = (e) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const posMs = Math.round(pct * duration);
    const state = usePlayerStore.getState();

      if (state.youtubePlayer) {
        state.youtubePlayer.seekTo(posMs / 1000, true);
        usePlayerStore.getState().setProgress(posMs);
      }
  };

  const volumeDebounce = useRef(null);

  const handleVolumeChange = (e) => {
    const vol = parseInt(e.target.value, 10);
    if (vol > 0) previousVolume.current = vol; // Save last audible volume
    setVolume(vol); // Actualiza la UI de inmediato

    clearTimeout(volumeDebounce.current);
    volumeDebounce.current = setTimeout(() => {
      const state = usePlayerStore.getState();
      if (state.youtubePlayer) state.youtubePlayer.setVolume(vol);
    }, 300);
  };

  const handlePlayPause = () => {
    const state = usePlayerStore.getState();

    // GUARD: If no current track, the queue has ended.
    // Calling playVideo() directly would replay the last physical video
    // still loaded in the YT player iframe, causing the visual bug.
    if (!state.currentTrack) {
      // Attempt to start the next track in the queue if available
      const nextTrack = state.shiftQueue();
      if (nextTrack) {
        state.playEngineTrack(nextTrack);
      }
      // If queue is truly empty, do nothing (user must add songs)
      return;
    }

    if (state.youtubePlayer) {
      if (isPlaying) {
        state.youtubePlayer.pauseVideo();
      } else {
        const pState = typeof state.youtubePlayer.getPlayerState === 'function' ? state.youtubePlayer.getPlayerState() : null;
        // Si el reproductor no tiene video cargado (-1 o unstarted), invocar playEngineTrack directamente
        if (pState === -1 || pState === null || pState === 5) {
          state.playEngineTrack(state.currentTrack, state.progress, null, true);
        } else {
          state.youtubePlayer.playVideo();
        }
      }
    } else if (state.currentTrack) {
      state.playEngineTrack(state.currentTrack, state.progress, null, true);
    }
  };
  const previousVolume = useRef(volume || 100);

  const toggleMute = () => {
    if (volume > 0) {
      previousVolume.current = volume;
      handleVolumeChange({ target: { value: 0 } });
    } else {
      handleVolumeChange({ target: { value: previousVolume.current || 100 } });
    }
  };

  const handleRestart = () => {
    const state = usePlayerStore.getState();
      if (state.youtubePlayer) {
        state.youtubePlayer.seekTo(0, true);
        state.youtubePlayer.playVideo();
      }
  };

  // ── MediaSession API: elemento audio dummy para activar controles del sistema ──
  // Android/iOS necesitan un <audio> real activo para mostrar controles en notificaciones
  const dummyAudioRef = useRef(null);

  useEffect(() => {
    // Crear un audio dummy silenciado con un tono de 1Hz en loop
    const audio = new Audio();
    audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    audio.loop = true;
    audio.volume = 0.001; // Prácticamente silencioso pero "activo" para el OS
    audio.muted = false;
    dummyAudioRef.current = audio;

    return () => {
      audio.pause();
      dummyAudioRef.current = null;
    };
  }, []);

  // Sincronizar el audio dummy con el estado real de reproducción
  useEffect(() => {
    const audio = dummyAudioRef.current;
    if (!audio) return;
    if (isPlaying && currentTrack) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, currentTrack]);

  // Integración con MediaSession API para controles en segundo plano (notificaciones y pantalla de bloqueo)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (currentTrack) {
      const artworkUrl = currentTrack.album?.images?.[0]?.url || currentTrack.albumArt || 'https://envairoqr.com/pwa-512x512.png';

      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: currentTrack.name || 'Pista desconocida',
        artist: formatArtists(currentTrack.artists),
        album: currentTrack.album?.name || 'Envairo',
        artwork: [
          { src: artworkUrl, sizes: '512x512', type: 'image/png' },
          { src: artworkUrl, sizes: '256x256', type: 'image/png' },
          { src: artworkUrl, sizes: '128x128', type: 'image/png' }
        ]
      });

      // Re-registrar handlers con estado fresco en cada cambio de canción
      navigator.mediaSession.setActionHandler('play', () => {
        const state = usePlayerStore.getState();
        if (state.youtubePlayer) state.youtubePlayer.playVideo();
        dummyAudioRef.current?.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        const state = usePlayerStore.getState();
        if (state.youtubePlayer) state.youtubePlayer.pauseVideo();
        dummyAudioRef.current?.pause();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (!usePlayerStore.getState().checkSkipSpam()) return;
        const next = usePlayerStore.getState().shiftQueue();
        if (next) usePlayerStore.getState().playEngineTrack(next);
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        const prev = usePlayerStore.getState().prevQueue();
        if (prev) usePlayerStore.getState().playEngineTrack(prev);
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          const state = usePlayerStore.getState();
          if (state.youtubePlayer) {
            state.youtubePlayer.seekTo(details.seekTime, true);
            state.setProgress(Math.round(details.seekTime * 1000));
          }
        }
      });
    } else {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    }
  }, [currentTrack]);

  // Mantener sincronizado el playbackState y la posición de la barra de progreso de la notificación
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    if (isPlaying && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: duration / 1000,
          playbackRate: 1,
          position: Math.min(progress / 1000, duration / 1000)
        });
      } catch (e) {}
    }
  }, [isPlaying, progress, duration]);

  return (
    <>
      {/* Resume Prompt Overlay */}
      {pendingResume && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm flex flex-col items-center justify-center z-[100]">
          <div className="card p-8 flex flex-col items-center gap-4 text-center max-w-sm animate-in zoom-in-95 fade-in">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center text-accent mb-2">
              <Play size={32} fill="currentColor" />
            </div>
            <h3 className="text-xl font-bold text-text-primary">Sesión Restaurada</h3>
            <p className="text-text-muted text-sm mb-4">
              Haz clic para reanudar la música automáticamente desde donde la dejaste.
            </p>
            <button
              onClick={() => {
                setPendingResume(false);
                if (currentTrack) {
                  const state = usePlayerStore.getState();
                  if (state.youtubePlayer) {
                    state.youtubePlayer.seekTo(progress / 1000, true);
                    state.youtubePlayer.playVideo();
                  }
                }
              }}
              className="btn-primary w-full py-3 text-base"
            >
              Reanudar Música
            </button>
            <button
              onClick={() => setPendingResume(false)}
              className="w-full py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Mantener en pausa
            </button>
          </div>
        </div>
      )}

      <div className="shrink-0 glass border-t border-white/10 relative z-50">

        {/* Remote Control Banner */}
        {activeDeviceId && deviceId && activeDeviceId !== deviceId && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-bg-elevated/95 backdrop-blur-md border border-accent/30 border-b-0 text-text-primary px-4 py-1.5 rounded-t-xl shadow-glow-sm flex items-center gap-3 whitespace-nowrap">
            <span className="text-xs flex items-center gap-1.5"><Wifi size={14} className="text-accent animate-pulse" /> Controlando otro dispositivo</span>
            <div className="w-px h-3 bg-white/20" />
            <button
              onClick={() => {
                const state = usePlayerStore.getState();
                const { deviceId, setActiveDeviceId } = state;
                if (deviceId) {
                  setActiveDeviceId(deviceId); // Triggers Supabase sync via hook
                }
              }}
              className="text-xs bg-accent/20 hover:bg-accent/40 text-accent px-2 py-1 rounded-md transition-colors font-semibold"
            >
              Escuchar Aquí
            </button>
          </div>
        )}
        {/* Progress bar */}
        <div
          ref={progressRef}
          className="h-1 hover:h-1.5 transition-all bg-white/10 cursor-pointer group relative"
          onClick={handleProgressClick}
          style={{
            background: `linear-gradient(to right, #9D4EDD ${progressPct}%, rgba(255,255,255,0.1) ${progressPct}%)`
          }}
        >
          {/* Thumb circle that appears on hover */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
            style={{ left: `calc(${progressPct}% - 6px)` }}
          />
        </div>

        <div className="flex items-center gap-4 px-6 py-3">
          {/* Track info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {currentTrack?.image ? (
              <img
                src={currentTrack.image}
                alt="cover"
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-bg-elevated flex items-center justify-center flex-shrink-0">
                <Music2 size={16} className="text-text-muted" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">
                {currentTrack?.name || 'Sin reproducción'}
              </p>
              <div className="flex items-center gap-2 truncate">
                <p className="text-xs text-text-muted truncate">
                  {currentTrack?.artists ? formatArtists(currentTrack.artists) : 'Esperando una canción...'}
                </p>
                {currentTrack?.requestedBy && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-accent bg-accent/10 px-1.5 py-0.5 rounded shrink-0">
                    {currentTrack.requestedBy}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button onClick={controls.skipPrev} className="btn-ghost p-2">
              <SkipBack size={18} />
            </button>
            <button onClick={handleRestart} className="btn-ghost p-2" title="Reiniciar canción">
              <RotateCcw size={18} />
            </button>
            <button
              onClick={handlePlayPause}
              disabled={!sdkReady}
              className="w-10 h-10 rounded-full bg-accent hover:bg-accent-light disabled:opacity-40 flex items-center justify-center transition-all duration-200 shadow-glow-sm"
            >
              {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" />}
            </button>
            <button onClick={controls.skipNext} className="btn-ghost p-2">
              <SkipForward size={18} />
            </button>

            {/* Mobile Volume Control */}
            <div className="relative group md:hidden flex items-center ml-1">
              <button onClick={toggleMute} className="btn-ghost p-2">
                {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex group-focus-within:flex flex-col items-center justify-center bg-bg-elevated rounded-xl border border-white/10 shadow-xl h-32 w-12 z-50 py-4">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-24 h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full cursor-pointer -rotate-90 origin-center"
                />
              </div>
            </div>
          </div>

          {/* Time */}
          <div className="hidden md:flex items-center gap-2 text-xs text-text-muted w-20 justify-center">
            <span>{formatTime(progress)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Volume */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            <button onClick={toggleMute} className="btn-ghost p-1 flex items-center justify-center -ml-2 hover:text-white transition-colors">
              {volume === 0 ? (
                <VolumeX size={16} className="text-text-muted" />
              ) : (
                <Volume2 size={16} className="text-text-muted" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={handleVolumeChange}
              className="w-24"
              style={{ '--progress': `${volume}%` }}
            />
          </div>

          {/* SDK status + queue count */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            {sdkReady ? (
              <Wifi size={14} className="text-success" title="SDK conectado" />
            ) : (
              <WifiOff size={14} className="text-danger" title="SDK desconectado" />
            )}
            {queue.length > 0 && (
              <span className="badge bg-accent/20 text-accent text-xs">
                {queue.length} en cola
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
