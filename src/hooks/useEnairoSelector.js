import { useState, useEffect } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { supabase } from '../lib/supabase';
import { getSecureServerTime, getSecureServerDateString } from '../utils/timeUtils';
import { sanitizePrompt } from '../utils/security';
import { toast } from 'sonner';

let isEnairoTimerRunning = false;

function isTrackAlreadyPlayedOrInQueue(trackName, artistName, history = [], currentQueue = []) {
  if (!trackName) return false;
  const normName = trackName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const normArtist = (artistName || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const isPlayed = history.some(h => {
    const hName = (h.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const hArtist = (typeof h.artists === 'string' ? h.artists : (h.artists || []).map(a => a.name || a).join(', ')).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (hName === normName) {
      if (!normArtist || !hArtist) return true;
      return hArtist.includes(normArtist) || normArtist.includes(hArtist);
    }
    return false;
  });

  if (isPlayed) return true;

  const isInQueue = currentQueue.some(q => {
    const qName = (q.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const qArtist = (typeof q.artists === 'string' ? q.artists : (q.artists || []).map(a => a.name || a).join(', ')).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (qName === normName) {
      if (!normArtist || !qArtist) return true;
      return qArtist.includes(normArtist) || normArtist.includes(qArtist);
    }
    return false;
  });

  return isInQueue;
}

export function useEnairoSelector() {
  const {
    enairoEnabled,
    setEnairoEnabled,
    enairoUsageCount,
    enairoLastUsedDate,
    enairoCooldownUntil,
    setEnairoCooldown,
    resetEnairoUsage,
    enairoPrompt,
    enairoTestMode,
    enairoIsThinking: isThinking,
    setEnairoIsThinking: setIsThinking,
    whitelistGenres,
    blacklistGenres,
    blacklistSongs,
    blacklistArtists,
    enairoTrackCount,
    explicitFilter,
    enairoSweepCount,
    enairoSweepDate,
    setEnairoSweepCount,
    resetEnairoSweepUsage
  } = useSettingsStore();
  const { queue, playHistory, addToQueue, removeFromQueue, reorderQueue } = usePlayerStore();

  const triggerEnairo = async () => {
    // 1. Validaciones de tiempo y uso diario
    const now = await getSecureServerTime();
    const today = await getSecureServerDateString();

    // Si cambió el día (basado en el servidor), reiniciar contador
    let currentUsageCount = enairoUsageCount;
    if (enairoLastUsedDate !== today) {
      resetEnairoUsage();
      currentUsageCount = 0;
    }

    // Límite diario: 3 veces al día
    if (!enairoTestMode && currentUsageCount >= 3) {
      toast.error('envAIro ha alcanzado su límite de 3 usos por día. Vuelve mañana.', { icon: '🚫' });
      return false;
    }

    // Cooldown de 2 horas (7200000 ms)
    if (!enairoTestMode && now < enairoCooldownUntil) {
      const minutesLeft = Math.ceil((enairoCooldownUntil - now) / 60000);
      toast.error(`envAIro está descansando. Podrás usarlo de nuevo en ${minutesLeft} minutos.`, { icon: '⏳' });
      return false;
    }

    if (isThinking) return false;

    setIsThinking(true);
    // Bloquear inmediatamente el botón para evitar doble clic o spam
    const cooldownDuration = enairoTestMode ? 30000 : 7200000; // 30s test, 2h real
    setEnairoCooldown(now + cooldownDuration, currentUsageCount + 1, today);
    setEnairoEnabled(true);

    // Filtrar el historial para considerar ÚNICAMENTE las canciones reproducidas HOY
    const todayPlayHistory = (playHistory || []).filter(track => {
      if (!track.playedAt) return false;
      try {
        const trackDateStr = new Date(track.playedAt).toISOString().split('T')[0];
        return trackDateStr === today;
      } catch {
        return false;
      }
    });

    const playedSongNames = todayPlayHistory.map(t => `${t.name} - ${typeof t.artists === 'string' ? t.artists : (t.artists || []).map(a => a.name || a).join(', ')}`);
    const combinedBlacklistSongs = Array.from(new Set([...(blacklistSongs || []), ...playedSongNames]));

    try {
      const { data, error } = await supabase.functions.invoke('enairo-selector', {
        body: {
          action_mode: 'generate',
          history: todayPlayHistory.slice(0, 10),
          playedHistory: playedSongNames,
          queue: queue,
          settings: {
            enairoPrompt: sanitizePrompt(enairoPrompt),
            whitelistGenres,
            blacklistGenres,
            blacklistSongs: combinedBlacklistSongs,
            blacklistArtists,
            trackCount: enairoTrackCount
          }
        }
      });

      if (error) throw error;

      const { tracksToAdd = [], actions = [], reasoning } = data;

      // Ejecutar Acciones (Reorder / Remove)
      if (actions.length > 0) {
        actions.forEach(action => {
          if (action.type === 'remove' && action.queueId) {
            removeFromQueue(action.queueId);
            toast.success(`EnvAIro eliminó una canción por no encajar.`);
          } else if (action.type === 'reorder' && action.queueId && typeof action.newIndex === 'number') {
            const currentQueue = usePlayerStore.getState().queue;
            const oldIndex = currentQueue.findIndex(t => t.queueId === action.queueId);
            if (oldIndex !== -1 && oldIndex !== action.newIndex && action.newIndex < currentQueue.length) {
              reorderQueue(oldIndex, action.newIndex);
            }
          }
        });
      }

      // Agregar nuevas canciones
      if (tracksToAdd.length > 0) {
        let foundTracks = [];
        try {
          const { data, error } = await supabase.functions.invoke('search-spotify', {
            body: { queries: tracksToAdd, type: 'track', limit: 1, filterExplicit: useSettingsStore.getState().explicitFilter }
          });

          if (error) throw error;

          if (data && data.results) {
            foundTracks = data.results.map((res) => {
              if (res && res.tracks && res.tracks.items && res.tracks.items.length > 0) {
                const spotifyTrack = res.tracks.items[0];
                return {
                  id: spotifyTrack.id,
                  name: spotifyTrack.name,
                  artists: spotifyTrack.artists.map(a => a.name).join(', '),
                  image: spotifyTrack.album?.images?.[0]?.url || '',
                  duration_ms: spotifyTrack.duration_ms,
                  uri: spotifyTrack.uri,
                  source: 'spotify',
                  addedBy: 'EnvAIro Selector'
                };
              }
              return null;
            }).filter(Boolean);
          }
        } catch (err) {
          console.error("Error buscando canciones recomendadas en lote:", err);
        }

        const currentFullHistory = usePlayerStore.getState().playHistory || [];
        const currentTodayHistory = currentFullHistory.filter(track => {
          if (!track.playedAt) return false;
          try {
            const trackDateStr = new Date(track.playedAt).toISOString().split('T')[0];
            return trackDateStr === today;
          } catch {
            return false;
          }
        });
        const currentQueueState = usePlayerStore.getState().queue || [];

        const nonRepeatedTracks = foundTracks.filter(track => {
          const isDuplicate = isTrackAlreadyPlayedOrInQueue(track.name, track.artists, currentTodayHistory, currentQueueState);
          
          return !isDuplicate;
        });

        if (nonRepeatedTracks.length > 0) {
          usePlayerStore.getState().addMultipleToQueue(nonRepeatedTracks);
          toast.success(`envAIro añadió ${nonRepeatedTracks.length} canciones únicas al ambiente.`);
        } else if (foundTracks.length > 0) {
          toast.info(`envAIro omitió canciones sugeridas que ya habían sonado previamente.`);
        }
      }

      // Ejecutar el primer barrido de contenido explícito inmediatamente después de la generación
      if (useSettingsStore.getState().explicitFilter) {
        setTimeout(() => {
          autoSweepExplicitContent();
        }, 3000); // Pequeño delay para que la UI respire antes del barrido
      }

      return true;

    } catch (err) {
      console.error("Error en envAIro Selector:", err);
      // Revertir el uso si falló críticamente (para no gastar el cooldown)
      setEnairoCooldown(0, Math.max(0, currentUsageCount), today);
      toast.error('envAIro falló en la generación. Inténtalo de nuevo.');
      return false;
    } finally {
      setIsThinking(false);
    }
  };

  const autoReorderQueue = async (isInitial = false) => {
    // Solo ejecutamos si hay reproductor listo y no está pensando
    if (isThinking) return;

    if (!isInitial) {
      // 1. Validaciones de tiempo y uso diario para Auto Reorder (max 5)
      const today = await getSecureServerDateString();
      let currentAutoCount = useSettingsStore.getState().enairoAutoReorderCount || 0;
      const autoDate = useSettingsStore.getState().enairoAutoReorderDate || '';

      if (autoDate !== today) {
        useSettingsStore.getState().resetEnairoAutoReorderUsage();
        currentAutoCount = 0;
      }

      if (!useSettingsStore.getState().enairoTestMode && currentAutoCount >= 5) {
        console.warn('Límite de Auto Reordenamiento (5 al día) alcanzado. Esperando a mañana.');
        return; // Skip reorder
      }

      // Update usage (solo se actualiza el contador, la UI no bloquea pero esto previene spam)
      useSettingsStore.getState().setEnairoAutoReorderCount(currentAutoCount + 1, today);
    }

    setIsThinking(true);

    try {
      const state = usePlayerStore.getState();
      const currentQueue = state.queue;
      const history = state.playHistory;

      const settingsState = useSettingsStore.getState();

      const { data, error } = await supabase.functions.invoke('enairo-selector', {
        body: {
          action_mode: 'reorder',
          history: history.slice(0, 5),
          queue: currentQueue,
          settings: { 
            isInitialReorder: isInitial,
            enairoPrompt: settingsState.enairoPrompt,
            whitelistGenres: settingsState.whitelistGenres,
            blacklistGenres: settingsState.blacklistGenres,
            blacklistSongs: settingsState.blacklistSongs,
            blacklistArtists: settingsState.blacklistArtists
          }
        }
      });

      if (error) throw error;

      const { actions = [], reasoning, tracksToAdd = [] } = data;

      let removedCount = 0;

      if (actions.length > 0) {
        actions.forEach(action => {
          if (action.type === 'remove' && action.queueId) {
            state.removeFromQueue(action.queueId);
            removedCount++;
          } else if (action.type === 'reorder' && action.queueId && typeof action.newIndex === 'number') {
            const latestQueue = usePlayerStore.getState().queue;
            const oldIndex = latestQueue.findIndex(t => t.queueId === action.queueId);
            if (oldIndex !== -1 && oldIndex !== action.newIndex && action.newIndex < latestQueue.length) {
              state.reorderQueue(oldIndex, action.newIndex);
            }
          }
        });
      }

      // Procesar nuevas canciones de reemplazo
      if (tracksToAdd.length > 0) {
        let foundTracks = [];
        try {
          const { data: searchData, error: searchError } = await supabase.functions.invoke('search-spotify', {
            body: { queries: tracksToAdd, type: 'track', limit: 1, filterExplicit: useSettingsStore.getState().explicitFilter }
          });

          if (!searchError && searchData && searchData.results) {
            foundTracks = searchData.results.map((res) => {
              if (res && res.tracks && res.tracks.items && res.tracks.items.length > 0) {
                const spotifyTrack = res.tracks.items[0];
                return {
                  id: spotifyTrack.id,
                  name: spotifyTrack.name,
                  artists: spotifyTrack.artists.map(a => a.name).join(', '),
                  image: spotifyTrack.album?.images?.[0]?.url || '',
                  duration_ms: spotifyTrack.duration_ms,
                  uri: spotifyTrack.uri,
                  source: 'spotify',
                  addedBy: 'EnvAIro Selector'
                };
              }
              return null;
            }).filter(Boolean);
          }
        } catch (err) {
          console.error("Error buscando canciones de reemplazo:", err);
        }

        const currentHistory = usePlayerStore.getState().playHistory || [];
        const currentQueueState = usePlayerStore.getState().queue || [];

        const nonRepeatedTracks = foundTracks.filter(track => !isTrackAlreadyPlayedOrInQueue(track.name, track.artists, currentHistory, currentQueueState));
        nonRepeatedTracks.forEach(track => state.addToQueue(track));
      }

      if (removedCount > 0) {
        toast.success(`envAIro eliminó ${removedCount} peticiones fuera de vibra y añadió reemplazos perfectos.`);
      } else if (actions.length > 0 || tracksToAdd.length > 0) {
        toast.info(`envAIro ha ajustado la lista para mantener la mejor vibra.`);
      }

    } catch (err) {
      console.error("Error en envAIro Auto-Reorder:", err);
    } finally {
      setIsThinking(false);
      // Reseteamos banderas sin importar si tuvo éxito o falló
      usePlayerStore.getState().resetNewRequestsFlag();
      usePlayerStore.getState().resetPlaybackMinutes();
    }
  };

  const autoSweepExplicitContent = async () => {
    if (!explicitFilter) return;

    const today = await getSecureServerDateString();
    let currentSweepCount = enairoSweepCount || 0;
    
    if (enairoSweepDate !== today) {
      resetEnairoSweepUsage();
      currentSweepCount = 0;
    }

    if (currentSweepCount >= 5) return; // Máximo 5 barridos por día

    if (isThinking) return;
    setIsThinking(true);

    try {
      const state = usePlayerStore.getState();
      const currentQueue = state.queue;

      if (currentQueue.length === 0) return;

      const { data, error } = await supabase.functions.invoke('enairo-selector', {
        body: {
          action_mode: 'sweep_explicit',
          queue: currentQueue
        }
      });

      if (error) throw error;
      const { tracksToAdd = [], actions = [], reasoning } = data;

      if (actions.length > 0) {
        actions.forEach(action => {
          if (action.type === 'remove' && action.queueId) {
            state.removeFromQueue(action.queueId);
            toast.success(`Filtro de Contenido: envAIro eliminó una canción explícita de la cola.`);
          }
        });
      }

      // Si la IA nos mandó reemplazos limpios, los buscamos en Spotify y los agregamos
      if (tracksToAdd.length > 0) {
        let foundTracks = [];
        try {
          const { data: searchData, error: searchError } = await supabase.functions.invoke('search-spotify', {
            body: { queries: tracksToAdd, type: 'track', limit: 1, filterExplicit: useSettingsStore.getState().explicitFilter }
          });

          if (searchError) throw searchError;

          if (searchData && searchData.results) {
            foundTracks = searchData.results.map((res) => {
              if (res && res.tracks && res.tracks.items && res.tracks.items.length > 0) {
                const spotifyTrack = res.tracks.items[0];
                return {
                  id: spotifyTrack.id,
                  name: spotifyTrack.name,
                  artists: spotifyTrack.artists.map(a => a.name).join(', '),
                  image: spotifyTrack.album?.images?.[0]?.url || '',
                  duration_ms: spotifyTrack.duration_ms,
                  uri: spotifyTrack.uri,
                  source: 'spotify',
                  addedBy: 'Filtro envAIro'
                };
              }
              return null;
            }).filter(Boolean);
          }
        } catch (err) {
          console.error("Error buscando reemplazos limpios:", err);
        }

        const currentFullHistory = usePlayerStore.getState().playHistory || [];
        const currentQueueState = usePlayerStore.getState().queue || [];

        const nonRepeatedTracks = foundTracks.filter(track => {
          return !isTrackAlreadyPlayedOrInQueue(track.name, track.artists, currentFullHistory, currentQueueState);
        });

        nonRepeatedTracks.forEach(track => state.addToQueue(track));
        if (nonRepeatedTracks.length > 0) {
           toast.success(`Filtro de Contenido: envAIro añadió ${nonRepeatedTracks.length} canciones limpias en reemplazo.`);
        }
      }

      setEnairoSweepCount(currentSweepCount + 1, today);

    } catch (err) {
      console.error("Error en sweep_explicit:", err);
    } finally {
      setIsThinking(false);
    }
  };

  useEffect(() => {
    // Auto-reset daily usage if calendar date changed
    getSecureServerDateString().then((today) => {
      const settings = useSettingsStore.getState();
      if (settings.enairoLastUsedDate && settings.enairoLastUsedDate !== today) {
        settings.resetEnairoUsage();
      }
    }).catch(() => {});

    if (isEnairoTimerRunning) return;
    isEnairoTimerRunning = true;

    const interval = setInterval(() => {
      const state = usePlayerStore.getState();

      // Check date every minute to reset daily usage at midnight
      getSecureServerDateString().then((today) => {
        const settings = useSettingsStore.getState();
        if (settings.enairoLastUsedDate && settings.enairoLastUsedDate !== today) {
          settings.resetEnairoUsage();
        }
      }).catch(() => {});

      // Contar tiempo solo si está reproduciendo
      if (state.isPlaying) {
        state.incrementPlaybackMinutes();
      }

      // Chequeo cada minuto: si ya pasaron 40 min, reordenar sin importar si hay nuevas peticiones
      const currentMins = usePlayerStore.getState().playbackMinutes;

      if (currentMins >= 40 && !useSettingsStore.getState().enairoIsThinking) {
        // Ejecutamos el barrido explícito primero, y luego reordenamos
        if (useSettingsStore.getState().explicitFilter) {
          autoSweepExplicitContent().then(() => autoReorderQueue());
        } else {
          autoReorderQueue();
        }
      }

      // Chequeo de Auto-Ejecución cada 2 horas para envAIro Selector
      const settings = useSettingsStore.getState();
      if (settings.enairoAutoIntervalEnabled && !settings.enairoIsThinking) {
        getSecureServerTime().then(async (now) => {
          const today = await getSecureServerDateString();
          let currentUsageCount = settings.enairoUsageCount || 0;
          if (settings.enairoLastUsedDate !== today) {
            settings.resetEnairoUsage();
            currentUsageCount = 0;
          }

          // Si pasaron 2 horas desde el último trigger y aún no alcanza el límite de 3 usos diarios
          if (now >= (settings.enairoCooldownUntil || 0)) {
            if (currentUsageCount < 3) {
              toast.info(`⚡ Ejecutando envAIro Selector automáticamente (${currentUsageCount + 1}/3 de hoy)`, { icon: '🤖' });
              triggerEnairo();
            }
          }
        }).catch(() => {});
      }
    }, 60000);

    return () => {
      clearInterval(interval);
      isEnairoTimerRunning = false;
    };
  }, []);

  return { isThinking, triggerEnairo, autoReorderQueue, autoSweepExplicitContent };
}
