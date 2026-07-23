import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';

export function useTVBroadcast() {
  const channelRef = useRef(null);
  const lastStateRef = useRef({ videoId: null, isPlaying: false });
  const lastProgressRef = useRef(0);

  useEffect(() => {
    // Initialize Broadcast Channel
    channelRef.current = new BroadcastChannel('envairo_tv_sync');

    // Escuchar peticiones de sincronización de esclavas recién conectadas
    channelRef.current.onmessage = (e) => {
      if (e.data.type === 'REQUEST_SYNC') {
        const state = usePlayerStore.getState();
        if (state.playbackEngine === 'youtube' && state.currentYtId) {
          let trueTime = (state.progress || 0) / 1000;
          if (state.youtubePlayer && typeof state.youtubePlayer.getCurrentTime === 'function') {
            const ytTime = state.youtubePlayer.getCurrentTime();
            if (ytTime > 0) trueTime = ytTime;
          }
          channelRef.current.postMessage({
            type: 'SYNC',
            videoId: state.currentYtId,
            isPlaying: state.isPlaying,
            time: trueTime
          });
        }
      }
    };

    // Subscribe to Player Store changes
    const unsub = usePlayerStore.subscribe((state) => {
      if (!channelRef.current) return;

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
        
        channelRef.current.postMessage({
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
          channelRef.current.postMessage({
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
      if (state.playbackEngine === 'youtube' && state.isPlaying && channelRef.current && state.currentYtId) {
        let trueTime = (state.progress || 0) / 1000;
        if (state.youtubePlayer && typeof state.youtubePlayer.getCurrentTime === 'function') {
          const ytTime = state.youtubePlayer.getCurrentTime();
          if (ytTime > 0) trueTime = ytTime;
        }

        channelRef.current.postMessage({
          type: 'SYNC_TIME',
          videoId: state.currentYtId,
          time: trueTime
        });
      }
    }, 5000); // Every 5 seconds

    const handleUnload = () => {
      if (channelRef.current) {
        channelRef.current.postMessage({ type: 'MASTER_DISCONNECT' });
      }
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      unsub();
      clearInterval(syncInterval);
      window.removeEventListener('beforeunload', handleUnload);
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, []);
}
