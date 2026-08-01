import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { supabase } from '../lib/supabase';

export function useTVBroadcast() {
  const channelRef = useRef(null);
  const sbChannelRef = useRef(null);
  const lastStateRef = useRef({ videoId: null, isPlaying: false });
  const lastProgressRef = useRef(0);

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

    // Escuchar mensajes de las TVs esclavas (Local)
    channelRef.current.onmessage = (e) => {
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
        if (e.payload?.type === 'REQUEST_SYNC') {
          sendCurrentSync();
        } else if (e.payload?.type === 'SLAVE_ERROR') {
          handleSlaveError(e.payload.videoId);
        } else if (e.payload?.type === 'TV_STOLEN') {
          handleTVStolen(e.payload.tvId);
        }
      });
    }

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
      } else if (state.progress !== undefined) {
        // Detectar saltos manuales (scrubbing)
        const progressDiff = Math.abs(state.progress - lastProgressRef.current);
        if (progressDiff > 1500) {
          let trueTime = state.progress / 1000;
          if (state.youtubePlayer && typeof state.youtubePlayer.getCurrentTime === 'function') {
            const ytTime = state.youtubePlayer.getCurrentTime();
            if (ytTime > 0) trueTime = ytTime;
          }
          broadcastMessage({
            type: 'SYNC_TIME',
            videoId: currentYtId,
            isPlaying: isPlaying,
            time: trueTime
          });
        }
        lastProgressRef.current = state.progress;
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
