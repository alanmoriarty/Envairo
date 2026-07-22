import { useState, useEffect } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { supabase } from '../lib/supabase';
import { getSecureServerTime, getSecureServerDateString } from '../utils/timeUtils';
import { toast } from 'sonner';

let isEnairoTimerRunning = false;

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

    try {
      const { data, error } = await supabase.functions.invoke('enairo-selector', {
        body: {
          action_mode: 'generate',
          history: playHistory.slice(0, 5), // últimas 5 canciones
          queue: queue,
          settings: {
            enairoPrompt,
            whitelistGenres,
            blacklistGenres,
            blacklistSongs,
            blacklistArtists,
            trackCount: enairoTrackCount
          }
        }
      });

      if (error) throw error;

      const { tracksToAdd = [], actions = [], reasoning } = data;

      if (reasoning) {
        console.log("EnvAIro Selector Reasoning:", reasoning);
      }

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
            body: { queries: tracksToAdd, type: 'track', limit: 1 }
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

        foundTracks.forEach(track => addToQueue(track));

        toast.success(`EnvAIro añadió ${foundTracks.length} canciones al ambiente.`);
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

      const { data, error } = await supabase.functions.invoke('enairo-selector', {
        body: {
          action_mode: 'reorder',
          history: history.slice(0, 5),
          queue: currentQueue,
          settings: { isInitialReorder: isInitial } // Mandamos el flag de primer reorden
        }
      });

      if (error) throw error;

      const { actions = [], reasoning } = data;

      if (reasoning) {
        console.log("envAIro Auto-Reorder Reasoning:", reasoning);
      }

      if (actions.length > 0) {
        actions.forEach(action => {
          if (action.type === 'remove' && action.queueId) {
            state.removeFromQueue(action.queueId);
            toast.success(`envAIro eliminó una petición que no encajaba con el ambiente.`);
          } else if (action.type === 'reorder' && action.queueId && typeof action.newIndex === 'number') {
            const latestQueue = usePlayerStore.getState().queue;
            const oldIndex = latestQueue.findIndex(t => t.queueId === action.queueId);
            if (oldIndex !== -1 && oldIndex !== action.newIndex && action.newIndex < latestQueue.length) {
              state.reorderQueue(oldIndex, action.newIndex);
            }
          }
        });
        toast.info(`envAIro ha reordenado la lista para mejorar las transiciones.`);
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

      if (reasoning) {
        console.log("envAIro Sweep Reasoning:", reasoning);
      }

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
            body: { queries: tracksToAdd, type: 'track', limit: 1 }
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

        foundTracks.forEach(track => state.addToQueue(track));
        if (foundTracks.length > 0) {
           toast.success(`Filtro de Contenido: envAIro añadió ${foundTracks.length} canciones limpias en reemplazo.`);
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
    if (isEnairoTimerRunning) return;
    isEnairoTimerRunning = true;

    const interval = setInterval(() => {
      const state = usePlayerStore.getState();

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
    }, 60000);

    return () => {
      clearInterval(interval);
      isEnairoTimerRunning = false;
    };
  }, []);

  return { isThinking, triggerEnairo, autoReorderQueue, autoSweepExplicitContent };
}
