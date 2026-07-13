import { useEffect } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { getValidToken } from '../lib/spotifyAuth';
import {
  playTrack,
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
      await transferPlayback(device_id, false);
    });

    p.addListener('not_ready', () => {
      setSdkReady(false);
    });

    p.addListener('player_state_changed', (state) => {
      if (!state) return;
      const track = state.track_window.current_track;
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
      album: sdkTrack.album.name,
      image: sdkTrack.album.images?.[0]?.url,
      duration_ms: sdkTrack.duration_ms,
    };
  }

  const controls = {
    play: async (uris) => {
      if (!deviceId) return;
      try {
        await playTrack(deviceId, uris);
      } catch (e) {
        console.error('Play API failed', e);
      }
    },
    pause: async () => {
      const p = usePlayerStore.getState().player;
      if (p) {
        try { await p.pause(); return; } catch (err) { /* ignore */ }
      }
      if (deviceId) {
        try { await pausePlayback(deviceId); } catch (e) { console.error('Pause API failed', e); }
      }
    },
    resume: async () => {
      const p = usePlayerStore.getState().player;
      if (p) {
        try { await p.resume(); return; } catch (err) { /* ignore */ }
      }
      if (deviceId) {
        try { await resumePlayback(deviceId); } catch (e) { console.error('Resume API failed', e); }
      }
    },
    skipNext: async () => {
      if (isTransitioning) return;
      isTransitioning = true;
      const nextTrack = usePlayerStore.getState().shiftQueue();
      if (nextTrack && deviceId) {
        try {
          await playTrack(deviceId, [nextTrack.uri]);
        } catch (e) {
          console.error(e);
        } finally {
          setTimeout(() => { isTransitioning = false; }, 1500);
        }
      } else {
        const p = usePlayerStore.getState().player;
        let success = false;
        if (p) {
          try { await p.nextTrack(); success = true; } catch (err) { /* ignore */ }
        }
        if (!success && deviceId) {
          try { await skipToNext(deviceId); } catch (e) { console.error('Skip API failed', e); }
        }
        isTransitioning = false;
      }
    },
    skipPrev: async () => {
      if (isTransitioning) return;
      isTransitioning = true;
      const prevTrack = usePlayerStore.getState().prevQueue();
      if (prevTrack && deviceId) {
        try {
          await playTrack(deviceId, [prevTrack.uri]);
        } catch (e) {
          console.error(e);
        } finally {
          setTimeout(() => { isTransitioning = false; }, 1500);
        }
      } else {
        const p = usePlayerStore.getState().player;
        let success = false;
        if (p) {
          try { await p.previousTrack(); success = true; } catch (err) { /* ignore */ }
        }
        if (!success && deviceId) {
          try { await skipToPrevious(deviceId); } catch (e) { console.error('Prev API failed', e); }
        }
        isTransitioning = false;
      }
    },
    setVolume: async (vol) => {
      const p = usePlayerStore.getState().player;
      if (p) {
        try { await p.setVolume(vol / 100); } catch (err) { /* ignore */ }
      } else if (deviceId) {
        try { await apiSetVolume(Math.round(vol), deviceId); } catch (e) { console.error('Volume API failed', e); }
      }
      usePlayerStore.getState().setVolume(vol);
    },
  };

  return { controls };
}
