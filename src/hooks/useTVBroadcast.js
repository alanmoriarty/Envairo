import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { supabase } from '../lib/supabase';
import { getInstanceId } from '../lib/instanceId';

export function useTVBroadcast() {
  const channelRef = useRef(null);
  const sbChannelRef = useRef(null);
  const lastStateRef = useRef({ videoId: null, isPlaying: false });
  const lastProgressRef = useRef(0);
  const lastProgressTimeRef = useRef(Date.now());

  const user = useAuthStore((s) => s.user);
  const settingsSessionId = useSettingsStore((s) => s.sessionId);
  const activeSessionId = user?.id || settingsSessionId;

  useEffect(() => {
    // 1. Inicializar canal BroadcastChannel local para ventanas en la misma máquina
    channelRef.current = new BroadcastChannel('envairo_tv_sync');

    // 2. Inicializar Supabase Realtime Broadcast para Smart TVs remotas sobre Internet
    if (activeSessionId) {
      if (sbChannelRef.current) {
        supabase.removeChannel(sbChannelRef.current);
      }
      sbChannelRef.current = supabase.channel(`tv-sync-${activeSessionId}`);
      sbChannelRef.current.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setTimeout(() => sendCurrentSync(), 300);
        }
      });
    }

    // Helper: check if this instance is the active master
    const isMaster = () => {
      const state = usePlayerStore.getState();
      // 'youtube-device' is always the local host's device ID (set in useYouTubeSDK onReady)
      return !state.activeDeviceId || state.activeDeviceId === 'youtube-device' || getInstanceId() === state.activeDeviceId;
    };

    const broadcastMessage = (data) => {
      // Only the active master device should send sync commands
      if (!isMaster() && data.type !== 'REQUEST_SYNC' && data.type !== 'MASTER_DISCONNECT') {
        return;
      }

      // Embed server timestamp so receivers can estimate transit delay
      const envelope = { ...data, sentAt: Date.now() };

      // BroadcastChannel Local (Mismo equipo)
      if (channelRef.current) {
        try { channelRef.current.postMessage(envelope); } catch (e) { }
      }
      // Supabase Realtime Broadcast (Smart TVs en Internet)
      if (sbChannelRef.current && sbChannelRef.current.state === 'joined') {
        sbChannelRef.current.send({
          type: 'broadcast',
          event: 'tv_sync',
          payload: envelope
        }).catch(() => { });
      }
    };

    // ── Slave Dashboard sync handler ──────────────────────────────────
    const handleMasterSync = (data) => {
      const store = usePlayerStore.getState();
      if (store.playbackEngine !== 'youtube' || !store.youtubePlayer) return;

      try {
        const player = store.youtubePlayer;
        const playerState = player.getPlayerState();
        const isCurrentlyPlaying = playerState === window.YT.PlayerState.PLAYING;
        const isEnded = playerState === window.YT.PlayerState.ENDED;

        // ── 1. Sync video ID ──
        if (data.videoId && data.videoId !== store.currentYtId) {
          // The master switched tracks — let playEngineTrack handle it via
          // useQueueSync postgres_changes. We just need to sync play state.
          // Don't attempt to seekTo or change rate for a different video.
        }

        // ── 2. Sync time (only for same video) ──
        if (typeof data.time === 'number' && data.videoId === store.currentYtId) {
          const transitDelay = (data.sentAt && data.sentAt > 0)
            ? Math.max(0, Math.min(2.0, (Date.now() - data.sentAt) / 1000))
            : 0;
          const targetTime = data.time + (data.isPlaying ? transitDelay : 0);
          const currentTime = player.getCurrentTime() || 0;
          const diff = targetTime - currentTime; // positive = slave is behind
          const duration = player.getDuration() || 0;

          // Near end of track — don't fight the natural ending
          if ((isEnded || (duration > 0 && duration - currentTime < 3)) && data.time > duration - 10) {
            if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(1.0);
          } else if (Math.abs(diff) > 1.8) {
            // Large drift — hard seek
            player.seekTo(targetTime, true);
            if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(1.0);
          } else if (diff > 0.4) {
            if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(1.07);
          } else if (diff > 0.12) {
            if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(1.03);
          } else if (diff > 0.04) {
            if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(1.01);
          } else if (diff < -0.4) {
            if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(0.93);
          } else if (diff < -0.12) {
            if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(0.97);
          } else if (diff < -0.04) {
            if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(0.99);
          } else {
            // Ultra tight sync — standard speed
            if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(1.0);
          }
        }

        // ── 3. Sync play/pause state ──
        if (typeof data.isPlaying === 'boolean') {
          if (!data.isPlaying && isCurrentlyPlaying) {
            player.pauseVideo();
            store.setIsPlaying(false);
          } else if (data.isPlaying && !isCurrentlyPlaying && !isEnded) {
            player.playVideo();
            store.setIsPlaying(true);
          }
        }
      } catch (err) {
        console.warn('Error syncing slave dashboard:', err);
      }
    };

    // ── Message handlers ─────────────────────────────────────────────
    const handleIncoming = (data) => {
      if (!data?.type) return;
      const master = isMaster();

      // Slave dashboards and remote controls consume SYNC / SYNC_TIME from master
      if (!master && (data.type === 'SYNC' || data.type === 'SYNC_TIME')) {
        if (typeof data.isPlaying === 'boolean') {
          usePlayerStore.getState().setIsPlaying(data.isPlaying);
        }
        handleMasterSync(data);
      }

      switch (data.type) {
        case 'REQUEST_SYNC':
          sendCurrentSync();
          break;
        case 'SLAVE_ERROR':
          if (master) handleSlaveError(data.videoId);
          break;
        case 'TV_STOLEN':
          handleTVStolen(data.tvId);
          break;
        case 'SLAVE_UNPAIRED':
        case 'UNPAIRED':
          handleSlaveUnpaired(data.tvId);
          break;
      }
    };

    // Escuchar mensajes locales
    channelRef.current.onmessage = (e) => handleIncoming(e.data);

    // Escuchar mensajes de Internet
    if (sbChannelRef.current) {
      sbChannelRef.current.on('broadcast', { event: 'tv_sync' }, (e) => {
        if (e.payload) handleIncoming(e.payload);
      });
    }

    const handleSlaveUnpaired = (tvId) => {
      if (!tvId) return;
      try {
        const pairedTvs = useSettingsStore.getState().pairedTvs || [];
        const updatedList = pairedTvs.filter(t => t.id !== tvId);
        if (pairedTvs.length !== updatedList.length) {
          useSettingsStore.getState().setPairedTvs(updatedList);
          window.dispatchEvent(new Event('bq-paired-tvs-updated'));
          import('sonner').then(({ toast }) => toast.info(`La pantalla vinculada (${tvId}) se ha desvinculado.`));
        }
      } catch (err) {}
    };

    const handleTVStolen = (tvId) => {
      try {
        const pairedTvs = useSettingsStore.getState().pairedTvs;
        const updatedList = pairedTvs.filter(t => t.id !== tvId);
        if (pairedTvs.length !== updatedList.length) {
          useSettingsStore.getState().setPairedTvs(updatedList);
          window.dispatchEvent(new Event('bq-paired-tvs-updated'));
          import('sonner').then(({ toast }) => toast.info(`La pantalla vinculada (${tvId}) fue conectada por otro usuario y se ha desvinculado de tu sesión.`));
        }
      } catch (err) { }
    };

    const handleSlaveError = (failedVideoId) => {
      // Do not restart track on host if slave TV has iframe restriction issue
      console.warn(`Pantalla secundaria reportó restricción en video ${failedVideoId}. El anfitrión mantendrá la reproducción actual.`);
    };

    const sendCurrentSync = () => {
      const state = usePlayerStore.getState();
      const targetId = state.currentYtId;
      if (state.playbackEngine === 'youtube' && targetId) {
        let trueTime = (state.progress || 0) / 1000;
        if (state.youtubePlayer && typeof state.youtubePlayer.getCurrentTime === 'function') {
          const ytTime = state.youtubePlayer.getCurrentTime();
          if (ytTime > 0) trueTime = ytTime;
        }
        broadcastMessage({
          type: 'SYNC',
          videoId: targetId,
          isPlaying: state.isPlaying,
          time: trueTime
        });
      }
    };

    // ── Host: subscribe to Zustand state changes ─────────────────────
    const unsub = usePlayerStore.subscribe((state) => {
      const currentYtId = state.currentYtId;
      const isPlaying = state.isPlaying;

      if (state.playbackEngine !== 'youtube' || !currentYtId) {
        if (lastStateRef.current.isPlaying) {
          lastStateRef.current.isPlaying = false;
          broadcastMessage({
            type: 'SYNC',
            videoId: lastStateRef.current.videoId,
            isPlaying: false,
            time: 0
          });
        }
        return;
      }

      if (currentYtId !== lastStateRef.current.videoId || isPlaying !== lastStateRef.current.isPlaying) {
        lastStateRef.current = { videoId: currentYtId, isPlaying };
        let trueTime = (state.progress || 0) / 1000;
        if (state.youtubePlayer && typeof state.youtubePlayer.getCurrentTime === 'function') {
          const ytTime = state.youtubePlayer.getCurrentTime();
          if (ytTime > 0) trueTime = ytTime;
        }

        broadcastMessage({
          type: 'SYNC',
          videoId: currentYtId,
          isPlaying: isPlaying,
          time: trueTime
        });
        lastProgressRef.current = state.progress || 0;
        lastProgressTimeRef.current = Date.now();
      } else if (state.progress !== undefined) {
        // Detect manual scrubbing vs background-tab throttling
        const now = Date.now();
        const timeElapsed = isPlaying ? (now - lastProgressTimeRef.current) : 0;
        const expectedProgress = lastProgressRef.current + timeElapsed;
        const scrubDiff = Math.abs(state.progress - expectedProgress);

        if (scrubDiff > 1500) {
          let trueTime = state.progress / 1000;
          if (state.youtubePlayer && typeof state.youtubePlayer.getCurrentTime === 'function') {
            const ytTime = state.youtubePlayer.getCurrentTime();
            if (ytTime > 0) trueTime = ytTime;
          }
          broadcastMessage({
            type: 'SYNC',
            videoId: currentYtId,
            isPlaying: isPlaying,
            time: trueTime
          });
        }
        lastProgressRef.current = state.progress;
        lastProgressTimeRef.current = now;
      }
    });

    // ── High-precision periodic time sync (every 1s) ──────────────────
    const syncInterval = setInterval(() => {
      const state = usePlayerStore.getState();
      if (state.playbackEngine === 'youtube' && state.currentYtId) {
        let trueTime = (state.progress || 0) / 1000;
        if (state.youtubePlayer && typeof state.youtubePlayer.getCurrentTime === 'function') {
          const ytTime = state.youtubePlayer.getCurrentTime();
          if (ytTime > 0) trueTime = ytTime;
        }
        broadcastMessage({
          type: 'SYNC_TIME',
          videoId: state.currentYtId,
          isPlaying: state.isPlaying,
          time: trueTime
        });
      }
    }, 1000);

    // ── Notify slave screens when host is refreshing/closing ──────────
    const handleBeforeUnload = () => {
      const refreshPayload = { type: 'HOST_REFRESHING', sentAt: Date.now() };
      // BroadcastChannel (same machine)
      if (channelRef.current) {
        try { channelRef.current.postMessage(refreshPayload); } catch (e) {}
      }
      // Supabase Realtime (remote Smart TVs) — use sendBeacon-style sync send
      if (sbChannelRef.current && sbChannelRef.current.state === 'joined') {
        sbChannelRef.current.send({
          type: 'broadcast',
          event: 'tv_sync',
          payload: refreshPayload
        }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsub();
      clearInterval(syncInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (channelRef.current) {
        channelRef.current.close();
      }
      if (sbChannelRef.current) {
        supabase.removeChannel(sbChannelRef.current);
      }
    };
  }, [activeSessionId]);
}
