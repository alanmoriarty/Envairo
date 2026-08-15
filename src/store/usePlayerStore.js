import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from './useSettingsStore';

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
      activeTransition: null, // { type: 'brake' | 'fade' | 'cut' | 'echo' | 'start', label: string } | null
      setActiveTransition: (t) => set({ activeTransition: t }),
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

      // Anti-spam para saltar canciones
      skipHistory: [],
      skipCooldownUntil: null,

      checkSkipSpam: () => {
        const state = get();
        const now = Date.now();

        if (state.skipCooldownUntil && now < state.skipCooldownUntil) {
          const remainingMinutes = Math.ceil((state.skipCooldownUntil - now) / 60000);
          import('sonner').then(({ toast }) => toast.error(`Límite de saltos excedido. Espera ${remainingMinutes} min.`));
          return false;
        }

        const recentSkips = state.skipHistory.filter(t => now - t < 5 * 60 * 1000);

        if (recentSkips.length >= 5) {
          set({ skipCooldownUntil: now + 10 * 60 * 1000, skipHistory: [] });
          import('sonner').then(({ toast }) => toast.error(`Has saltado demasiadas canciones. Bloqueo de 10 minutos activado.`));
          return false;
        }

        set({ skipHistory: [...recentSkips, now] });
        return true;
      },

      clearPlayerState: () => {
        const state = get();
        if (state.youtubePlayer) {
          state.youtubePlayer.stopVideo();
        }
        set({
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
        });
      },

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

      addMultipleToQueue: (tracks) => {
        if (!Array.isArray(tracks) || tracks.length === 0) return;

        set((state) => {
          const newTracks = tracks.map((t, idx) => ({
            ...t,
            queueId: `${t.id}-${Date.now()}-${idx}`
          }));

          const newQueue = [...state.queue];
          let insertIndex = newQueue.length;

          if (state.currentQueueIndex >= 0) {
            insertIndex = Math.min(newQueue.length, state.currentQueueIndex + 15);
          }

          newQueue.splice(insertIndex, 0, ...newTracks);

          return {
            queue: newQueue,
            hasNewRequestsSinceReorder: true
          };
        });

        get().startQueuePreloadWorker();

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

      clearQueue: () => {
        const state = get();
        if (state.youtubePlayer) {
          state.youtubePlayer.stopVideo();
        }
        set(() => {
          return {
            queue: [],
            currentQueueIndex: -1,
            currentTrack: null,
            isPlaying: false
          };
        });
      },

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
        // Priority: 1) explicit forceMode, 2) guest's per-request preference, 3) host global setting
        const mode = forceMode ?? track.version_preference ?? (karaokeEnabled ? 'karaoke' : lyricsEnabled ? 'lyrics' : 'normal');
        const querySuffix = mode === 'karaoke' ? 'KARAOKE ORIGINAL WITH LYRICS LETRA NO COPYRIGHT'
          : mode === 'lyrics' ? 'LETRA LYRICS NO COPYRIGHT'
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
              // Fetch up to 12 results (increased from 5) to maximize chances of finding unblocked embedding-enabled videos
              let results = await searchYouTubeVideos(query, 12);

              if ((!results || results.length === 0) && querySuffix) {
                const relaxedQuery = `${queryBase} LETRA LYRICS`;
                results = await searchYouTubeVideos(relaxedQuery, 12);
              }

              if (results && results.length > 0) {
                let unblocked = results.filter(r => !get().failedYouTubeIds.includes(r.id));
                const blockedCount = results.length - unblocked.length;

                if (blockedCount >= 3 && mode === 'normal') {
                  const fallbackQuery = `${queryBase} AUDIO OFICIAL NO COPYRIGHT`;
                  const fallbackResults = await searchYouTubeVideos(fallbackQuery, 12);
                  if (fallbackResults && fallbackResults.length > 0) {
                    const fallbackUnblocked = fallbackResults.filter(r => !get().failedYouTubeIds.includes(r.id));
                    if (fallbackUnblocked.length > 0) {
                      unblocked = fallbackUnblocked;
                    }
                  }
                }

                if (unblocked.length > 0) {
                  const BAD_VIDEO_KEYWORDS = [
                    'entrevista', 'interview', 'podcast', 'reaction', 'reaccion', 'reaccionando',
                    'review', 'behind the scenes', 'making of', 'documental', 'documentary',
                    'hablando de', 'talking about', 'opinion', 'analizando', 'analysis',
                    'teaser', 'trailer', 'tráiler', 'snippet', 'avance', 'q&a', 'vlog', 'unboxing', 'concert', 'live', 'onlive'
                  ];

                  // Filter out interviews, podcasts, reactions, and non-music videos
                  const cleanUnblocked = unblocked.filter(r => {
                    const t = (r.name || '').toLowerCase();
                    return !BAD_VIDEO_KEYWORDS.some(kw => t.includes(kw));
                  });

                  const poolToUse = cleanUnblocked.length > 0 ? cleanUnblocked : unblocked;

                  if (mode === 'karaoke' || mode === 'lyrics') {
                    const validResults = poolToUse.filter(r => {
                      const t = (r.name || '').toLowerCase();
                      if (mode === 'karaoke') return t.includes('karaoke') || t.includes('instrumental') || t.includes('pista');
                      if (mode === 'lyrics') return t.includes('lyric') || t.includes('letra');
                      return true;
                    });

                    if (validResults.length > 0) {
                      videoIdToPlay = validResults[0].id;
                    } else if (poolToUse.length > 0) {
                      // Fallback to top clean result if no strict keyword match in title
                      videoIdToPlay = poolToUse[0].id;
                    } else {
                      videoIdToPlay = null;
                    }
                  } else {
                    videoIdToPlay = poolToUse[0].id;
                  }

                  if (cacheKey && videoIdToPlay) localStorage.setItem(cacheKey, videoIdToPlay);
                } else {
                  // If all search results were marked blocked, fallback to original track ID if YouTube source
                  if (track.id && track.id.length === 11 && track.source !== 'spotify') {
                    videoIdToPlay = track.id;
                  } else {
                    videoIdToPlay = null;
                  }
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

        return { videoIdToPlay, isSpotifyTrack, effectiveMode: mode };
      },

      // Worker en segundo plano para precargar IDs de los siguientes temas de la cola (hasta 5 canciones adelantadas)
      startQueuePreloadWorker: async () => {
        const state = get();
        // Si ya está corriendo o no estamos en YouTube, abortar
        if (state.preloadWorkerRunning || state.playbackEngine !== 'youtube') return;

        set({ preloadWorkerRunning: true });

        try {
          const { useSettingsStore } = await import('./useSettingsStore');
          const { karaokeEnabled, lyricsEnabled } = useSettingsStore.getState();

          // Recorrer la cola desde la canción siguiente (máximo 5 pistas adelantadas)
          const queue = get().queue || [];
          const currentIndex = get().currentQueueIndex;
          const startIndex = Math.max(0, currentIndex + 1);
          const endIndex = Math.min(queue.length, startIndex + 5);

          for (let i = startIndex; i < endIndex; i++) {
            if (get().playbackEngine !== 'youtube' || !get().queue[i]) break;

            const track = get().queue[i];
            // Per-track mode: respect guest's version_preference, fallback to global host setting
            const trackMode = track.version_preference ?? (karaokeEnabled ? 'karaoke' : lyricsEnabled ? 'lyrics' : 'normal');
            const cacheKey = `yt_bridge_${track.id}_${trackMode}`;
            const cachedId = localStorage.getItem(cacheKey);

            // Precargar y resolver cualquier canción próxima que no esté cacheada o que haya fallado previamente
            if (!cachedId || cachedId === 'undefined' || cachedId === 'null' || get().failedYouTubeIds.includes(cachedId)) {
              await get().resolveYouTubeVideoId(track, trackMode);
              // Pequeña pausa de 300ms entre búsquedas para no saturar la API
              await new Promise(resolve => setTimeout(resolve, 300));
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

        const execId = Date.now() + Math.random();
        set({ _currentPlayExecId: execId, progress: progressMs });

        get().queueAddToHistory(track);
        const state = get();
        if (state.playbackEngine === 'youtube') {
          set({ currentTrack: track });
          const { videoIdToPlay, isSpotifyTrack, effectiveMode } = await get().resolveYouTubeVideoId(track, forceMode);

          // Evitar condición de carrera: si el usuario saltó rápido de canción mientras resolvíamos esta
          if (get()._currentPlayExecId !== execId) {
            console.warn("Se ignoró playEngineTrack porque hay una petición más reciente.");
            return;
          }

            // Validar estrictamente el ID antes de enviarlo al reproductor
            if (!videoIdToPlay || videoIdToPlay === 'undefined' || videoIdToPlay === 'null' || videoIdToPlay.length !== 11 || (videoIdToPlay === track.id && isSpotifyTrack) || (track.source === 'youtube' && get().failedYouTubeIds.includes(track.id))) {
              // Cascade fallback: karaoke → lyrics → normal → skip
              // This prevents skipping to the next song just because karaoke/lyrics wasn't found.
              if (effectiveMode === 'karaoke') {
                console.warn('Karaoke video not found. Trying lyrics fallback...');
                return get().playEngineTrack(track, progressMs, 'lyrics', autoplay);
              } else if (effectiveMode === 'lyrics') {
                console.warn('Lyrics video not found. Trying normal fallback...');
                return get().playEngineTrack(track, progressMs, 'normal', autoplay);
              } else {
                // Normal mode failed: no video available at all. Skip to next.
                import('sonner').then(({ toast }) => toast.error('Video no disponible para esta canción. Saltando...'));
                await new Promise(r => setTimeout(r, 1000));
                const nextTrack = get().shiftQueue();
                if (nextTrack) {
                  get().playEngineTrack(nextTrack);
                } else {
                  set({ currentTrack: null, isPlaying: false });
                }
              }
              return;
            }

            // Cargar el nuevo video
            if (videoIdToPlay && videoIdToPlay !== 'null' && videoIdToPlay !== 'undefined' && videoIdToPlay.length === 11) {
              set({ currentYtId: videoIdToPlay, isPlaying: autoplay !== false });
              const startSeconds = (typeof progressMs === 'number' && !isNaN(progressMs)) ? Math.max(0, progressMs / 1000) : 0;
              const yt = get().youtubePlayer;
              if (yt && typeof yt.loadVideoById === 'function') {
                yt.loadVideoById({ videoId: videoIdToPlay, startSeconds: startSeconds });
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
            }
            // Iniciar precarga de las siguientes canciones de la cola en segundo plano
            get().startQueuePreloadWorker();
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
          playHistory: [{ ...track, playedAt: new Date().toISOString() }, ...state.playHistory].slice(0, 100)
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

      approveRequest: (reqId) => {
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
            const mode = useSettingsStore.getState().mode;
            const partyOffset = Math.max(1, Math.min(20, useSettingsStore.getState().partyRequestOffset || 1));

            if (mode === 'party') {
              // Insert at partyOffset songs ahead of current song, preserving FIFO for consecutive requests
              const targetBase = state.currentQueueIndex + partyOffset;
              insertIndex = Math.min(newQueue.length, targetBase);
              while (insertIndex < newQueue.length && newQueue[insertIndex].requestedBy && insertIndex < targetBase + 20) {
                insertIndex++;
              }
            } else {
              insertIndex = Math.min(newQueue.length, state.currentQueueIndex + 15);
            }
          }

          newQueue.splice(insertIndex, 0, newTrack);

          return {
            pendingRequests: state.pendingRequests.filter((r) => r.reqId !== reqId),
            queue: newQueue,
            requestHistory: state.requestHistory.map(r => r.reqId === reqId ? { ...r, status: 'approved' } : r)
          };
        });
        get().startQueuePreloadWorker();
      },

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
        volume: state.volume,
        isPlaying: state.isPlaying,
        progress: state.progress,
        duration: state.duration,
        lastCommandTs: state.lastCommandTs,
        currentYtId: state.currentYtId,
        currentTrack: state.currentTrack,
      }),
    }
  )
);
