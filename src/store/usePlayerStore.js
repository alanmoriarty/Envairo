import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const usePlayerStore = create(
  persist(
    (set, get) => ({
      // Spotify Web Playback SDK
      player: null,
      deviceId: null,
      sdkReady: false,

      // Playback state
      currentTrack: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
      volume: 70,

      // Envairo
      queue: [],
      currentQueueIndex: -1,
      pendingRequests: [],
      playHistory: [],

      // ── SDK ──────────────────────────────────────────────────────────────
      setPlayer: (player) => set({ player }),
      setDeviceId: (deviceId) => set({ deviceId }),
      setSdkReady: (sdkReady) => set({ sdkReady }),

      // ── Playback ─────────────────────────────────────────────────────────
      setCurrentTrack: (track) => set({ currentTrack: track }),
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      setProgress: (progress) => set({ progress }),
      setDuration: (duration) => set({ duration }),
      setVolume: (volume) => set({ volume }),

      // ── Queue ─────────────────────────────────────────────────────────────
      addToQueue: (track) =>
        set((state) => ({
          queue: [...state.queue, { ...track, queueId: `${track.id}-${Date.now()}` }],
        })),

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
            currentQueueIndex: updatedIndex,
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
        const nextIndex = state.currentQueueIndex + 1;
        const next = state.queue[nextIndex];
        if (next) {
          set({ currentQueueIndex: nextIndex, currentTrack: next });
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
        const index = state.queue.findIndex(t => t.queueId === queueId);
        if (index !== -1) {
          set({ currentQueueIndex: index, currentTrack: state.queue[index] });
          return state.queue[index];
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
      addPendingRequest: (req) =>
        set((state) => ({
          pendingRequests: [
            { ...req, reqId: `req-${Date.now()}`, timestamp: new Date() },
            ...state.pendingRequests,
          ],
        })),

      approveRequest: (reqId) =>
        set((state) => {
          const req = state.pendingRequests.find((r) => r.reqId === reqId);
          if (!req) return {};
          return {
            pendingRequests: state.pendingRequests.filter((r) => r.reqId !== reqId),
            queue: [
              ...state.queue,
              { ...req.track, queueId: `${req.track.id}-${Date.now()}`, requestedBy: req.requester },
            ],
          };
        }),

      rejectRequest: (reqId) =>
        set((state) => ({
          pendingRequests: state.pendingRequests.filter((r) => r.reqId !== reqId),
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
      }),
    }
  )
);
