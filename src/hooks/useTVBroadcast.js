import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';

export function useTVBroadcast() {
  const channelRef = useRef(null);
  const lastStateRef = useRef({ videoId: null, isPlaying: false });

  useEffect(() => {
    // Initialize Broadcast Channel
    channelRef.current = new BroadcastChannel('envairo_tv_sync');

    // Subscribe to Player Store changes
    const unsub = usePlayerStore.subscribe((state) => {
      if (!channelRef.current) return;

      const currentYtId = state.currentYtId || (state.currentTrack?.id);
      const isPlaying = state.isPlaying;
      
      // We only care about YouTube playback for the TV display
      if (state.playbackEngine !== 'youtube') return;

      if (currentYtId !== lastStateRef.current.videoId || isPlaying !== lastStateRef.current.isPlaying) {
        lastStateRef.current = { videoId: currentYtId, isPlaying };
        
        channelRef.current.postMessage({
          type: 'SYNC',
          videoId: currentYtId,
          isPlaying: isPlaying,
          time: state.progress || 0
        });
      }
    });

    // Also broadcast progress periodically to keep slaves in sync if they drift
    const syncInterval = setInterval(() => {
      const state = usePlayerStore.getState();
      if (state.playbackEngine === 'youtube' && state.isPlaying && channelRef.current) {
        const currentYtId = state.currentYtId || (state.currentTrack?.id);
        channelRef.current.postMessage({
          type: 'SYNC_TIME',
          videoId: currentYtId,
          time: state.progress || 0
        });
      }
    }, 5000); // Every 5 seconds

    return () => {
      unsub();
      clearInterval(syncInterval);
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, []);
}
