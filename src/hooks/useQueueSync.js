import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { getInstanceId } from '../lib/instanceId';

export function useQueueSync() {
  const authStore = useAuthStore((state) => state);
  const sessionId = authStore.user?.id || useSettingsStore((state) => state.sessionId);
  const isRemoteUpdate = useRef(false);
  const syncTimeoutRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    
    // Capturar el secret inicial para usarlo en el cleanup, 
    // incluso si el usuario hace logout y el store se limpia antes de desmontar.
    const initialSecret = useSettingsStore.getState().hostSecret;
    
    let syncChannel = null;
    let isMounted = true;
    let initSyncTimeout;

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
          .rpc('sync_host_config', {
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
              if (error.code === 'P0001') {
                console.warn('Session not yet created, skipping queue sync update for now.');
                return;
              }
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
    const processStateUpdates = (newSessionData) => {
      const currentState = usePlayerStore.getState();
      let updatesToApply = {};
      
      if (Array.isArray(newSessionData.queue)) {
        const queueChanged = JSON.stringify(newSessionData.queue) !== JSON.stringify(currentState.queue);
        if (queueChanged) updatesToApply.queue = newSessionData.queue;
      }

      if (newSessionData.current_queue_index !== undefined && newSessionData.current_queue_index !== currentState.currentQueueIndex) {
        updatesToApply.currentQueueIndex = newSessionData.current_queue_index;
      }

      if (newSessionData.current_track !== undefined && JSON.stringify(newSessionData.current_track) !== JSON.stringify(currentState.currentTrack)) {
        updatesToApply.currentTrack = newSessionData.current_track;
      }

      if (newSessionData.active_device_id !== undefined && newSessionData.active_device_id !== currentState.activeDeviceId) {
        updatesToApply.activeDeviceId = newSessionData.active_device_id;
      }

      if (newSessionData.volume !== undefined && newSessionData.volume !== null && newSessionData.volume !== currentState.volume) {
        updatesToApply.volume = newSessionData.volume;
      }

      if (Object.keys(updatesToApply).length > 0) {
        isRemoteUpdate.current = true;
        usePlayerStore.setState(updatesToApply);
        if (updatesToApply.queue) {
           usePlayerStore.getState().startQueuePreloadWorker();
        }
      }
    };

    initSyncTimeout = setTimeout(() => {
      if (!isMounted) return;

      syncChannel = supabase
        .channel(`queue-sync-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        async (payload) => {
          const newSession = payload.new;
          const currentState = usePlayerStore.getState();

          const activeInstanceId = getInstanceId();
          const { user, logout } = useAuthStore.getState();
          const { isAdminMode } = useSettingsStore.getState();
          let updates = {};

          // Kickout Logic: Si somos un Host autenticado y el active_instance_id cambia, fuimos reemplazados
          if (user && !isAdminMode && newSession.active_instance_id && newSession.active_instance_id !== activeInstanceId) {
            import('sonner').then(({ toast }) => {
              toast.error('Sesión iniciada en otro dispositivo', { duration: 5000 });
            });
            
            // Pausar y desconectar el reproductor del dispositivo viejo
            try {
              const state = usePlayerStore.getState();
              if (state.youtubePlayer) {
                state.youtubePlayer.pauseVideo();
              }
            } catch (err) {}

            logout();
            window.location.href = '/';
            return;
          }

          // Kickout Logic (Remoto): Si somos un Control Remoto y el active_remote_id cambia, fuimos reemplazados
          if (isAdminMode && newSession.active_remote_id && newSession.active_remote_id !== activeInstanceId) {
            import('sonner').then(({ toast }) => {
              toast.error('Otro control remoto se ha conectado. Desconectando...', { duration: 8000 });
            });
            useSettingsStore.getState().setIsAdminMode(false);
            return;
          }

          // Kickout Logic (Remoto): Si el anfitrión cerró sesión o regeneró el QR, el secret cambia y nos expulsa
          if (isAdminMode && newSession.secret && newSession.secret !== useSettingsStore.getState().hostSecret) {
            import('sonner').then(({ toast }) => {
              toast.error('La sesión del anfitrión ha expirado o se ha cerrado.', { duration: 8000 });
            });
            useSettingsStore.getState().clearSettingsState();
            window.location.href = '/';
            return;
          }

          // Procesar Comandos de Reproducción (Solo el Host principal los ejecuta)

          if (!isAdminMode && newSession.playback_command) {
            const cmd = newSession.playback_command;
            if (cmd.ts !== currentState.lastCommandTs) {
              usePlayerStore.getState().setLastCommandTs(cmd.ts);
                          if (Date.now() - cmd.ts < 10000) {
                  if (cmd.action === 'play') {
                    if (currentState.youtubePlayer) currentState.youtubePlayer.playVideo();
                  } else if (cmd.action === 'pause') {
                    if (currentState.youtubePlayer) currentState.youtubePlayer.pauseVideo();
                  } else if (cmd.action === 'next') {
                    const nextTrack = usePlayerStore.getState().shiftQueue();
                    if (nextTrack) {
                      usePlayerStore.getState().playEngineTrack(nextTrack);
                    }
                  } else if (cmd.action === 'play_specific') {
                    const track = usePlayerStore.getState().playTrackFromQueue(cmd.queueId);
                    if (track) {
                      usePlayerStore.getState().playEngineTrack(track);
                    }
                  } else if (cmd.action === 'prev') {
                    const prevTrack = usePlayerStore.getState().prevQueue();
                    if (prevTrack) {
                      usePlayerStore.getState().playEngineTrack(prevTrack);
                    }
                  } else if (cmd.action === 'restart') {
                    if (currentState.youtubePlayer) {
                      currentState.youtubePlayer.seekTo(0, true);
                      currentState.youtubePlayer.playVideo();
                    }
                  } else if (cmd.action === 'toggle_karaoke') {
                    useSettingsStore.getState().setKaraokeEnabled(cmd.value);
                    if (currentState.currentTrack) {
                      const newMode = cmd.value ? 'karaoke' : useSettingsStore.getState().lyricsEnabled ? 'lyrics' : 'normal';
                      usePlayerStore.getState().playEngineTrack(currentState.currentTrack, currentState.progress, newMode);
                    }
                  } else if (cmd.action === 'toggle_lyrics') {
                    useSettingsStore.getState().setLyricsEnabled(cmd.value);
                    if (currentState.currentTrack) {
                      const newMode = cmd.value ? 'lyrics' : useSettingsStore.getState().karaokeEnabled ? 'karaoke' : 'normal';
                      usePlayerStore.getState().playEngineTrack(currentState.currentTrack, currentState.progress, newMode);
                    }
                  }
            }
          }
        }
          // Procesar las actualizaciones de la cola y la pista actual
          processStateUpdates(newSession);
        }
      )
      .on('broadcast', { event: 'playback_sync' }, (payload) => {
        const user = useAuthStore.getState().user;
        const isAdminMode = useSettingsStore.getState().isAdminMode;
        if (!user || isAdminMode) {
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
    }, 150);

    // Broadcast para sincronizar el progreso de la canción con controles remotos/invitados
    let broadcastInterval = setInterval(() => {
      const user = useAuthStore.getState().user;
      if (user && syncChannel && syncChannel.state === 'joined') {
         const store = usePlayerStore.getState();
         syncChannel.send({
           type: 'broadcast',
           event: 'playback_sync',
           payload: {
             progress: store.progress,
             isPlaying: store.isPlaying
           }
         }).catch(()=>{}); // ignorar errores si falla
      }
    }, 1000);

    // 4. Reconectar y sincronizar cuando la pestaña vuelve a ser visible (para celulares)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const { data, error } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
          if (data && !error) {
            processStateUpdates(data);
          }
        } catch (e) {
          console.error('Error re-syncing session on visibility change:', e);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. Initial pull
    supabase
      .from('sessions')
      .select('queue, current_queue_index, current_track, active_device_id, volume')
      .eq('id', sessionId)
      .maybeSingle()
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
          usePlayerStore.getState().startQueuePreloadWorker();
        }
        usePlayerStore.getState().setInitialSyncDone(true);
      });

    return () => {
      isMounted = false;
      clearTimeout(initSyncTimeout);
      unsubscribe();
      clearInterval(broadcastInterval);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      if (syncChannel) supabase.removeChannel(syncChannel);
    };
  }, [sessionId]);

  // Handle requests and session initialization globally
  useEffect(() => {
    if (!sessionId) return;
    
    // Capture secret to ensure cleanup RPC fires even if store is cleared on logout
    const initialSecret = useSettingsStore.getState().hostSecret;

    let requestsChannel = null;
    let isMounted = true;
    let initReqTimeout;

    const syncSession = async () => {
      const authStore = useAuthStore.getState();
      const secret = useSettingsStore.getState().hostSecret;
      if (!authStore.user && !secret) return; 

      const { mode, alwaysAvailable, blacklistGenres, blacklistSongs, blacklistArtists, allowRepeats, repeatCooldown, cooldownEnabled, cooldownMinutes, tableCount, requestsPerHour, requestsPerGuest } = useSettingsStore.getState();
      const { queue, currentQueueIndex, volume, activeDeviceId } = usePlayerStore.getState();

      const activeInstanceId = getInstanceId();
      const { data } = await supabase.from('sessions').select('id, active_instance_id').eq('id', sessionId).maybeSingle();
      
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
          await supabase.rpc('sync_host_config', {
            p_session_id: sessionId,
            p_secret: useSettingsStore.getState().hostSecret,
            p_updates: {
              active: alwaysAvailable,
              ...(useSettingsStore.getState().isAdminMode ? { active_remote_id: activeInstanceId } : {}),
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
        const { error: insertError } = await supabase.from('sessions').insert({
          id: sessionId,
          host_secret: secret, // Guardar el secreto admin inicial
          active_instance_id: activeInstanceId,
          supabase_user_id: sbUser?.id,
          active: alwaysAvailable,
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
        if (insertError) {
          console.error("Critical: Failed to insert session!", insertError);
          import('sonner').then(({ toast }) => toast.error('Error al crear la sala: ' + insertError.message));
        }
      }
    };
    syncSession();

    initReqTimeout = setTimeout(() => {
      if (!isMounted) return;

      requestsChannel = supabase
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
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(initReqTimeout);
      
      if (requestsChannel) supabase.removeChannel(requestsChannel);
    };
  }, [sessionId]);
}
