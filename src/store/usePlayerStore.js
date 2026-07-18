import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const usePlayerStore = create(
  persist(
    (set, get) => ({
      // Spotify Web Playback SDK
      player: null,
      deviceId: null,
      activeDeviceId: null,
      sdkReady: false,
      initialSyncDone: false,

      // Playback state
      currentTrack: null,
      isPlaying: false,
      pendingResume: false,
      deviceTransferred: false,
      progress: 0,
      duration: 0,
      volume: 70,

      // Envairo
      queue: [],
      currentQueueIndex: -1,
      pendingRequests: [],
      playHistory: [],
      requestHistory: [],
      lastCommandTs: 0,

      // ── SDK ──────────────────────────────────────────────────────────────
      setPlayer: (player) => set({ player }),
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
      setQueue: (tracks) => set({ 
        queue: tracks.map((t, i) => ({ ...t, queueId: `${t.id}-${Date.now()}-${i}` })), 
        currentQueueIndex: -1 
      }),

      addToQueue: (track) =>
        set((state) => {
          const newTrack = { ...track, queueId: `${track.id}-${Date.now()}` };
          
          const newQueue = [...state.queue];
          let insertIndex = newQueue.length;
          
          if (state.currentQueueIndex >= 0) {
            insertIndex = Math.min(newQueue.length, state.currentQueueIndex + 15);
          }
          
          newQueue.splice(insertIndex, 0, newTrack);
          
          return {
            queue: newQueue
          };
        }),

      removeFromQueue: (queueId) =>
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
        }),
        
      clearQueue: () =>
        set(() => {
          return {
            queue: [],
            currentQueueIndex: -1
          };
        }),

      reorderQueue: (oldIndex, newIndex) =>
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
        }),

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

      // ── History ──────────────────────────────────────────────────────────
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
        queue: state.queue,
        currentQueueIndex: state.currentQueueIndex,
        volume: state.volume,
        playHistory: state.playHistory,
        pendingRequests: state.pendingRequests,
        requestHistory: state.requestHistory,
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
        progress: state.progress,
      }),
    }
  )
);
