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
  const lastTimeRef = useRef(0);
  const latencyRef = useRef(0);

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
      sbChannelRef.current.subscribe();
    }

    const broadcastMessage = (data) => {
      // Only the active master device should send sync commands to the TV
      const state = usePlayerStore.getState();
      const isActiveMaster = !state.activeDeviceId || getInstanceId() === state.activeDeviceId;
      if (!isActiveMaster && !['REQUEST_SYNC', 'MASTER_DISCONNECT', 'SYNC_PING'].includes(data.type)) {
        return;
      }

      // BroadcastChannel Local (Mismo equipo)
      if (channelRef.current) {
        try {
          channelRef.current.postMessage(data);
        } catch (e) {
          console.warn('Error en postMessage local:', e);
        }
      }
      // Supabase Realtime Broadcast (Smart TVs en Internet)
      if (sbChannelRef.current && sbChannelRef.current.state === 'joined') {
        sbChannelRef.current.send({
          type: 'broadcast',
          event: 'tv_sync',
          payload: data
        }).catch(() => {});
      }
    };

    const handleMasterSync = (data) => {
      const store = usePlayerStore.getState();
      if (store.playbackEngine !== 'youtube' || !store.youtubePlayer) return;
      
      try {
        const isCurrentlyPlaying = store.youtubePlayer.getPlayerState() === window.YT.PlayerState.PLAYING;
        const isEnded = store.youtubePlayer.getPlayerState() === window.YT.PlayerState.ENDED;
        
        // 1. Sync time
        if (typeof data.time === 'number') {
          const latencySec = latencyRef.current / 1000;
          const targetTime = data.time + latencySec;
          const currentTime = store.youtubePlayer.getCurrentTime() || 0;
          const diff = targetTime - currentTime;
          const duration = store.youtubePlayer.getDuration() || 0;
          
          let shouldSeek = false;
          let newRate = 1.0;

          if (data.type === 'SYNC') {
            if (Math.abs(diff) > 1.5) {
              shouldSeek = true;
            } else if (diff > 0.2) {
              newRate = 1.1;
            } else if (diff < -0.2) {
              newRate = 0.9;
            }
          } else if (data.type === 'SYNC_TIME') {
            if ((isEnded || (duration > 0 && duration - currentTime < 3)) && data.time > duration - 10) {
               shouldSeek = false;
               newRate = 1.0;
            } else if (Math.abs(diff) > 1.5) {
               shouldSeek = true;
            } else if (diff > 0.2) {
               newRate = 1.05;
            } else if (diff < -0.2) {
               newRate = 0.95;
            }
          }
          
          if (shouldSeek) {
            store.youtubePlayer.seekTo(targetTime, true);
            if (typeof store.youtubePlayer.setPlaybackRate === 'function') store.youtubePlayer.setPlaybackRate(1.0);
          } else if (typeof store.youtubePlayer.setPlaybackRate === 'function') {
            store.youtubePlayer.setPlaybackRate(newRate);
          }
        }
        
        // 2. Sync play state
        if (typeof data.isPlaying === 'boolean') {
          if (!data.isPlaying) {
            store.youtubePlayer.pauseVideo();
            store.setIsPlaying(false);
          } else if (data.isPlaying && !isCurrentlyPlaying) {
            store.youtubePlayer.playVideo();
            store.setIsPlaying(true);
          }
        }
      } catch (err) {
        console.warn('Error syncing slave dashboard:', err);
      }
    };

    // Escuchar mensajes de las TVs esclavas (Local)
    channelRef.current.onmessage = (e) => {
      const state = usePlayerStore.getState();
      const isActiveMaster = !state.activeDeviceId || getInstanceId() === state.activeDeviceId;

      if (!isActiveMaster && (e.data?.type === 'SYNC' || e.data?.type === 'SYNC_TIME')) {
        handleMasterSync(e.data);
      }

      if (e.data?.type === 'SYNC_PING' && isActiveMaster) {
        broadcastMessage({ type: 'SYNC_PONG', timestamp: e.data.timestamp });
      } else if (e.data?.type === 'SYNC_PONG' && !isActiveMaster) {
        latencyRef.current = (Date.now() - e.data.timestamp) / 2;
      }

      if (e.data?.type === 'REQUEST_SYNC') {
        sendCurrentSync();
      } else if (e.data?.type === 'SLAVE_ERROR') {
        handleSlaveError(e.data.videoId);
      } else if (e.data?.type === 'TV_STOLEN') {
        handleTVStolen(e.data.tvId);
      }
    };

    // Escuchar mensajes de las TVs esclavas (Internet)
    if (sbChannelRef.current) {
      sbChannelRef.current.on('broadcast', { event: 'tv_sync' }, (e) => {
        const state = usePlayerStore.getState();
        const isActiveMaster = !state.activeDeviceId || getInstanceId() === state.activeDeviceId;

        if (!isActiveMaster && (e.payload?.type === 'SYNC' || e.payload?.type === 'SYNC_TIME')) {
          handleMasterSync(e.payload);
        }

        if (e.payload?.type === 'SYNC_PING' && isActiveMaster) {
          broadcastMessage({ type: 'SYNC_PONG', timestamp: e.payload.timestamp });
        } else if (e.payload?.type === 'SYNC_PONG' && !isActiveMaster) {
          latencyRef.current = (Date.now() - e.payload.timestamp) / 2;
        }

        if (e.payload?.type === 'REQUEST_SYNC') {
          sendCurrentSync();
        } else if (e.payload?.type === 'SLAVE_ERROR') {
          handleSlaveError(e.payload.videoId);
        } else if (e.payload?.type === 'TV_STOLEN') {
          handleTVStolen(e.payload.tvId);
        }
      });
    }

    // Ping periódico para Esclavos
    const pingInterval = setInterval(() => {
      const state = usePlayerStore.getState();
      const isActiveMaster = !state.activeDeviceId || getInstanceId() === state.activeDeviceId;
      if (!isActiveMaster) {
        broadcastMessage({ type: 'SYNC_PING', timestamp: Date.now() });
      }
    }, 10000);

    const handleTVStolen = (tvId) => {
      try {
        const pairedTvs = useSettingsStore.getState().pairedTvs;
        const updatedList = pairedTvs.filter(t => t.id !== tvId);
        if (pairedTvs.length !== updatedList.length) {
          useSettingsStore.getState().setPairedTvs(updatedList);
          window.dispatchEvent(new Event('bq-paired-tvs-updated'));
          import('sonner').then(({ toast }) => toast.info(`La pantalla vinculada (${tvId}) fue conectada por otro usuario y se ha desvinculado de tu sesión.`));
        }
      } catch (err) {}
    };

    const handleSlaveError = (failedVideoId) => {
      const state = usePlayerStore.getState();
      if (state.currentYtId === failedVideoId && state.currentTrack) {
        console.warn(`Una TV esclava reportó error con el video ${failedVideoId}. Forzando alternativa...`);
        usePlayerStore.setState(s => ({ failedYouTubeIds: [...s.failedYouTubeIds, failedVideoId] }));
        state.playEngineTrack(state.currentTrack, state.progress, null, 1);
        import('sonner').then(({ toast }) => toast.error('TV no pudo reproducir el video. Buscando alternativa...'));
      }
    };

    const sendCurrentSync = () => {
      const state = usePlayerStore.getState();
      if (state.playbackEngine === 'youtube' && state.currentYtId) {
        let trueTime = (state.progress || 0) / 1000;
        if (state.youtubePlayer && typeof state.youtubePlayer.getCurrentTime === 'function') {
          const ytTime = state.youtubePlayer.getCurrentTime();
          if (ytTime > 0) trueTime = ytTime;
        }
        broadcastMessage({
          type: 'SYNC',
          videoId: state.currentYtId,
          isPlaying: state.isPlaying,
          time: trueTime
        });
      }
    };

    // Suscribirse a cambios en el reproductor del Host
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
        // Detectar saltos manuales (scrubbing) vs retrasos de pestañas en segundo plano (throttling)
        const now = Date.now();
        const timeElapsed = isPlaying ? (now - lastProgressTimeRef.current) : 0;
        const expectedProgress = lastProgressRef.current + timeElapsed;
        
        // Si la diferencia entre el progreso real y el esperado es mayor a 1.5s, es un scrub manual
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

    // Transmitir progreso periódicamente (cada 4 segundos) para corregir desvíos remotos sin saturar la TV
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
    }, 4000);

    const handleUnload = () => {
      broadcastMessage({ type: 'MASTER_DISCONNECT' });
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      unsub();
      clearInterval(syncInterval);
      clearInterval(pingInterval);
      window.removeEventListener('beforeunload', handleUnload);
      if (channelRef.current) {
        channelRef.current.close();
      }
      if (sbChannelRef.current) {
        supabase.removeChannel(sbChannelRef.current);
      }
    };
  }, [activeSessionId]);
}
