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

          if (newSession.current_track !== undefined && JSON.stringify(newSession.current_track) !== JSON.stringify(currentState.currentTrack)) {
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
        usePlayerStore.getState().setInitialSyncDone(true);
      });

    return () => {
      unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Handle requests and session initialization globally
  useEffect(() => {
    if (!sessionId) return;

    const syncSession = async () => {
      const { mode, blacklistGenres, blacklistSongs, blacklistArtists, allowRepeats, requestsPerHour, requestsPerGuest, cooldownEnabled, cooldownMinutes, tableCount } = useSettingsStore.getState();
      const { queue, currentQueueIndex, volume, activeDeviceId } = usePlayerStore.getState();

      const { data } = await supabase.from('sessions').select('id').eq('id', sessionId).single();
      if (data) {
        await supabase.from('sessions').update({
          active: true,
          mode,
          blacklist_genres: blacklistGenres,
          blacklist_songs: blacklistSongs,
          blacklist_artists: blacklistArtists,
          allow_repeats: allowRepeats,
          cooldown_enabled: cooldownEnabled,
          cooldown_minutes: cooldownMinutes,
          table_count: tableCount,
          requests_per_hour: requestsPerHour,
          requests_per_guest: requestsPerGuest,
          updated_at: new Date().toISOString()
        }).eq('id', sessionId);
      } else {
        await supabase.from('sessions').insert({
          id: sessionId,
          active: true,
          mode,
          blacklist_genres: blacklistGenres,
          blacklist_songs: blacklistSongs,
          blacklist_artists: blacklistArtists,
          allow_repeats: allowRepeats,
          cooldown_enabled: cooldownEnabled,
          cooldown_minutes: cooldownMinutes,
          table_count: tableCount,
          requests_per_hour: requestsPerHour,
          requests_per_guest: requestsPerGuest,
          queue: queue || [],
          current_queue_index: currentQueueIndex ?? -1,
          volume: volume ?? 70,
          active_device_id: activeDeviceId,
          updated_at: new Date().toISOString()
        });
      }
    };
    syncSession();

    const channel = supabase
      .channel(`requests-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests', filter: `session_id=eq.${sessionId}` }, async (payload) => {
        const newReq = payload.new;
        const store = usePlayerStore.getState();
        const settings = useSettingsStore.getState();

        store.addPendingRequest({
          reqId: newReq.id,
          track: newReq.track,
          requester: newReq.requester,
          timestamp: newReq.created_at
        });

        // Use dynamic import for sonner to match useQueueSync pattern
        const { toast } = await import('sonner');

        if (settings.autoDJ) {
          try {
            const { evaluateTrack } = await import('../lib/autoDJ');
            const result = await evaluateTrack(newReq.track, settings);
            
            if (result.approved === true) {
              store.approveRequest(newReq.id);
              toast.success(`Auto DJ aprobó la petición de ${newReq.requester}`);
              await supabase.from('requests').update({ status: 'approved' }).eq('id', newReq.id);
            } else if (result.approved === false) {
              store.rejectRequest(newReq.id);
              toast.error(`Auto DJ rechazó la petición de ${newReq.requester} (${result.reason})`);
              await supabase.from('requests').update({ status: 'rejected' }).eq('id', newReq.id);
            } else {
              toast.info(`Auto DJ requiere revisión manual para la petición de ${newReq.requester} (${result.reason || 'Sin etiquetas claras'})`);
            }
          } catch (err) {
            console.error('Error evaluating track in Auto DJ', err);
          }
        } else {
          toast(`Nueva petición recibida de ${newReq.requester}`, { icon: '🎵' });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.from('sessions').update({ active: false }).eq('id', sessionId);
    };
  }, [sessionId]);
}
