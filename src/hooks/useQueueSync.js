import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { getInstanceId } from '../lib/instanceId';
import { setActiveSessionChannel, getLastRemoteActionTs } from '../lib/remoteSyncChannel';

export function useQueueSync() {
  const authStore = useAuthStore((state) => state);
  const sessionId = authStore.user?.id || useSettingsStore((state) => state.sessionId);
  const isRemoteUpdate = useRef(false);
  const syncTimeoutRef = useRef(null);
  const isTakingOverRef = useRef(false);
  const lastBroadcastPayload = useRef({ progress: -1, isPlaying: null });

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
        state.volume === prevState.volume &&
        state.playHistory === prevState.playHistory
        // NOTE: `progress` is intentionally excluded here. Progress is synced
        // via the broadcast channel below, not via a full DB write, which
        // would be triggered 3600 times/hour and is very expensive.
      ) {
        return;
      }

      // Los controles remotos (isAdminMode) NUNCA deben empujar cambios locales de su player a la DB del host
      if (useSettingsStore.getState().isAdminMode) {
        return;
      }

      if (isRemoteUpdate.current) {
        isRemoteUpdate.current = false;
        return;
      }

      // Guard: don't push to Supabase if the state is being cleared (logout)
      // This prevents clearPlayerState() from wiping the server-side queue
      if (prevState.queue.length > 0 && state.queue.length === 0 && state.currentTrack === null) {
        return;
      }

      // Guard: don't push empty uninitialized state before initial sync completes
      if (!state.initialSyncDone && state.queue.length === 0 && !state.currentTrack) {
        return;
      }

      // Limpiar el timeout anterior si existe
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      // Debounce the Supabase push by 120ms for ultra-responsive sync
      syncTimeoutRef.current = setTimeout(() => {
        const secret = useSettingsStore.getState().hostSecret;
        if (!authStore.user && !secret) return;

        supabase
          .rpc('sync_host_config', {
            p_session_id: sessionId,
            p_secret: secret,
            p_updates: {
              queue: state.queue,
              current_queue_index: state.currentQueueIndex,
              current_track: state.currentTrack,
              play_history: state.playHistory,
              paired_tvs: useSettingsStore.getState().pairedTvs,
              active_device_id: state.activeDeviceId,
              volume: state.volume
            }
          })
          .then(({ error }) => {
            if (error) {
              if (error.code === 'P0001') return;
              console.error('Error syncing queue to Supabase:', error);
            }
          })
          .catch(err => {
            console.error('Catch error syncing:', err);
          });
      }, 120);
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

      if (Array.isArray(newSessionData.play_history)) {
        const historyChanged = JSON.stringify(newSessionData.play_history) !== JSON.stringify(currentState.playHistory);
        if (historyChanged) updatesToApply.playHistory = newSessionData.play_history;
      }

      if (Array.isArray(newSessionData.paired_tvs)) {
        const currentTvs = useSettingsStore.getState().pairedTvs;
        const tvsChanged = JSON.stringify(newSessionData.paired_tvs) !== JSON.stringify(currentTvs);
        if (tvsChanged) {
          useSettingsStore.getState().setPairedTvs(newSessionData.paired_tvs);
          window.dispatchEvent(new Event('bq-paired-tvs-updated'));
        }
      }

      if (Object.keys(updatesToApply).length > 0) {
        isRemoteUpdate.current = true;
        
        // Check if currentTrack changed from a remote update
        const trackChanged = updatesToApply.currentTrack !== undefined && 
                             JSON.stringify(updatesToApply.currentTrack) !== JSON.stringify(currentState.currentTrack);
        
        usePlayerStore.setState(updatesToApply);
        usePlayerStore.getState().startQueuePreloadWorker();

        const finalState = usePlayerStore.getState();
        
        // If the track changed remotely (e.g. Host auto-advanced), we MUST tell the local engine to play it!
        if (trackChanged && finalState.currentTrack && finalState.youtubePlayer) {
          finalState.playEngineTrack(finalState.currentTrack, 0, null, finalState.isPlaying);
        }

        // Auto-play if nothing is playing and the queue has unplayed tracks (from external changes like Guest additions or Request approvals)
        if (!finalState.currentTrack && finalState.queue.length > 0) {
          const nextTrack = finalState.shiftQueue();
          if (nextTrack) {
            usePlayerStore.getState().playEngineTrack(nextTrack);
          }
        }
      }
    };

    // Suscripción a cambios en useSettingsStore (para pairedTvs)
    const unsubscribeSettings = useSettingsStore.subscribe((state, prevState) => {
      if (state.pairedTvs === prevState.pairedTvs) return;
      if (isRemoteUpdate.current) return;

      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        const secret = useSettingsStore.getState().hostSecret;
        if (!authStore.user && !secret) return;
        
        const playerState = usePlayerStore.getState();
        supabase.rpc('sync_host_config', {
          p_session_id: sessionId,
          p_secret: secret,
          p_updates: {
            queue: playerState.queue,
            current_queue_index: playerState.currentQueueIndex,
            current_track: playerState.currentTrack,
            play_history: playerState.playHistory,
            paired_tvs: state.pairedTvs,
            active_device_id: playerState.activeDeviceId,
            volume: playerState.volume
          }
        }).then(({ error }) => {
          if (error) console.error('Error syncing TV changes:', error);
        });
      }, 500);
    });

    // Ejecución centralizada de comandos de reproducción en el Host
    const executeHostPlaybackCommand = (cmd) => {
      if (!cmd || !cmd.action) return;
      const currentState = usePlayerStore.getState();
      if (cmd.ts && cmd.ts === currentState.lastCommandTs) return;
      if (cmd.ts) currentState.setLastCommandTs(cmd.ts);

      if (cmd.ts && (Date.now() - cmd.ts > 10000)) return;

      if (cmd.action === 'play') {
        if (currentState.youtubePlayer) currentState.youtubePlayer.playVideo();
        currentState.setIsPlaying(true);
      } else if (cmd.action === 'pause') {
        if (currentState.youtubePlayer) currentState.youtubePlayer.pauseVideo();
        currentState.setIsPlaying(false);
      } else if (cmd.action === 'next') {
        if (!currentState.checkSkipSpam()) return;
        const nextTrack = currentState.shiftQueue();
        if (nextTrack) {
          currentState.playEngineTrack(nextTrack);
        }
      } else if (cmd.action === 'play_specific') {
        const track = currentState.playTrackFromQueue(cmd.queueId);
        if (track) {
          currentState.playEngineTrack(track);
        }
      } else if (cmd.action === 'prev') {
        const prevTrack = currentState.prevQueue();
        if (prevTrack) {
          currentState.playEngineTrack(prevTrack);
        }
      } else if (cmd.action === 'restart') {
        if (currentState.youtubePlayer) {
          currentState.youtubePlayer.seekTo(0, true);
          currentState.youtubePlayer.playVideo();
          currentState.setProgress(0);
          currentState.setIsPlaying(true);
        }
      } else if (cmd.action === 'seek') {
        if (currentState.youtubePlayer && typeof cmd.value === 'number') {
          currentState.youtubePlayer.seekTo(cmd.value / 1000, true);
          currentState.setProgress(cmd.value);
        }
      } else if (cmd.action === 'set_volume') {
        currentState.setVolume(cmd.value);
        if (currentState.youtubePlayer) {
          currentState.youtubePlayer.setVolume(cmd.value);
        }
      } else if (cmd.action === 'toggle_karaoke') {
        useSettingsStore.getState().setKaraokeEnabled(cmd.value);
        if (currentState.currentTrack) {
          const newMode = cmd.value ? 'karaoke' : useSettingsStore.getState().lyricsEnabled ? 'lyrics' : 'normal';
          currentState.playEngineTrack(currentState.currentTrack, currentState.progress, newMode);
        }
      } else if (cmd.action === 'toggle_lyrics') {
        useSettingsStore.getState().setLyricsEnabled(cmd.value);
        if (currentState.currentTrack) {
          const newMode = cmd.value ? 'lyrics' : useSettingsStore.getState().karaokeEnabled ? 'karaoke' : 'normal';
          currentState.playEngineTrack(currentState.currentTrack, currentState.progress, newMode);
        }
      }
    };

    initSyncTimeout = setTimeout(() => {
      if (!isMounted) return;

      syncChannel = supabase
        .channel(`queue-sync-${sessionId}`)
        .on('broadcast', { event: 'remote_command' }, ({ payload }) => {
          const { user } = useAuthStore.getState();
          const { isAdminMode } = useSettingsStore.getState();
          // El anfitrión principal ejecuta los comandos WebSocket en <50ms
          if (user && !isAdminMode) {
            executeHostPlaybackCommand(payload);
          }
        })
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
          async (payload) => {
            const newSession = payload.new;
            const currentState = usePlayerStore.getState();

            const activeInstanceId = getInstanceId();
            const { user, logout } = useAuthStore.getState();
            const { isAdminMode } = useSettingsStore.getState();

            // Ignorar eventos de kickout si estamos en medio de tomar el control
            if (isTakingOverRef.current) return;

            // Kickout Logic: Si somos un Host autenticado y el active_instance_id cambia, fuimos reemplazados
            if (user && !isAdminMode && newSession.active_instance_id && newSession.active_instance_id !== activeInstanceId) {
              import('sonner').then(({ toast }) => {
                toast.error('Sesión iniciada en otro dispositivo', { duration: 5000 });
              });
              
              try {
                const state = usePlayerStore.getState();
                if (state.youtubePlayer) {
                  state.youtubePlayer.pauseVideo();
                }
              } catch (err) {}

              logout(true).then(() => {
                window.location.href = '/';
              });
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

            // Procesar Comandos de Reproducción como fallback desde DB
            if (!isAdminMode && newSession.playback_command) {
              executeHostPlaybackCommand(newSession.playback_command);
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
            const p = payload.payload;
            const isRecentRemoteAction = (Date.now() - getLastRemoteActionTs()) < 1200;

            if (!isRecentRemoteAction && p.isPlaying !== undefined && store.isPlaying !== p.isPlaying) {
               store.setIsPlaying(p.isPlaying);
            }
            if (p.progress !== undefined && Math.abs(store.progress - p.progress) > 1500) {
               store.setProgress(p.progress);
            }
            if (p.currentTrack && JSON.stringify(p.currentTrack) !== JSON.stringify(store.currentTrack)) {
               store.setCurrentTrack(p.currentTrack);
            }
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setActiveSessionChannel(syncChannel);
          }
        });

      setActiveSessionChannel(syncChannel);
    }, 150);

    // Broadcast para sincronizar el estado y progreso en tiempo real con controles remotos
    let broadcastInterval = setInterval(() => {
      const user = useAuthStore.getState().user;
      const isAdminMode = useSettingsStore.getState().isAdminMode;
      // Solo el anfitrión principal emite el pulso
      if (user && !isAdminMode && syncChannel && syncChannel.state === 'joined') {
         const store = usePlayerStore.getState();
         const last = lastBroadcastPayload.current;
         if (Math.abs(store.progress - last.progress) >= 1000 || store.isPlaying !== last.isPlaying || store.currentTrack?.id !== last.trackId) {
           lastBroadcastPayload.current = { progress: store.progress, isPlaying: store.isPlaying, trackId: store.currentTrack?.id };
           syncChannel.send({
             type: 'broadcast',
             event: 'playback_sync',
             payload: {
               progress: store.progress,
               isPlaying: store.isPlaying,
               currentTrack: store.currentTrack
             }
           }).catch(()=>{});
         }
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

    // 5. Flush inmediato antes de cerrar o recargar la pestaña
    const flushPendingSync = () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      const secret = useSettingsStore.getState().hostSecret;
      const user = useAuthStore.getState().user;
      const isAdmin = useSettingsStore.getState().isAdminMode;
      if (isAdmin || (!user && !secret)) return;

      const state = usePlayerStore.getState();
      if (!state.initialSyncDone && state.queue.length === 0 && !state.currentTrack) return;

      supabase
        .rpc('sync_host_config', {
          p_session_id: sessionId,
          p_secret: secret,
          p_updates: {
            queue: state.queue,
            current_queue_index: state.currentQueueIndex,
            current_track: state.currentTrack,
            play_history: state.playHistory,
            paired_tvs: useSettingsStore.getState().pairedTvs,
            active_device_id: state.activeDeviceId,
            volume: state.volume
          }
        })
        .catch(() => {});
    };

    const handleBeforeUnload = () => {
      flushPendingSync();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    // 3. Initial pull
    supabase
      .from('sessions')
      .select('queue, current_queue_index, current_track, play_history, paired_tvs, active_device_id, volume')
      .eq('id', sessionId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) {
          isRemoteUpdate.current = true;
          
          if (Array.isArray(data.paired_tvs)) {
            useSettingsStore.getState().setPairedTvs(data.paired_tvs);
            window.dispatchEvent(new Event('bq-paired-tvs-updated'));
          }

          // Save the persisted progress BEFORE overwriting state from DB,
          // so we can resume from the right position after the SDK is ready.
          const persistedProgress = usePlayerStore.getState().progress;
          
          usePlayerStore.setState({
            queue: data.queue || [],
            currentQueueIndex: data.current_queue_index ?? -1,
            currentTrack: data.current_track || null,
            playHistory: data.play_history || [],
            activeDeviceId: data.active_device_id || null,
            ...(data.volume !== null ? { volume: data.volume } : {})
          });
          usePlayerStore.getState().startQueuePreloadWorker();

          // If the SDK is already initialized, trigger playback immediately.
          // Otherwise the onReady handler in useYouTubeSDK will pick up
          // currentTrack (set above) and start from persistedProgress.
          const playerState = usePlayerStore.getState();
          if (data.current_track && playerState.sdkReady && playerState.youtubePlayer) {
            playerState.playEngineTrack(data.current_track, persistedProgress, null, true);
          }
        }
        usePlayerStore.getState().setInitialSyncDone(true);
      });

    return () => {
      isMounted = false;
      clearTimeout(initSyncTimeout);
      unsubscribe();
      unsubscribeSettings();
      clearInterval(broadcastInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      flushPendingSync();
      setActiveSessionChannel(null);
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

      const { mode, alwaysAvailable, blacklistGenres, blacklistSongs, blacklistArtists, allowRepeats, repeatCooldown, cooldownEnabled, cooldownMinutes, tableCount, requestsPerHour, requestsPerGuest, pairedTvs } = useSettingsStore.getState();
      const { queue, currentQueueIndex, volume, activeDeviceId, playHistory } = usePlayerStore.getState();

      isTakingOverRef.current = true;

      const activeInstanceId = getInstanceId();
      const { data } = await supabase.from('sessions').select('id, active_instance_id').eq('id', sessionId).maybeSingle();
      
      const { data: { user: sbUser } } = await supabase.auth.getUser();

      if (data) {
        if (authStore.user || secret) {
          // Si somos el host autenticado (no un remote/admin), podemos tomar control de la sesión.
          // Re-read isAdminMode fresh to avoid race condition with LoginPage setting it.
          const isAdmin = useSettingsStore.getState().isAdminMode;
          if (authStore.user && !isAdmin) {
             try {
               const { data: newSecret, error: takeoverError } = await supabase.rpc('host_takeover_session', {
                 p_session_id: sessionId,
                 p_active_instance_id: activeInstanceId,
                 p_secret: secret
               });
               
               if (takeoverError) throw takeoverError;
               
               // Si entramos desde otro dispositivo y no teníamos el hostSecret, lo recuperamos de la DB
               if (newSecret && newSecret !== secret) {
                 useSettingsStore.getState().setHostSecret(newSecret);
               }

               // Update active_instance_id ONLY for genuine host takeover (never for remote/admin)
               await supabase.from('sessions').update({ active_instance_id: activeInstanceId }).eq('id', sessionId);
             } catch (err) {
               console.error("Error al tomar control de la sesión:", err);
               // Si no podemos tomar control (ej. no somos los dueños), regeneramos la sesión y abortamos
               useSettingsStore.getState().regenerateSession();
               isTakingOverRef.current = false;
               return; 
             }
          } else if (isAdmin) {
            // Para Control Remoto: Actualizar ÚNICAMENTE el active_remote_id (expulsa el remoto viejo sin tocar el Host)
            await supabase.from('sessions').update({ active_remote_id: activeInstanceId }).eq('id', sessionId);
          }
          await supabase.rpc('sync_host_config', {
            p_session_id: sessionId,
            p_secret: useSettingsStore.getState().hostSecret,
            p_updates: {
              active: alwaysAvailable,
              active_remote_id: activeInstanceId,
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
        const isAdmin = useSettingsStore.getState().isAdminMode;
        const { error: insertError } = await supabase.from('sessions').insert({
          id: sessionId,
          host_secret: secret, // Guardar el secreto admin inicial
          active_instance_id: isAdmin ? null : activeInstanceId,
          active_remote_id: isAdmin ? activeInstanceId : null,
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
          play_history: playHistory || [],
          paired_tvs: pairedTvs || [],
          volume: volume ?? 70,
          active_device_id: activeDeviceId,
          updated_at: new Date().toISOString()
        });
        if (insertError) {
          console.error("Critical: Failed to insert session!", insertError);
          import('sonner').then(({ toast }) => toast.error('Error al crear la sala: ' + insertError.message));
        }
      }
      isTakingOverRef.current = false;
    };
    syncSession();

    initReqTimeout = setTimeout(() => {
      if (!isMounted) return;

      // 1. Fetch existing pending requests from Supabase first
      supabase
        .from('requests')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            const store = usePlayerStore.getState();
            const pendings = [];
            const history = [];
            data.forEach(req => {
              const formattedReq = {
                reqId: req.id,
                track: req.track,
                requester: req.requester,
                timestamp: req.created_at,
                status: req.status
              };
              if (req.status === 'pending') {
                pendings.push(formattedReq);
              }
              history.push(formattedReq);
            });
            // Sobreescribir el estado local con la verdad de la DB
            usePlayerStore.setState({
              pendingRequests: pendings,
              requestHistory: history.slice(0, 500)
            });
          }
        });

      // 2. Escuchar nuevas peticiones
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
