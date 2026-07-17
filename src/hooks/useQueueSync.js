import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';

import { useAuthStore } from '../store/useAuthStore';

export function useQueueSync() {
  const authStore = useAuthStore((state) => state);
  const sessionId = authStore.user?.id || useSettingsStore((state) => state.sessionId);
  const isRemoteUpdate = useRef(false);
  const syncTimeoutRef = useRef(null);

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

      // Limpiar el timeout anterior si existe
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      // Debounce the Supabase push by 500ms to avoid race conditions with rapid synchronous state updates (like setQueue + shiftQueue)
      syncTimeoutRef.current = setTimeout(() => {
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
            if (error) {
              console.error('Error syncing queue to Supabase:', error);
              import('sonner').then(({ toast }) => toast.error('Error guardando en la nube: ' + error.message));
            }
          })
          .catch(err => {
            console.error('Catch error syncing:', err);
            import('sonner').then(({ toast }) => toast.error('Fallo crítico al sincronizar: ' + err.message));
          });
      }, 500);
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
          let updates = {};

          // FIX: PostgreSQL TOAST issue. If a JSONB column is large (>8KB), and an UPDATE doesn't modify it,
          // Postgres omits it from the WAL to save space. Supabase Realtime then delivers it as `null` or `undefined`.
          // Therefore, we only accept the queue from Realtime if it's explicitly an Array (including []).
          if (Array.isArray(newSession.queue)) {
            const queueChanged = JSON.stringify(newSession.queue) !== JSON.stringify(currentState.queue);
            if (queueChanged) updates.queue = newSession.queue;
          }

          if (newSession.current_queue_index !== undefined && newSession.current_queue_index !== currentState.currentQueueIndex) {
            updates.currentQueueIndex = newSession.current_queue_index;
          }

          if (newSession.current_track !== undefined && newSession.current_track?.id !== currentState.currentTrack?.id) {
            updates.currentTrack = newSession.current_track;
          }

          if (newSession.active_device_id !== undefined && newSession.active_device_id !== currentState.activeDeviceId) {
            updates.activeDeviceId = newSession.active_device_id;
          }

          if (newSession.volume !== undefined && newSession.volume !== null && newSession.volume !== currentState.volume) {
            updates.volume = newSession.volume;
          }

          if (Object.keys(updates).length > 0) {
            isRemoteUpdate.current = true;
            usePlayerStore.setState(updates);
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
