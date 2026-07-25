import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

export const usePlayerStore = create(
  persist(
    (set, get) => ({
      // Spotify Web Playback SDK
      player: null,
      deviceId: null,
      activeDeviceId: null,
      sdkReady: false,
      initialSyncDone: false,

      // YouTube Player
      youtubePlayer: null,
      playbackEngine: 'youtube', // 'spotify' | 'youtube'
      failedYouTubeIds: [],
      currentYtId: null,
      preloadWorkerRunning: false,

      // Playback state
      currentTrack: null,
      isPlaying: false,
      pendingResume: false,
      deviceTransferred: false,
      progress: 0,
      duration: 0,
      volume: 70,

      // envAIro
      queue: [],
      currentQueueIndex: -1,
      pendingRequests: [],
      playHistory: [],
      requestHistory: [],
      lastCommandTs: 0,
      historyTimer: null,

      hasNewRequestsSinceReorder: false,
      resetNewRequestsFlag: () => set({ hasNewRequestsSinceReorder: false }),
      playbackMinutes: 0,
      incrementPlaybackMinutes: () => set((state) => ({ playbackMinutes: state.playbackMinutes + 1 })),
      resetPlaybackMinutes: () => set({ playbackMinutes: 0 }),

      clearPlayerState: () => set({
        queue: [],
        playHistory: [],
        pendingRequests: [],
        requestHistory: [],
        currentTrack: null,
        isPlaying: false,
        progress: 0,
        duration: 0,
        currentQueueIndex: -1,
        failedYouTubeIds: [],
        currentYtId: null
      }),

      // ── SDK ──────────────────────────────────────────────────────────────
      setPlayer: (player) => set({ player }),
      setYoutubePlayer: (youtubePlayer) => set({ youtubePlayer }),
      setPlaybackEngine: (playbackEngine) => set((state) => {
        if (state.playbackEngine && state.playbackEngine !== playbackEngine) {
          return { playbackEngine, queue: [], currentQueueIndex: -1, currentTrack: null, playHistory: [], failedYouTubeIds: [] };
        }
        return { playbackEngine };
      }),
      addFailedYouTubeId: (id) => {
        set((state) => {
          if (!state.failedYouTubeIds.includes(id)) {
            // Guardar localmente
            const newIds = [...state.failedYouTubeIds, id];

            // Subir a la base de datos global (fire and forget)
            supabase.from('youtube_blocked_videos')
              .insert({ video_id: id })
              .then(({ error }) => {
                if (error && error.code !== '23505') { // Ignorar error 23505 (unique violation)
                  console.warn('Error saving global blocked YouTube ID:', error.message);
                }
              });

            return { failedYouTubeIds: newIds };
          }
          return state;
        });
      },
      fetchGlobalBlockedYouTubeIds: async () => {
        try {
          const { data, error } = await supabase
            .from('youtube_blocked_videos')
            .select('video_id');

          if (error) {
            console.warn('Error fetching global blocked YouTube IDs:', error.message);
            return;
          }

          if (data && data.length > 0) {
            set((state) => {
              const globalIds = data.map(row => row.video_id);
              // Unir con los locales sin duplicados
              const merged = Array.from(new Set([...state.failedYouTubeIds, ...globalIds]));
              return { failedYouTubeIds: merged };
            });
          }
        } catch (err) {
          console.warn('Global blocked YouTube IDs fetch failed:', err);
        }
      },
      setDeviceId: (deviceId) => set({ deviceId }),
      setActiveDeviceId: (activeDeviceId) => set({ activeDeviceId }),
      setSdkReady: (sdkReady) => set({ sdkReady }),
      setInitialSyncDone: (initialSyncDone) => set({ initialSyncDone }),
      setLastCommandTs: (ts) => set({ lastCommandTs: ts }),

      // ── Playback ─────────────────────────────────────────────────────────
      setCurrentTrack: (track) => set({ currentTrack: track }),
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      setPendingResume: (pendingResume) => set({ pendingResume }),
      setDeviceTransferred: (deviceTransferred) => set({ deviceTransferred }),
      setProgress: (progress) => set({ progress }),
      setDuration: (duration) => set({ duration }),
      setVolume: (volume) => set({ volume }),

      // ── Queue ─────────────────────────────────────────────────────────────
      setQueue: (tracks) => {
        set({
          queue: tracks.map((t, i) => ({ ...t, queueId: `${t.id}-${Date.now()}-${i}` })),
          currentQueueIndex: -1
        });
        get().startQueuePreloadWorker();
      },

      addToQueue: (track) => {
        set((state) => {
          const newTrack = { ...track, queueId: `${track.id}-${Date.now()}` };

          const newQueue = [...state.queue];
          let insertIndex = newQueue.length;

          if (state.currentQueueIndex >= 0) {
            insertIndex = Math.min(newQueue.length, state.currentQueueIndex + 15);
          }

          newQueue.splice(insertIndex, 0, newTrack);

          return {
            queue: newQueue,
            hasNewRequestsSinceReorder: true
          };
        });
        get().startQueuePreloadWorker();

        // Si el reproductor está completamente vacío (cola acabada y nada sonando), iniciar auto-reproducción
        const stateAfter = get();
        if (!stateAfter.currentTrack && stateAfter.queue.length > 0 && stateAfter.currentQueueIndex < stateAfter.queue.length - 1) {
          const nextTrack = stateAfter.shiftQueue();
          if (nextTrack) {
            stateAfter.playEngineTrack(nextTrack);
          }
        }
      },

      removeFromQueue: (queueId) => {
        set((state) => {
          const index = state.queue.findIndex((t) => t.queueId === queueId);
          if (index === -1) return state;

          let updatedIndex = state.currentQueueIndex;
          if (index < state.currentQueueIndex) {
            updatedIndex--;
          } else if (index === state.currentQueueIndex) {
            updatedIndex--;
          }

          return {
            queue: state.queue.filter((t) => t.queueId !== queueId),
            currentQueueIndex: updatedIndex
          };
        });
        get().startQueuePreloadWorker();
      },

      clearQueue: () =>
        set(() => {
          return {
            queue: [],
            currentQueueIndex: -1
          };
        }),

      reorderQueue: (oldIndex, newIndex) => {
        set((state) => {
          const q = [...state.queue];
          const [removed] = q.splice(oldIndex, 1);
          q.splice(newIndex, 0, removed);

          let updatedIndex = state.currentQueueIndex;
          if (oldIndex === state.currentQueueIndex) {
            updatedIndex = newIndex;
          } else if (oldIndex < state.currentQueueIndex && newIndex >= state.currentQueueIndex) {
            updatedIndex--;
          } else if (oldIndex > state.currentQueueIndex && newIndex <= state.currentQueueIndex) {
            updatedIndex++;
          }

          return { queue: q, currentQueueIndex: updatedIndex };
        });
        get().startQueuePreloadWorker();
      },

      shiftQueue: () => {
        const state = get();
        let nextIndex = state.currentQueueIndex + 1;
        let newQueue = [...state.queue];

        if (nextIndex >= 10) {
          newQueue.splice(0, 5);
          nextIndex -= 5;
        }

        const next = newQueue[nextIndex];
        if (next) {
          set({ currentQueueIndex: nextIndex, currentTrack: next, queue: newQueue });
          return next;
        }
        return null;
      },

      prevQueue: () => {
        const state = get();
        const prevIndex = state.currentQueueIndex - 1;
        const prev = state.queue[prevIndex];
        if (prev) {
          set({ currentQueueIndex: prevIndex, currentTrack: prev });
          return prev;
        }
        return null;
      },

      playTrackFromQueue: (queueId) => {
        const state = get();
        let index = state.queue.findIndex(t => t.queueId === queueId);
        let newQueue = [...state.queue];

        if (index >= 10) {
          newQueue.splice(0, 5);
          index -= 5;
        }

        if (index !== -1) {
          set({ currentQueueIndex: index, currentTrack: newQueue[index], queue: newQueue });
          return newQueue[index];
        }
        return null;
      },

      // Extrae la lógica de resolución/búsqueda de IDs de YouTube
      resolveYouTubeVideoId: async (track, forceMode = null) => {
        if (!track) return null;
        let videoIdToPlay = track.id;

        const { useSettingsStore } = await import('./useSettingsStore');
        const { karaokeEnabled, lyricsEnabled } = useSettingsStore.getState();
        const mode = forceMode ?? (karaokeEnabled ? 'karaoke' : lyricsEnabled ? 'lyrics' : 'normal');
        const querySuffix = mode === 'karaoke' ? 'KARAOKE ORIGINAL WITH LYRICS NO COPYRIGHT'
          : mode === 'lyrics' ? 'LYRICS NO COPYRIGHT'
            : null;

        const isSpotifyTrack = track.source === 'spotify' || (track.uri && track.uri.startsWith('spotify:')) || (track.id && track.id.length !== 11);
        const needsSearch = querySuffix !== null || isSpotifyTrack;

        if (needsSearch) {
          const effectiveSuffix = querySuffix ?? 'VIDEO OFICIAL';
          const cacheKey = mode ? `yt_bridge_${track.id}_${mode}` : null;
          const cachedId = cacheKey ? localStorage.getItem(cacheKey) : null;

          if (cachedId && cachedId !== 'undefined' && cachedId !== 'null' && cachedId.length >= 11 && !get().failedYouTubeIds.includes(cachedId)) {
            videoIdToPlay = cachedId;
          } else {
            if (cachedId && cacheKey && get().failedYouTubeIds.includes(cachedId)) {
              localStorage.removeItem(cacheKey);
            }
            try {
              const { searchYouTubeVideos } = await import('../lib/youtubeApi');
              const cleanName = (track.name || '')
                .replace(/\(?(video oficial|official video|official music video|music video|lyric video|official lyric video|letra oficial|en vivo|live|hd|4k)\)?/gi, '')
                .replace(/[-–]\s*$/, '').trim();
              const allArtists = (track.artists || '').replace(/,/g, '');
              const firstArtist = (track.artists || '').split(',')[0].trim();

              const nameStartsWithArtist = cleanName.toLowerCase().startsWith(firstArtist.toLowerCase());
              const queryBase = nameStartsWithArtist ? cleanName : `${allArtists} ${cleanName}`;
              const query = `${queryBase} ${effectiveSuffix}`;
              let results = await searchYouTubeVideos(query, 5);

              if ((!results || results.length === 0) && querySuffix) {
                const relaxedQuery = `${queryBase} AUDIO`;
                results = await searchYouTubeVideos(relaxedQuery, 5);
              }

              if (results && results.length > 0) {
                let unblocked = results.filter(r => !get().failedYouTubeIds.includes(r.id));
                const blockedCount = results.length - unblocked.length;

                if (blockedCount >= 3 && mode === 'normal') {
                  const fallbackQuery = `${queryBase} AUDIO OFICIAL NO COPYRIGHT`;
                  const fallbackResults = await searchYouTubeVideos(fallbackQuery, 5);
                  if (fallbackResults && fallbackResults.length > 0) {
                    const fallbackUnblocked = fallbackResults.filter(r => !get().failedYouTubeIds.includes(r.id));
                    if (fallbackUnblocked.length > 0) {
                      unblocked = fallbackUnblocked;
                    }
                  }
                }

                if (unblocked.length > 0) {
                  let validResults = unblocked;
                  if (mode === 'karaoke' || mode === 'lyrics') {
                    validResults = unblocked.filter(r => {
                      const t = (r.name || '').toLowerCase();
                      if (mode === 'karaoke') return t.includes('karaoke') || t.includes('instrumental') || t.includes('pista');
                      if (mode === 'lyrics') return t.includes('lyric') || t.includes('letra') || t.includes('karaoke');
                      return true;
                    });
                  }

                  if (validResults.length > 0) {
                    videoIdToPlay = validResults[0].id;
                  } else {
                    videoIdToPlay = unblocked[0].id;
                  }

                  if (cacheKey) localStorage.setItem(cacheKey, videoIdToPlay);
                } else {
                  videoIdToPlay = null;
                }
              } else {
                if (track.id && track.id.length === 11 && track.source !== 'spotify') {
                  videoIdToPlay = track.id;
                } else {
                  videoIdToPlay = null;
                }
              }
            } catch (err) {
              console.error('Error in YouTube bridge:', err);
              if (track.id && track.id.length === 11 && track.source !== 'spotify') {
                videoIdToPlay = track.id;
              } else {
                videoIdToPlay = null;
              }
            }
          }
        }

        return { videoIdToPlay, isSpotifyTrack };
      },

      // Worker en segundo plano para precargar IDs de toda la cola
      startQueuePreloadWorker: async () => {
        const state = get();
        // Si ya está corriendo o no estamos en YouTube, abortar
        if (state.preloadWorkerRunning || state.playbackEngine !== 'youtube') return;

        set({ preloadWorkerRunning: true });

        try {
          const { useSettingsStore } = await import('./useSettingsStore');
          const { karaokeEnabled, lyricsEnabled } = useSettingsStore.getState();
          const mode = karaokeEnabled ? 'karaoke' : lyricsEnabled ? 'lyrics' : 'normal';

          // Recorrer la cola desde la canción siguiente (máximo 5 pistas adelantadas para ahorrar cuota de API)
          const startIndex = get().currentQueueIndex + 1;
          const endIndex = Math.min(get().queue.length, startIndex + 5);

          for (let i = startIndex; i < endIndex; i++) {
            // Es posible que el motor cambie o la cola se limpie durante el proceso
            if (get().playbackEngine !== 'youtube' || !get().queue[i]) break;

            const track = get().queue[i];
            const isSpotifyTrack = track.source === 'spotify' || (track.uri && track.uri.startsWith('spotify:')) || (track.id && track.id.length !== 11);

            if (isSpotifyTrack) {
              const cacheKey = `yt_bridge_${track.id}_${mode}`;
              const cachedId = localStorage.getItem(cacheKey);

              // Si no está en caché o falló, resolverlo
              if (!cachedId || cachedId === 'undefined' || cachedId === 'null' || get().failedYouTubeIds.includes(cachedId)) {
                await get().resolveYouTubeVideoId(track);
                // Esperar 1 segundo entre búsquedas para no saturar la red o ser bloqueados por YouTube (429)
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }
        } catch (error) {
          console.error("Error in queue preload worker:", error);
        } finally {
          set({ preloadWorkerRunning: false });
        }
      },

      playEngineTrack: async (track, progressMs = 0, forceMode = null, autoplay = true) => {
        if (!track) return;
        get().queueAddToHistory(track);
        const state = get();
        if (state.playbackEngine === 'youtube') {
          if (state.youtubePlayer && track.id) {
            // (No llamamos stopVideo() aquí para permitir que useYouTubeSDK haga el crossfade de doble búfer)
            // Solo pausamos el estado si no estamos reproduciendo, pero la transición maneja esto internamente.

            const { videoIdToPlay, isSpotifyTrack } = await get().resolveYouTubeVideoId(track, forceMode);

            // Validar estrictamente el ID antes de enviarlo al reproductor (YouTube requiere EXACTAMENTE 11 caracteres)
            if (!videoIdToPlay || videoIdToPlay === 'undefined' || videoIdToPlay === 'null' || videoIdToPlay.length !== 11 || (videoIdToPlay === track.id && isSpotifyTrack) || (track.source === 'youtube' && get().failedYouTubeIds.includes(track.id))) {
              import('sonner').then(({ toast }) => toast.error('No se pudo encontrar un video válido para esta canción. Saltando...'));
              await new Promise(r => setTimeout(r, 1000));
              const nextTrack = get().shiftQueue();
              if (nextTrack) {
                get().playEngineTrack(nextTrack);
              } else {
                set({ currentTrack: null, isPlaying: false });
              }
              return; // Abortar
            }

            // Cargar el nuevo video
            if (videoIdToPlay && videoIdToPlay !== 'null' && videoIdToPlay !== 'undefined' && videoIdToPlay.length === 11) {
              set({ currentYtId: videoIdToPlay });
              const startSeconds = (typeof progressMs === 'number' && !isNaN(progressMs)) ? Math.max(0, progressMs / 1000) : 0;
              if (autoplay) {
                 state.youtubePlayer?.loadVideoById({ videoId: videoIdToPlay, startSeconds: startSeconds });
              } else {
                 state.youtubePlayer?.cueVideoById({ videoId: videoIdToPlay, startSeconds: startSeconds });
              }
            } else {
              import('sonner').then(({ toast }) => toast.error('No se pudo encontrar video de respaldo. Saltando...'));
              await new Promise(r => setTimeout(r, 1000));
              const nextTrack = get().shiftQueue();
              if (nextTrack) {
                get().playEngineTrack(nextTrack);
              } else {
                set({ currentTrack: null, isPlaying: false });
              }
            }// Precarga de Búfer: Buscar silenciosamente los otros modos para que la transición sea instantánea
            try {
              const { useSettingsStore } = await import('./useSettingsStore');
              const { karaokeEnabled, lyricsEnabled } = useSettingsStore.getState();
              const currentMode = forceMode || (karaokeEnabled ? 'karaoke' : lyricsEnabled ? 'lyrics' : 'normal');

              const modesToCache = ['normal', 'karaoke', 'lyrics'].filter(m => m !== currentMode);
              modesToCache.forEach(m => {
                get().resolveYouTubeVideoId(track, m).catch(() => { });
              });
            } catch (e) {
              console.error('Error starting preload for alternate modes:', e);
            }
          }
        }
      },

      // ── History ──────────────────────────────────────────────────────────
      queueAddToHistory: (track) => {
        if (get().historyTimer) clearTimeout(get().historyTimer);
        const timer = setTimeout(() => {
          const currentState = get();
          // Solo agregar al historial si después de 10s la canción sigue siendo la misma
          if (currentState.currentTrack?.id === track.id) {
            currentState.addToHistory(track);
          }
        }, 10000); // Esperar 10 segundos antes de guardar
        set({ historyTimer: timer });
      },

      addToHistory: (track) => set((state) => {
        const lastTrack = state.playHistory[0];
        // Evitar duplicados consecutivos
        if (lastTrack && lastTrack.id === track.id) return state;
        return {
          playHistory: [{ ...track, playedAt: new Date().toISOString() }, ...state.playHistory].slice(0, 1000)
        };
      }),

      // ── Pending requests ─────────────────────────────────────────────────
      cleanupOldRequests: () => set((state) => {
        const now = Date.now();
        const threeHours = 3 * 60 * 60 * 1000;
        return {
          pendingRequests: state.pendingRequests.filter(req => (now - new Date(req.timestamp).getTime()) < threeHours)
        };
      }),

      addPendingRequest: (req) =>
        set((state) => {
          const newReq = {
            ...req,
            reqId: req.reqId || `req-${Date.now()}`,
            timestamp: req.timestamp || new Date().toISOString(),
            status: req.status || 'pending'
          };
          return {
            pendingRequests: [newReq, ...state.pendingRequests],
            requestHistory: [newReq, ...(state.requestHistory || [])].slice(0, 500)
          };
        }),

      removePendingRequest: (reqId) =>
        set((state) => ({
          pendingRequests: state.pendingRequests.filter((r) => r.reqId !== reqId)
        })),

      approveRequest: (reqId) =>
        set((state) => {
          const req = state.pendingRequests.find((r) => r.reqId === reqId);
          if (!req) return {};

          const newTrack = {
            ...req.track,
            queueId: `${req.track.id}-${Date.now()}`,
            requestedBy: req.requester,
            requestedAt: req.timestamp,
            reqId: req.reqId
          };

          const newQueue = [...state.queue];
          let insertIndex = newQueue.length;

          if (state.currentQueueIndex >= 0) {
            insertIndex = Math.min(newQueue.length, state.currentQueueIndex + 15);
          }

          newQueue.splice(insertIndex, 0, newTrack);

          return {
            pendingRequests: state.pendingRequests.filter((r) => r.reqId !== reqId),
            queue: newQueue,
            requestHistory: state.requestHistory.map(r => r.reqId === reqId ? { ...r, status: 'approved' } : r)
          };
        }),

      rejectRequest: (reqId) =>
        set((state) => ({
          pendingRequests: state.pendingRequests.filter((r) => r.reqId !== reqId),
          requestHistory: state.requestHistory.map(r => r.reqId === reqId ? { ...r, status: 'rejected' } : r)
        })),
    }),
    {
      name: 'bq-player',
      partialize: (state) => ({
        playbackEngine: state.playbackEngine,
        queue: state.queue,
        currentQueueIndex: state.currentQueueIndex,
        volume: state.volume,
        playHistory: state.playHistory,
        pendingRequests: state.pendingRequests,
        requestHistory: state.requestHistory,
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
        progress: state.progress,
        lastCommandTs: state.lastCommandTs,
      }),
    }
  )
);
