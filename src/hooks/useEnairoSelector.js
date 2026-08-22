import { useState, useEffect } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { supabase } from '../lib/supabase';
import { getSecureServerTime, getSecureServerDateString } from '../utils/timeUtils';
import { sanitizePrompt } from '../utils/security';
import { toast } from 'sonner';

let isEnairoTimerRunning = false;

function cleanTrackName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s*\([^)]*(?:remix|mix|feat|ft|official|video|audio|version|edit|extended|live|radio)[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*(?:remix|mix|feat|ft|official|video|audio|version|edit|extended|live|radio)[^\]]*\]/gi, "")
    .replace(/[^a-z0-9\s]/g, "") // Remove punctuation
    .trim();
}

function isTrackAlreadyPlayedOrInQueue(trackName, artistName, history = [], currentQueue = []) {
  if (!trackName) return false;
  const cleanName = cleanTrackName(trackName);
  const normArtist = (artistName || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();

  const isPlayed = history.some(h => {
    const hCleanName = cleanTrackName(h.name);
    const hArtist = (typeof h.artists === 'string' ? h.artists : (h.artists || []).map(a => a.name || a).join(', ')).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
    if (hCleanName === cleanName || (cleanName.length > 4 && hCleanName.includes(cleanName)) || (hCleanName.length > 4 && cleanName.includes(hCleanName))) {
      if (!normArtist || !hArtist) return true;
      return hArtist.includes(normArtist) || normArtist.includes(hArtist);
    }
    return false;
  });

  if (isPlayed) return true;

  const isInQueue = currentQueue.some(q => {
    const qCleanName = cleanTrackName(q.name);
    const qArtist = (typeof q.artists === 'string' ? q.artists : (q.artists || []).map(a => a.name || a).join(', ')).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
    if (qCleanName === cleanName || (cleanName.length > 4 && qCleanName.includes(cleanName)) || (qCleanName.length > 4 && cleanName.includes(qCleanName))) {
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
    explicitFilter
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

    // Filtrar el historial de las últimas 24 horas (evita fallos por cambio de zona horaria UTC)
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    const sessionPlayHistory = (playHistory || []).filter(track => {
      if (!track.playedAt) return true;
      try {
        const trackTime = new Date(track.playedAt).getTime();
        return !isNaN(trackTime) ? trackTime >= twentyFourHoursAgo : true;
      } catch {
        return true;
      }
    });

    const playedSongNames = sessionPlayHistory.map(t => `${t.name} - ${typeof t.artists === 'string' ? t.artists : (t.artists || []).map(a => a.name || a).join(', ')}`);
    const combinedBlacklistSongs = Array.from(new Set([...(blacklistSongs || []), ...playedSongNames]));

    // 2. Extraer métricas de peticiones de invitados APROBADAS (alineado con la página de Métricas)
    const playerStoreState = usePlayerStore.getState();
    const includeGuestMetrics = useSettingsStore.getState().enairoIncludeGuestMetrics !== false;
    let guestMetrics = null;

    if (includeGuestMetrics) {
      const allApprovedRequests = (playerStoreState.requestHistory || []).filter(req => {
        if (!req || req.status !== 'approved' || !req.track) return false;
        if (req.requester === 'envAIro Selector' || req.requester === 'Dashboard') return false;
        return true;
      });

      if (allApprovedRequests.length > 0) {
        const artistCounts = {};
        const approvedSongs = [];

        allApprovedRequests.forEach(req => {
          const track = req.track;
          const artist = (track.artists || '').split(',')[0].trim();
          if (artist) {
            artistCounts[artist] = (artistCounts[artist] || 0) + 1;
          }
          approvedSongs.push(`${track.name} - ${track.artists}`);
        });

        const topApprovedArtists = Object.entries(artistCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([artist, count]) => `${artist} (${count} peticiones aprobadas)`);

        guestMetrics = {
          totalApprovedRequests: allApprovedRequests.length,
          topApprovedArtists,
          approvedSongsSample: Array.from(new Set(approvedSongs)).slice(0, 20)
        };
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke('enairo-selector', {
        body: {
          action_mode: 'generate',
          history: sessionPlayHistory.slice(0, 30),
          playedHistory: playedSongNames.slice(0, 50),
          queue: queue,
          guestMetrics: guestMetrics,
          settings: {
            enairoPrompt: sanitizePrompt(enairoPrompt),
            whitelistGenres,
            blacklistGenres,
            blacklistSongs: combinedBlacklistSongs,
            blacklistArtists,
            trackCount: enairoTrackCount,
            explicitFilter: useSettingsStore.getState().explicitFilter
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

        const currentQueueState = usePlayerStore.getState().queue || [];

        const nonRepeatedTracks = foundTracks.filter(track => {
          const isDuplicate = isTrackAlreadyPlayedOrInQueue(track.name, track.artists, sessionPlayHistory, currentQueueState);
          return !isDuplicate;
        });

        // Asegurar entregar exactamente la cantidad solicitada por el usuario
        const finalTracks = nonRepeatedTracks.slice(0, enairoTrackCount || 35);

        if (finalTracks.length > 0) {
          usePlayerStore.getState().addMultipleToQueue(finalTracks);
          toast.success(`envAIro añadió ${finalTracks.length} canciones únicas al ambiente.`);
        } else if (foundTracks.length > 0) {
          toast.info(`envAIro omitió canciones sugeridas que ya habían sonado previamente.`);
        }
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
    if (isThinking) return false;

    const state = usePlayerStore.getState();
    const currentQueue = state.queue || [];
    const currentQueueIndex = typeof state.currentQueueIndex === 'number' ? state.currentQueueIndex : -1;

    // Solo enviamos las canciones por sonar (inmunidad total a la canción actual y pasadas)
    const upcomingQueue = currentQueue.slice(currentQueueIndex + 1);

    if (upcomingQueue.length < 3) {
      if (!isInitial) {
        toast.info('Se necesitan al menos 3 canciones en la lista para armonizar el orden.');
      }
      return false;
    }

    const now = await getSecureServerTime();
    const today = await getSecureServerDateString();
    const settingsState = useSettingsStore.getState();

    // 1. Validaciones de tiempo y uso diario para Auto Reorder (max 5)
    let currentAutoCount = settingsState.enairoAutoReorderCount || 0;
    const autoDate = settingsState.enairoAutoReorderDate || '';

    if (autoDate !== today) {
      settingsState.resetEnairoAutoReorderUsage();
      currentAutoCount = 0;
    }

    if (!settingsState.enairoTestMode && currentAutoCount >= 5) {
      toast.error('Límite de armonización diaria alcanzado (5/5). Vuelve mañana.', { icon: '🚫' });
      return false;
    }

    // Cooldown de 5 minutos entre ejecuciones manuales (300000 ms)
    if (!isInitial && !settingsState.enairoTestMode && now < (settingsState.enairoReorderCooldownUntil || 0)) {
      const secondsLeft = Math.ceil((settingsState.enairoReorderCooldownUntil - now) / 1000);
      const mins = Math.floor(secondsLeft / 60);
      const secs = secondsLeft % 60;
      toast.info(`Espera un momento antes de volver a armonizar (${mins}:${String(secs).padStart(2, '0')}).`, { icon: '⏳' });
      return false;
    }

    setIsThinking(true);

    try {
      const history = state.playHistory || [];
      const { data, error } = await supabase.functions.invoke('enairo-selector', {
        body: {
          action_mode: 'reorder',
          history: history.slice(0, 5),
          queue: upcomingQueue,
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
            // Protección de peticiones del público: NUNCA eliminar canciones pedidas por invitados
            const targetTrack = currentQueue.find(t => t.queueId === action.queueId);
            if (targetTrack && !targetTrack.requestedBy) {
              state.removeFromQueue(action.queueId);
              removedCount++;
            }
          } else if (action.type === 'reorder' && action.queueId && typeof action.newIndex === 'number') {
            const latestQueue = usePlayerStore.getState().queue;
            const oldIndex = latestQueue.findIndex(t => t.queueId === action.queueId);
            // El nuevo índice es relativo a la parte upcoming
            const targetIndex = (currentQueueIndex + 1) + action.newIndex;
            if (oldIndex > currentQueueIndex && targetIndex > currentQueueIndex && targetIndex < latestQueue.length && oldIndex !== targetIndex) {
              state.reorderQueue(oldIndex, targetIndex);
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

      // Actualizar contador y cooldown
      const REORDER_COOLDOWN_MS = settingsState.enairoTestMode ? 15000 : 5 * 60 * 1000; // 15s test, 5min real
      settingsState.setEnairoAutoReorderCount(currentAutoCount + 1, today);
      settingsState.setEnairoReorderCooldownUntil(now + REORDER_COOLDOWN_MS);

      if (removedCount > 0) {
        toast.success(`envAIro ajustó el orden y reemplazó ${removedCount} canciones fuera de vibra.`);
      } else {
        toast.success(`envAIro armonizó la cola para obtener las mejores transiciones.`, { icon: '✨' });
      }

      return true;

    } catch (err) {
      console.error("Error en envAIro Auto-Reorder:", err);
      toast.error('No se pudo armonizar la cola en este momento.');
      return false;
    } finally {
      setIsThinking(false);
      // Reseteamos banderas sin importar si tuvo éxito o falló
      usePlayerStore.getState().resetNewRequestsFlag();
      usePlayerStore.getState().resetPlaybackMinutes();
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

      // Chequeo cada minuto: si la auto-armonización está activa y pasaron los minutos configurados, reordenar
      const settings = useSettingsStore.getState();
      const currentMins = usePlayerStore.getState().playbackMinutes;
      const targetInterval = settings.enairoAutoReorderIntervalMinutes || 45;

      if (settings.enairoAutoReorderEnabled && currentMins >= targetInterval && !settings.enairoIsThinking) {
        autoReorderQueue(true);
      }

      // Chequeo de Auto-Ejecución cada 2 horas para envAIro Selector
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

  return { isThinking, triggerEnairo, autoReorderQueue };
}
