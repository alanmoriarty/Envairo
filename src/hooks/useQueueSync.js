import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';

export function useQueueSync() {
  const sessionId = useSettingsStore((state) => state.sessionId);
  const isRemoteUpdate = useRef(false);

  useEffect(() => {
    if (!sessionId) return;

    // 1. Subscribe to local Zustand changes to push to Supabase
    const unsubscribe = usePlayerStore.subscribe((state, prevState) => {
      if (
        state.queue === prevState.queue &&
        state.currentQueueIndex === prevState.currentQueueIndex &&
        state.currentTrack?.id === prevState.currentTrack?.id &&
        state.activeDeviceId === prevState.activeDeviceId &&
        state.volume === prevState.volume
      ) {
        return;
      }

      if (isRemoteUpdate.current) {
        isRemoteUpdate.current = false;
        return;
      }

      // Local change detected, push to Supabase
      supabase
        .from('sessions')
        .update({
          queue: state.queue,
          current_queue_index: state.currentQueueIndex,
          current_track: state.currentTrack,
          active_device_id: state.activeDeviceId,
          volume: state.volume,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .then(({ error }) => {
          if (error) console.error('Error syncing queue to Supabase:', error);
        });
    });

    // 2. Subscribe to Supabase changes to pull to Zustand
    const channel = supabase
      .channel(`queue-sync-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const newSession = payload.new;
          const currentState = usePlayerStore.getState();

          // Solo actualizamos si realmente hay un cambio para evitar re-renders innecesarios
          const queueChanged = JSON.stringify(newSession.queue) !== JSON.stringify(currentState.queue);
          const indexChanged = newSession.current_queue_index !== currentState.currentQueueIndex;
          const trackChanged = newSession.current_track?.id !== currentState.currentTrack?.id;
          const deviceChanged = newSession.active_device_id !== currentState.activeDeviceId;
          const volumeChanged = newSession.volume !== null && newSession.volume !== currentState.volume;

          if (queueChanged || indexChanged || trackChanged || deviceChanged || volumeChanged) {
            isRemoteUpdate.current = true;
            usePlayerStore.setState({
              queue: newSession.queue || [],
              currentQueueIndex: newSession.current_queue_index ?? -1,
              currentTrack: newSession.current_track || null,
              activeDeviceId: newSession.active_device_id || null,
              ...(newSession.volume !== null ? { volume: newSession.volume } : {})
            });
          }
        }
      )
      .subscribe();

    // 3. Initial pull
    supabase
      .from('sessions')
      .select('queue, current_queue_index, current_track, active_device_id, volume')
      .eq('id', sessionId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          isRemoteUpdate.current = true;
          usePlayerStore.setState({
            queue: data.queue || [],
            currentQueueIndex: data.current_queue_index ?? -1,
            currentTrack: data.current_track || null,
            activeDeviceId: data.active_device_id || null,
            ...(data.volume !== null ? { volume: data.volume } : {})
          });
        }
      });

    return () => {
      unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [sessionId]);
}
