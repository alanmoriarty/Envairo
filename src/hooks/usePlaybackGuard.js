import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';

// 8 horas de reproducción continua (8 * 60 * 60 * 1000 = 28,800,000 ms)
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 10 * 1000; // Check every 10 seconds

export function usePlaybackGuard() {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isAdminMode = useSettingsStore((s) => s.isAdminMode);
  const intervalRef = useRef(null);

  useEffect(() => {
    // Si estamos en control remoto o no está sonando nada, detenemos el temporizador
    if (isAdminMode || !isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      const playerStore = usePlayerStore.getState();
      if (!playerStore.isPlaying) return;

      const currentMs = (playerStore.continuousPlaybackMs || 0) + CHECK_INTERVAL_MS;
      usePlayerStore.setState({ continuousPlaybackMs: currentMs });

      if (currentMs >= EIGHT_HOURS_MS) {
        // Pausar música
        if (playerStore.youtubePlayer && typeof playerStore.youtubePlayer.pauseVideo === 'function') {
          playerStore.youtubePlayer.pauseVideo();
        }
        playerStore.setIsPlaying(false);
        playerStore.setShowPlaybackLimitModal(true);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, isAdminMode]);
}
