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
        const secret = useSettingsStore.getState().hostSecret;
        if (!authStore.user && !secret) return; // Si no hay usuario ni secreto admin, no intentar empujar estado (solo invitados)

        supabase
          .rpc('update_session_state', {
            p_session_id: sessionId,
            p_secret: secret,
            p_updates: {
              queue: state.queue,
              current_queue_index: state.currentQueueIndex,
              current_track: state.currentTrack,
              active_device_id: state.activeDeviceId,
              volume: state.volume
            }
          })
          .then(({ error }) => {
            if (error) {
              console.error('Error syncing queue to Supabase:', error);
              import('sonner').then(({ toast }) => toast.error('Error guardando en la nube (RPC): ' + error.message));
            }
          })
          .catch(err => {
            console.error('Catch error syncing:', err);
            import('sonner').then(({ toast }) => toast.error('Fallo crítico al sincronizar (RPC): ' + err.message));
          });
      }, 500);
    });

    // 2. Subscribe to Supabase changes to pull to Zustand
    const channel = supabase
      .channel(`queue-sync-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        async (payload) => {
          const newSession = payload.new;
          const currentState = usePlayerStore.getState();
          const { activeInstanceId, user, logout } = useAuthStore.getState();
          const { isAdminMode } = useSettingsStore.getState();
          let updates = {};

          // Kickout Logic: Si somos un Host autenticado y el active_instance_id cambia, fuimos reemplazados
          if (user && !isAdminMode && newSession.active_instance_id && newSession.active_instance_id !== activeInstanceId) {
            import('sonner').then(({ toast }) => {
              toast.error('Sesión iniciada en otro dispositivo. Cerrando reproductor.', { duration: 8000 });
            });
            
            // Pausar y desconectar el reproductor del dispositivo viejo
            try {
              const state = usePlayerStore.getState();
              if (state.player) {
                state.player.pause().catch(()=>{});
                setTimeout(() => state.player.disconnect(), 100);
              }
              const targetDevice = state.activeDeviceId || state.deviceId;
              if (targetDevice) {
                import('../lib/spotifyApi').then(m => m.pausePlayback(targetDevice)).catch(()=>{});
              }
            } catch (err) {}

            logout();
            return;
          }

          // Kickout Logic (Remoto): Si somos un Control Remoto y el active_remote_id cambia, fuimos reemplazados
          if (isAdminMode && newSession.active_remote_id && newSession.active_remote_id !== activeInstanceId) {
            import('sonner').then(({ toast }) => {
              toast.error('Otro control remoto se ha conectado. Desconectando...', { duration: 8000 });
            });
            const { clearSpotifyTokens } = await import('../lib/spotifyAuth');
            clearSpotifyTokens();
            useSettingsStore.getState().setIsAdminMode(false);
            return;
          }

          // Procesar Comandos de Reproducción (Solo el Host principal los ejecuta)

          if (!isAdminMode && newSession.playback_command) {
            const cmd = newSession.playback_command;
            if (cmd.ts > currentState.lastCommandTs) {
              usePlayerStore.getState().setLastCommandTs(cmd.ts);
              
              import('../hooks/useSpotifySDK').then(({ useSpotifySDK }) => {
                // Instanciar la lógica de controles temporalmente para ejecutar el comando
                // No llamamos al hook aquí directamente, usamos las funciones exportadas de spotifyApi
                import('../lib/spotifyApi').then(api => {
                  const targetDevice = currentState.activeDeviceId || currentState.deviceId;
                  if (!targetDevice) return;
                  
                  if (cmd.action === 'play') {
                    if (currentState.player && currentState.activeDeviceId === currentState.deviceId) {
                      currentState.player.resume().catch(() => {});
                    } else {
                      api.resumePlayback(targetDevice).catch(() => {});
                    }
                  } else if (cmd.action === 'pause') {
                    if (currentState.player && currentState.activeDeviceId === currentState.deviceId) {
                      currentState.player.pause().catch(() => {});
                    } else {
                      api.pausePlayback(targetDevice).catch(() => {});
                    }
                  } else if (cmd.action === 'next') {
                    const nextTrack = usePlayerStore.getState().shiftQueue();
                    if (nextTrack) {
                      import('../lib/spotifyApi').then(m => m.playTrack(targetDevice, [nextTrack.uri])).catch(()=>{});
                    } else {
                      api.skipToNext(targetDevice).catch(() => {});
                    }
                  } else if (cmd.action === 'play_specific') {
                    const track = usePlayerStore.getState().playTrackFromQueue(cmd.queueId);
                    if (track) {
                      import('../lib/spotifyApi').then(m => m.playTrack(targetDevice, [track.uri])).catch(()=>{});
                    }
                  } else if (cmd.action === 'prev') {
                    const prevTrack = usePlayerStore.getState().prevQueue();
                    if (prevTrack) {
                      import('../lib/spotifyApi').then(m => m.playTrack(targetDevice, [prevTrack.uri])).catch(()=>{});
                    } else {
                      api.skipToPrevious(targetDevice).catch(() => {});
                    }
                  }
                });
              });
            }
          }

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
      .on('broadcast', { event: 'playback_sync' }, (payload) => {
        const user = useAuthStore.getState().user;
        if (!user) {
          const store = usePlayerStore.getState();
          if (store.isPlaying !== payload.payload.isPlaying) {
             store.setIsPlaying(payload.payload.isPlaying);
          }
          if (Math.abs(store.progress - payload.payload.progress) > 3000) {
             store.setProgress(payload.payload.progress);
          }
        }
      })
      .subscribe();

    // Broadcast para sincronizar el progreso de la canción con controles remotos/invitados
    let broadcastInterval = setInterval(() => {
      const user = useAuthStore.getState().user;
      if (user && channel && channel.state === 'joined') {
         const store = usePlayerStore.getState();
         channel.send({
           type: 'broadcast',
           event: 'playback_sync',
           payload: {
             progress: store.progress,
             isPlaying: store.isPlaying
           }
         }).catch(()=>{}); // ignorar errores si falla
      }
    }, 2000);

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
      clearInterval(broadcastInterval);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Handle requests and session initialization globally
  useEffect(() => {
    if (!sessionId) return;

    const syncSession = async () => {
      const { mode, blacklistGenres, blacklistSongs, blacklistArtists, allowRepeats, repeatCooldown, requestsPerHour, requestsPerGuest, cooldownEnabled, cooldownMinutes, tableCount } = useSettingsStore.getState();
      const { queue, currentQueueIndex, volume, activeDeviceId } = usePlayerStore.getState();

      const secret = useSettingsStore.getState().hostSecret;
      const { activeInstanceId, logout } = useAuthStore.getState();
      const { data } = await supabase.from('sessions').select('id, active_instance_id').eq('id', sessionId).single();
      
      const { data: { user: sbUser } } = await supabase.auth.getUser();

      if (data) {
        if (authStore.user || secret) {
          // Si somos el host autenticado (no un remote restrictivo), podemos tomar control de la sesión
          if (authStore.user) {
             try {
               const { data: newSecret, error: takeoverError } = await supabase.rpc('host_takeover_session', {
                 p_session_id: sessionId,
                 p_active_instance_id: activeInstanceId
               });
               
               if (takeoverError) throw takeoverError;
               
               // Si entramos desde otro dispositivo y no teníamos el hostSecret, lo recuperamos de la DB
               if (newSecret && newSecret !== secret) {
                 useSettingsStore.getState().setHostSecret(newSecret);
               }
             } catch (err) {
               console.error("Error al tomar control de la sesión:", err);
             }
          }
          await supabase.rpc('update_session_state', {
            p_session_id: sessionId,
            p_secret: secret,
            p_updates: {
              ...(useSettingsStore.getState().isAdminMode ? { active_remote_id: activeInstanceId } : {}),
              active: true,
              mode,
              blacklist_genres: blacklistGenres,
              blacklist_songs: blacklistSongs,
              blacklist_artists: blacklistArtists,
              allow_repeats: allowRepeats,
              repeat_cooldown: repeatCooldown,
              cooldown_enabled: cooldownEnabled,
              cooldown_minutes: cooldownMinutes,
              table_count: tableCount,
              requests_per_hour: requestsPerHour,
              requests_per_guest: requestsPerGuest
            }
          });
        }
      } else {
        await supabase.from('sessions').insert({
          id: sessionId,
          host_secret: secret, // Guardar el secreto admin inicial
          active_instance_id: activeInstanceId,
          supabase_user_id: sbUser?.id,
          active: true,
          mode,
          blacklist_genres: blacklistGenres,
          blacklist_songs: blacklistSongs,
          blacklist_artists: blacklistArtists,
          allow_repeats: allowRepeats,
          repeat_cooldown: repeatCooldown,
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
              await supabase.rpc('manage_request', { p_request_id: newReq.id, p_session_id: sessionId, p_secret: useSettingsStore.getState().hostSecret, p_new_status: 'approved' });
            } else if (result.approved === false) {
              store.rejectRequest(newReq.id);
              toast.error(`Auto DJ rechazó la petición de ${newReq.requester} (${result.reason})`);
              await supabase.rpc('manage_request', { p_request_id: newReq.id, p_session_id: sessionId, p_secret: useSettingsStore.getState().hostSecret, p_new_status: 'rejected' });
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests', filter: `session_id=eq.${sessionId}` }, (payload) => {
        const updatedReq = payload.new;
        const store = usePlayerStore.getState();
        // Si otro dispositivo (el control remoto) la aprobó o rechazó, la quitamos de nuestra lista local de pendientes
        if (updatedReq.status !== 'pending') {
          // No llamamos a store.approveRequest porque eso la añadiría de nuevo a la cola local.
          // Solo queremos quitarla de la lista de pendientes, ya que la cola se sincroniza por otro lado.
          store.removePendingRequest(updatedReq.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      const secret = useSettingsStore.getState().hostSecret;
      if (secret) {
        supabase.rpc('update_session_state', { p_session_id: sessionId, p_secret: secret, p_updates: { active: false } }).then();
      }
    };
  }, [sessionId]);

  // --- Sincronización de progreso para el Control Remoto ---
  useEffect(() => {
    if (!sessionId || !useSettingsStore.getState().isAdminMode) return;
    
    let remoteSyncInterval = setInterval(async () => {
      try {
        const api = await import('../lib/spotifyApi');
        const state = await api.getPlaybackState();
        if (state && state.item) {
          const store = usePlayerStore.getState();
          store.setProgress(state.progress_ms);
          store.setDuration(state.item.duration_ms);
          store.setIsPlaying(state.is_playing);
          
          // Fallback sync for currentTrack just in case Realtime missed it
          if (store.currentTrack?.id !== state.item.id) {
            const apiTrack = {
              id: state.item.id,
              uri: state.item.uri,
              name: state.item.name,
              artists: state.item.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
              album: state.item.album?.name,
              image: state.item.album?.images?.[0]?.url,
              duration_ms: state.item.duration_ms
            };
            store.setCurrentTrack(apiTrack);
            
            // Also update queue index if found
            const qIdx = store.queue.findIndex(t => t.id === state.item.id);
            if (qIdx !== -1) store.setCurrentQueueIndex(qIdx);
          }
        }
      } catch (e) {}
    }, 5000);

    let localProgressInterval = setInterval(() => {
      const store = usePlayerStore.getState();
      if (store.isPlaying && store.progress < store.duration) {
        store.setProgress(store.progress + 1000);
      }
    }, 1000);

    return () => {
      clearInterval(remoteSyncInterval);
      clearInterval(localProgressInterval);
    };
  }, [sessionId]);
}
