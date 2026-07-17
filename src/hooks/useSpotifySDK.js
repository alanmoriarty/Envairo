import { useEffect } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { getValidToken } from '../lib/spotifyAuth';
import {
  playTrack,
  playContext,
  pausePlayback,
  resumePlayback,
  skipToNext,
  skipToPrevious,
  setVolume as apiSetVolume,
  transferPlayback,
} from '../lib/spotifyApi';

let sdkInitialized = false;
let progressInterval = null;
let isTransitioning = false;

export function useSpotifySDK() {
  const {
    setPlayer,
    setDeviceId,
    setSdkReady,
    setCurrentTrack,
    setIsPlaying,
    setProgress,
    setDuration,
    player,
    deviceId,
    volume,
    queue,
  } = usePlayerStore();

  useEffect(() => {
    if (sdkInitialized) return;
    sdkInitialized = true;

    // Load the SDK script if not already loaded
    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = () => {
        initPlayer();
      };

      if (!document.getElementById('spotify-player-script')) {
        const script = document.createElement('script');
        script.id = 'spotify-player-script';
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        document.body.appendChild(script);
      }
    }
  }, []);

  async function initPlayer() {
    const token = await getValidToken();
    if (!token) return null;

    const p = new window.Spotify.Player({
      name: 'Envairo Player',
      getOAuthToken: async (cb) => {
        const t = await getValidToken();
        cb(t);
      },
      volume: volume / 100,
    });

    p.addListener('ready', async ({ device_id }) => {
      setDeviceId(device_id);
      setSdkReady(true);
      usePlayerStore.getState().setDeviceTransferred(false); // Reset transfer state
      
      const { activeDeviceId, setActiveDeviceId } = usePlayerStore.getState();
      
      try {
        const { getAvailableDevices } = await import('../lib/spotifyApi');
        const data = await getAvailableDevices();
        const devices = data?.devices || [];
        const isActiveDeviceAlive = devices.some(d => d.id === activeDeviceId);
        
        // Si no hay dispositivo activo, o es este, o el activo está muerto (ej. recargó página), lo reclamamos
        if (!activeDeviceId || activeDeviceId === device_id || !isActiveDeviceAlive) {
          setActiveDeviceId(device_id);
          await transferPlayback(device_id, false);
        }
      } catch (err) {
        if (!activeDeviceId || activeDeviceId === device_id) {
          setActiveDeviceId(device_id);
          await transferPlayback(device_id, false);
        }
      }
      
      // Auto-resume logic
      const storeState = usePlayerStore.getState();
      if (storeState.isPlaying && storeState.currentTrack) {
        usePlayerStore.getState().setIsPlaying(false);
        usePlayerStore.getState().setPendingResume(true);
      }
    });

    p.addListener('not_ready', () => {
      setSdkReady(false);
    });

    p.addListener('player_state_changed', (state) => {
      // Ignore state changes if we are just a remote control
      const { deviceId, activeDeviceId } = usePlayerStore.getState();
      if (activeDeviceId && deviceId && activeDeviceId !== deviceId) {
        return;
      }

      if (!state) {
        usePlayerStore.getState().setDeviceTransferred(true);
        usePlayerStore.getState().setIsPlaying(false);
        return;
      }
      
      const track = state.track_window.current_track;
      if (!track) {
        usePlayerStore.getState().setDeviceTransferred(true);
        usePlayerStore.getState().setIsPlaying(false);
        return;
      }
      usePlayerStore.getState().setDeviceTransferred(false);
      
      const normalizedTrack = normalizeTrack(track);
      
      const storeState = usePlayerStore.getState();
      
      // Historial
      if (normalizedTrack && storeState.currentTrack?.id !== normalizedTrack.id) {
        storeState.addToHistory(normalizedTrack);
      }

      // Track end / Auto-queue transition
      const trackFinished = storeState.isPlaying && state.paused && state.position === 0 && storeState.progress > 5000;

      setCurrentTrack(normalizedTrack);
      setIsPlaying(!state.paused);
      setDuration(state.duration);
      setProgress(state.position);

      clearInterval(progressInterval);
      if (!state.paused) {
        progressInterval = setInterval(() => {
          const currentProg = usePlayerStore.getState().progress;
          if (currentProg < state.duration) {
            usePlayerStore.getState().setProgress(currentProg + 1000);
          }
        }, 1000);
      }

      if (trackFinished && !isTransitioning) {
        isTransitioning = true;
        // Reproducir la siguiente canción en la cola local si existe
        const nextTrack = usePlayerStore.getState().shiftQueue();
        if (nextTrack && storeState.deviceId) {
          playTrack(storeState.deviceId, [nextTrack.uri])
            .then(() => {
              setTimeout(() => { isTransitioning = false; }, 1500);
            })
            .catch((err) => {
              console.error(err);
              isTransitioning = false;
            });
        } else {
          isTransitioning = false;
        }
      }
    });

    p.addListener('initialization_error', ({ message }) => console.error(message));
    p.addListener('authentication_error', ({ message }) => console.error(message));
    p.addListener('account_error', ({ message }) => console.error(message));

    await p.connect();
    setPlayer(p);
    return p;
  }

  function normalizeTrack(sdkTrack) {
    if (!sdkTrack) return null;
    return {
      id: sdkTrack.id,
      uri: sdkTrack.uri,
      name: sdkTrack.name,
      artists: sdkTrack.artists.map((a) => a.name).join(', '),
      artistIds: sdkTrack.artists.map((a) => a.uri?.split(':').pop()),
      album: sdkTrack.album.name,
      image: sdkTrack.album.images?.[0]?.url,
      duration_ms: sdkTrack.duration_ms,
    };
  }

  const controls = {
    play: async (uris) => {
      const state = usePlayerStore.getState();
      const targetDevice = state.activeDeviceId || state.deviceId;
      if (!targetDevice) return;
      try {
        await playTrack(targetDevice, uris);
      } catch (e) {
        console.error('Play API failed', e);
        if (e.message?.includes('Device not found')) {
           import('sonner').then(({ toast }) => toast.error('Dispositivo principal desconectado. Refresca la pestaña.'));
        }
      }
    },
    playContext: async (contextUri) => {
      const state = usePlayerStore.getState();
      const targetDevice = state.activeDeviceId || state.deviceId;
      if (!targetDevice) return;
      try {
        await playContext(targetDevice, contextUri);
      } catch (e) {
        console.error('PlayContext API failed', e);
      }
    },
    pause: async () => {
      const state = usePlayerStore.getState();
      const targetDevice = state.activeDeviceId || state.deviceId;
      
      if (state.activeDeviceId === state.deviceId && state.player) {
        try { await state.player.pause(); return; } catch (err) { /* ignore */ }
      }
      if (targetDevice) {
        try { await pausePlayback(targetDevice); } catch (e) { console.error('Pause API failed', e); }
      }
    },
    resume: async () => {
      const state = usePlayerStore.getState();
      const targetDevice = state.activeDeviceId || state.deviceId;

      if (state.activeDeviceId === state.deviceId && state.player) {
        try { await state.player.resume(); return; } catch (err) { /* ignore */ }
      }
      if (targetDevice) {
        try { await resumePlayback(targetDevice); } catch (e) { console.error('Resume API failed', e); }
      }
    },
    skipNext: async () => {
      if (isTransitioning) return;
      isTransitioning = true;
      const state = usePlayerStore.getState();
      const targetDevice = state.activeDeviceId || state.deviceId;

      const nextTrack = usePlayerStore.getState().shiftQueue();
      if (nextTrack && targetDevice) {
        try {
          await playTrack(targetDevice, [nextTrack.uri]);
        } catch (e) {
          console.error(e);
        } finally {
          setTimeout(() => { isTransitioning = false; }, 1500);
        }
      } else {
        let success = false;
        if (state.activeDeviceId === state.deviceId && state.player) {
          try { await state.player.nextTrack(); success = true; } catch (err) { /* ignore */ }
        }
        if (!success && targetDevice) {
          try { await skipToNext(targetDevice); } catch (e) { console.error('Skip API failed', e); }
        }
        isTransitioning = false;
      }
    },
    skipPrev: async () => {
      if (isTransitioning) return;
      isTransitioning = true;
      const state = usePlayerStore.getState();
      const targetDevice = state.activeDeviceId || state.deviceId;

      const prevTrack = usePlayerStore.getState().prevQueue();
      if (prevTrack && targetDevice) {
        try {
          await playTrack(targetDevice, [prevTrack.uri]);
        } catch (e) {
          console.error(e);
        } finally {
          setTimeout(() => { isTransitioning = false; }, 1500);
        }
      } else {
        let success = false;
        if (state.activeDeviceId === state.deviceId && state.player) {
          try { await state.player.previousTrack(); success = true; } catch (err) { /* ignore */ }
        }
        if (!success && targetDevice) {
          try { await skipToPrevious(targetDevice); } catch (e) { console.error('Prev API failed', e); }
        }
        isTransitioning = false;
      }
    },
    setVolume: async (vol) => {
      const state = usePlayerStore.getState();
      const targetDevice = state.activeDeviceId || state.deviceId;

      if (state.activeDeviceId === state.deviceId && state.player) {
        try { await state.player.setVolume(vol / 100); } catch (err) { /* ignore */ }
      } else if (targetDevice) {
        try { await apiSetVolume(Math.round(vol), targetDevice); } catch (e) { console.error('Volume API failed', e); }
      }
      usePlayerStore.getState().setVolume(vol);
    },
  };

  return { controls };
}
