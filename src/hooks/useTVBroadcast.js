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

    // Escuchar peticiones de sincronización de esclavas recién conectadas
    channelRef.current.onmessage = (e) => {
      if (e.data?.type === 'REQUEST_SYNC') {
        sendCurrentSync();
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
      
      if (state.playbackEngine !== 'youtube' || !currentYtId) return;

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
            time: trueTime
          });
        }
        lastProgressRef.current = state.progress;
      }
    });

    // Transmitir progreso periódicamente (cada 2 segundos) para corregir cualquier desvío entre pantallas
    const syncInterval = setInterval(() => {
      const state = usePlayerStore.getState();
      if (state.playbackEngine === 'youtube' && state.isPlaying && state.currentYtId) {
        let trueTime = (state.progress || 0) / 1000;
        if (state.youtubePlayer && typeof state.youtubePlayer.getCurrentTime === 'function') {
          const ytTime = state.youtubePlayer.getCurrentTime();
          if (ytTime > 0) trueTime = ytTime;
        }

        broadcastMessage({
          type: 'SYNC_TIME',
          videoId: state.currentYtId,
          time: trueTime
        });
      }
    }, 2000);

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
