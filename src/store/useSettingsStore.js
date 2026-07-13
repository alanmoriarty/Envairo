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
      explicitFilter: false,
      whitelistGenres: [],
      blacklistGenres: [],
      whitelistArtists: [],
      blacklistArtists: [],

      // Session QR ID
      sessionId: `session-${Date.now()}`,

      setMode: (mode) => set({ mode }),
      setAutoDJ: (autoDJ) => set({ autoDJ }),
      setAlwaysAvailable: (v) => set({ alwaysAvailable: v }),
      setStartTime: (t) => set({ startTime: t }),
      setEndTime: (t) => set({ endTime: t }),
      setAllowRepeats: (v) => set({ allowRepeats: v }),
      setExplicitFilter: (v) => set({ explicitFilter: v }),
      addWhitelistGenre: (g) =>
        set((s) => ({ whitelistGenres: [...new Set([...s.whitelistGenres, g])] })),
      removeWhitelistGenre: (g) =>
        set((s) => ({ whitelistGenres: s.whitelistGenres.filter((x) => x !== g) })),
      addBlacklistGenre: (g) =>
        set((s) => ({ blacklistGenres: [...new Set([...s.blacklistGenres, g])] })),
      removeBlacklistGenre: (g) =>
        set((s) => ({ blacklistGenres: s.blacklistGenres.filter((x) => x !== g) })),
      addWhitelistArtist: (a) =>
        set((s) => ({ whitelistArtists: [...new Set([...s.whitelistArtists, a])] })),
      removeWhitelistArtist: (a) =>
        set((s) => ({ whitelistArtists: s.whitelistArtists.filter((x) => x !== a) })),
      addBlacklistArtist: (a) =>
        set((s) => ({ blacklistArtists: [...new Set([...s.blacklistArtists, a])] })),
      removeBlacklistArtist: (a) =>
        set((s) => ({ blacklistArtists: s.blacklistArtists.filter((x) => x !== a) })),
      regenerateSession: () => set({ sessionId: `session-${Date.now()}` }),
    }),
    { name: 'bq-settings' }
  )
);
