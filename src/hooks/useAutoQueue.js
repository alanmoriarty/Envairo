import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { toast } from 'sonner';

export function useAutoQueue() {
  const isFetching = useRef(false);

  useEffect(() => {
    const unsubscribe = usePlayerStore.subscribe(async (state) => {
      const { autoDJ } = useSettingsStore.getState();
      
      // Solo ejecutamos si Auto DJ está activo
      if (!autoDJ) return;

      const remainingTracks = state.queue.length - (state.currentQueueIndex + 1);
      
      // Si quedan 1 o 0 canciones en cola, rellenamos
      if (remainingTracks <= 1 && !isFetching.current) {
        isFetching.current = true;
        
        try {
          const { getAutoQueueRecommendations } = await import('../lib/autoDJ');
          const settings = useSettingsStore.getState();
          
          // Buscar una recomendación
          const recommendedTrack = await getAutoQueueRecommendations(state.playHistory, settings);
          
          if (recommendedTrack) {
            usePlayerStore.getState().addToQueue({
              ...recommendedTrack,
              requestedBy: 'Auto DJ'
            });
            toast.success(`Auto DJ añadió: ${recommendedTrack.name}`);
            
            // Si el reproductor estaba vacío y no estaba sonando nada, iniciar reproducción
            const stateAfter = usePlayerStore.getState();
            if (!stateAfter.currentTrack && stateAfter.queue.length > 0) {
              const nextTrack = stateAfter.shiftQueue();
              if (nextTrack) {
                stateAfter.playEngineTrack(nextTrack);
              }
            }
          }
        } catch (err) {
          console.error('Auto DJ failed to fetch recommendations:', err);
        } finally {
          isFetching.current = false;
        }
      }
    });

    return () => unsubscribe();
  }, []);
}
