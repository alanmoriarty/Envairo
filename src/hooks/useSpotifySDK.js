import { useEffect, useRef } from 'react';
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

  const progressInterval = useRef(null);
  const isTransitioning = useRef(false);

  useEffect(() => {
    let scriptLoaded = false;
    let playerInstance = null;

    // Load the SDK script if not already loaded
    if (window.Spotify) {
      initPlayer().then(p => { playerInstance = p; });
    } else {
      window.onSpotifyWebPlaybackSDKReady = () => {
        initPlayer().then(p => { playerInstance = p; });
      };

      if (!document.getElementById('spotify-player-script')) {
        const script = document.createElement('script');
        script.id = 'spotify-player-script';
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        document.body.appendChild(script);
        scriptLoaded = true;
      }
    }

    return () => {
      if (playerInstance) {
        playerInstance.disconnect();
      }
      clearInterval(progressInterval.current);
    };
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
      // Add a check for progress to ensure we don't trigger trackFinished just because of a buffer reset or manual skip to start
      const trackFinished = storeState.isPlaying && state.paused && state.position === 0 && storeState.progress > 5000;

      setCurrentTrack(normalizedTrack);
      setIsPlaying(!state.paused);
      setDuration(state.duration);
      setProgress(state.position);

      clearInterval(progressInterval.current);
      if (!state.paused) {
        progressInterval.current = setInterval(() => {
          const currentProg = usePlayerStore.getState().progress;
          if (currentProg < state.duration) {
            usePlayerStore.getState().setProgress(currentProg + 1000);
          }
        }, 1000);
      }

      if (trackFinished && !isTransitioning.current) {
        isTransitioning.current = true;
        // Reproducir la siguiente canción en la cola local si existe
        const nextTrack = usePlayerStore.getState().shiftQueue();
        if (nextTrack && storeState.deviceId) {
          playTrack(storeState.deviceId, [nextTrack.uri])
            .then(() => {
              // Liberar el candado tras 1.5s para evitar eventos fantasma del SDK
              setTimeout(() => { isTransitioning.current = false; }, 1500);
            })
            .catch((err) => {
              console.error(err);
              isTransitioning.current = false;
            });
        } else {
          isTransitioning.current = false;
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

  // ── Controls ─────────────────────────────────────────────────────────────
  const controls = {
    play: async (uris) => {
      if (!deviceId) return;
      await playTrack(deviceId, uris);
    },
    pause: async () => {
      if (deviceId) await pausePlayback(deviceId);
    },
    resume: async () => {
      if (deviceId) await resumePlayback(deviceId);
    },
    skipNext: async () => {
      if (isTransitioning.current) return;
      isTransitioning.current = true;
      const nextTrack = usePlayerStore.getState().shiftQueue();
      if (nextTrack && deviceId) {
        try {
          await playTrack(deviceId, [nextTrack.uri]);
        } catch (e) {
          console.error(e);
        } finally {
          setTimeout(() => { isTransitioning.current = false; }, 1500);
        }
      } else {
        if (deviceId) await pausePlayback(deviceId);
        isTransitioning.current = false;
      }
    },
    skipPrev: async () => {
      if (deviceId) await skipToPrevious(deviceId);
    },
    setVolume: async (vol) => {
      if (deviceId) {
        try {
          // Attempt via API first
          await apiSetVolume(Math.round(vol), deviceId);
        } catch (e) {
          console.error('Volume API error, falling back to SDK', e);
          const p = usePlayerStore.getState().player;
          if (p) p.setVolume(vol / 100);
        }
      }
      usePlayerStore.getState().setVolume(vol);
    },
  };

  return { controls };
}
