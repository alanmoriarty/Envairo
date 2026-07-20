import React, { useRef } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useSpotifySDK } from '../../hooks/useSpotifySDK';
import { useYouTubeSDK } from '../../hooks/useYouTubeSDK';
import {
  Play, Pause, SkipForward, SkipBack,
  Volume2, VolumeX, Music2, Wifi, WifiOff
} from 'lucide-react';

export function PersistentPlayer() {
  const {
    currentTrack, isPlaying, progress, duration, volume,
    sdkReady, queue, pendingResume, setPendingResume,
    setVolume, activeDeviceId, deviceId, playbackEngine
  } = usePlayerStore();
  
  const { controls: spotifyControls } = useSpotifySDK();
  const { controls: youtubeControls, ytReady } = useYouTubeSDK();
  
  const controls = playbackEngine === 'spotify' ? spotifyControls : youtubeControls;
  const isReady = playbackEngine === 'spotify' ? sdkReady : ytReady;
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
    
    if (state.playbackEngine === 'youtube') {
      if (state.youtubePlayer) {
        state.youtubePlayer.seekTo(posMs / 1000, true);
        usePlayerStore.getState().setProgress(posMs);
      }
    } else {
      const targetDevice = state.activeDeviceId || state.deviceId;
      if (targetDevice) {
        import('../../lib/spotifyApi').then(({ seekToPosition }) =>
          seekToPosition(posMs, targetDevice)
        );
      }
    }
  };

  const volumeDebounce = useRef(null);

  const handleVolumeChange = (e) => {
    const vol = parseInt(e.target.value, 10);
    setVolume(vol); // Actualiza la UI de inmediato
    
    clearTimeout(volumeDebounce.current);
    volumeDebounce.current = setTimeout(() => {
      const state = usePlayerStore.getState();
      if (state.playbackEngine === 'youtube') {
        if (state.youtubePlayer) state.youtubePlayer.setVolume(vol);
      } else {
        const targetDevice = state.activeDeviceId || state.deviceId;
        if (targetDevice) {
          import('../../lib/spotifyApi').then(({ setVolume: apiSetVolume }) =>
            apiSetVolume(vol, targetDevice)
          ).catch(console.error);
        }
      }
    }, 300);
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      controls.pause();
      usePlayerStore.getState().setIsPlaying(false);
    } else {
      controls.resume();
      usePlayerStore.getState().setIsPlaying(true);
    }
  };

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
                  if (state.playbackEngine === 'youtube') {
                    if (state.youtubePlayer) {
                      state.youtubePlayer.seekTo(progress / 1000, true);
                      state.youtubePlayer.playVideo();
                    }
                  } else {
                    const targetDevice = state.activeDeviceId || state.deviceId;
                    if (targetDevice) {
                      import('../../lib/spotifyApi').then(({ playTrack }) => {
                        playTrack(targetDevice, [currentTrack.uri], progress).catch(err => console.error(err));
                      });
                    }
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
                  if (state.playbackEngine !== 'youtube') {
                    import('../../lib/spotifyApi').then(({ transferPlayback }) => {
                      transferPlayback(deviceId, true).catch(console.error);
                    });
                  }
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
        className="h-1 bg-white/10 cursor-pointer group"
        onClick={handleProgressClick}
        style={{
          background: `linear-gradient(to right, #9D4EDD ${progressPct}%, rgba(255,255,255,0.1) ${progressPct}%)`
        }}
      >
        <div
          className="h-full bg-accent transition-none"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex items-center gap-4 px-6 py-3">
        {/* Track info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {currentTrack?.image ? (
            <img
              src={currentTrack.image}
              alt="cover"
              className={`w-10 h-10 rounded-lg object-cover flex-shrink-0 ${
                isPlaying ? 'animate-spin-slow' : ''
              }`}
              style={{ animationDuration: '10s' }}
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
                {currentTrack?.artists || 'Conecta Envairo a un altavoz'}
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
            <button className="btn-ghost p-2">
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
          {volume === 0 ? (
            <VolumeX size={16} className="text-text-muted" />
          ) : (
            <Volume2 size={16} className="text-text-muted" />
          )}
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
