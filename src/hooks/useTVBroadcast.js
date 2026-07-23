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

  useEffect(() => {
    // 1. Initialize local BroadcastChannel
    channelRef.current = new BroadcastChannel('envairo_tv_sync');

    // 2. Initialize Supabase Realtime Broadcast for Remote Smart TVs over Internet
    const user = useAuthStore.getState().user;
    const settingsSessionId = useSettingsStore.getState().sessionId;
    const activeSessionId = user?.id || settingsSessionId;

    if (activeSessionId) {
      sbChannelRef.current = supabase.channel(`tv-sync-${activeSessionId}`);
      sbChannelRef.current.subscribe();
    }

    const broadcastMessage = (data) => {
      // Local BroadcastChannel
      if (channelRef.current) {
        channelRef.current.postMessage(data);
      }
      // Supabase Realtime Broadcast (Internet)
      if (sbChannelRef.current && sbChannelRef.current.state === 'joined') {
        sbChannelRef.current.send({
          type: 'broadcast',
          event: 'tv_sync',
          payload: data
        }).catch(() => {});
      }
    };

    // Escuchar peticiones de sincronización de esclavas recién conectadas (Local)
    channelRef.current.onmessage = (e) => {
      if (e.data.type === 'REQUEST_SYNC') {
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

    // Subscribe to Player Store changes
    const unsub = usePlayerStore.subscribe((state) => {
      const currentYtId = state.currentYtId;
      const isPlaying = state.isPlaying;
      
      // We only care about YouTube playback for the TV display and valid YouTube IDs
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
        // Detectar saltos manuales (scrubbing) en la barra de progreso
        const progressDiff = Math.abs(state.progress - lastProgressRef.current);
        if (progressDiff > 2000) { // Si salta más de 2 segundos de golpe
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

    // Also broadcast progress periodically to keep slaves in sync if they drift
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
    }, 5000); // Every 5 seconds

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
  }, []);
}
