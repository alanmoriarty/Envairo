import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSettingsStore = create(
  persist(
    (set) => ({
      mode: 'party',          // 'party' | 'commercial'
      autoDJ: false,
      alwaysAvailable: true,
      startTime: '19:00',
      endTime: '03:00',
      allowRepeats: true,
      cooldownEnabled: true,
      cooldownMinutes: 10,
      explicitFilter: false,
      whitelistGenres: [],
      blacklistGenres: [],
      blacklistSongs: [],
      blacklistArtists: [],
      requestsPerHour: 15,
      requestsPerGuest: 0,
      tableCount: 0,

      // Session QR ID
      sessionId: `session-${Date.now()}`,
      setSessionId: (id) => set({ sessionId: id }),

      // Dashboard UI State
      showRequests: true,
      showQR: true,
      showPlaylists: true,
      setShowRequests: (v) => set({ showRequests: v }),
      setShowQR: (v) => set({ showQR: v }),
      setShowPlaylists: (v) => set({ showPlaylists: v }),

      setMode: (mode) => set({ mode }),
      setAutoDJ: (autoDJ) => set({ autoDJ }),
      setAlwaysAvailable: (v) => set({ alwaysAvailable: v }),
      setStartTime: (t) => set({ startTime: t }),
      setEndTime: (t) => set({ endTime: t }),
      setAllowRepeats: (v) => set({ allowRepeats: v }),
      setCooldownEnabled: (v) => set({ cooldownEnabled: v }),
      setCooldownMinutes: (v) => set({ cooldownMinutes: v }),
      setExplicitFilter: (v) => set({ explicitFilter: v }),
      setRequestsPerHour: (v) => set({ requestsPerHour: v }),
      setRequestsPerGuest: (v) => set({ requestsPerGuest: v }),
      setTableCount: (v) => set({ tableCount: v }),
      addWhitelistGenre: (g) =>
        set((s) => ({ whitelistGenres: [...new Set([...s.whitelistGenres, g])] })),
      removeWhitelistGenre: (g) =>
        set((s) => ({ whitelistGenres: s.whitelistGenres.filter((x) => x !== g) })),
      addBlacklistGenre: (g) =>
        set((s) => ({ blacklistGenres: [...new Set([...s.blacklistGenres, g])] })),
      removeBlacklistGenre: (g) =>
        set((s) => ({ blacklistGenres: s.blacklistGenres.filter((x) => x !== g) })),
      addBlacklistSong: (song) =>
        set((s) => ({ blacklistSongs: [...new Set([...s.blacklistSongs, song])] })),
      removeBlacklistSong: (song) =>
        set((s) => ({ blacklistSongs: s.blacklistSongs.filter((x) => x !== song) })),
      addBlacklistArtist: (a) =>
        set((s) => ({ blacklistArtists: [...new Set([...s.blacklistArtists, a])] })),
      removeBlacklistArtist: (a) =>
        set((s) => ({ blacklistArtists: s.blacklistArtists.filter((x) => x !== a) })),
      regenerateSession: () => set({ sessionId: `session-${Date.now()}` }),
    }),
    { name: 'bq-settings' }
  )
);
