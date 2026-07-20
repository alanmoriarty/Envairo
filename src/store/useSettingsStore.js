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
      allowRepeats: true, // DEPRECATED: use repeatCooldown instead
      repeatCooldown: -1, // -1 = always allow, 0 = block forever, >0 = minutes
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
      
      enairoEnabled: true,

      // Session QR ID
      sessionId: `session-${Date.now()}`,
      setSessionId: (id) => set({ sessionId: id }),

      // Host Security Secret (to bypass RLS for remote control)
      hostSecret: crypto.randomUUID(),
      isAdminMode: false, // Flag to indicate if we are in restricted remote control mode
      setHostSecret: (secret) => set({ hostSecret: secret }),
      setIsAdminMode: (isAdmin) => set({ isAdminMode: isAdmin }),

      // Dashboard UI State
      showRequests: true,
      showQR: true,
      showPlaylists: true,
      visualizerEnabled: false,
      visualizerUrl: '',
      karaokeEnabled: false, // busca "[canción] KARAOKE ORIGINAL WITH LYRICS"
      lyricsEnabled: false,  // busca "[canción] LYRICS"
      themeColor: 'default', // 'default', 'red', 'blue', 'green', 'amber'
      setShowRequests: (v) => set({ showRequests: v }),
      setShowQR: (v) => set({ showQR: v }),
      setShowPlaylists: (v) => set({ showPlaylists: v }),
      setVisualizerEnabled: (v) => set({ visualizerEnabled: v }),
      setVisualizerUrl: (v) => set({ visualizerUrl: v }),
      // Mutually exclusive: activating one disables the other
      setKaraokeEnabled: (v) => set({ karaokeEnabled: v, lyricsEnabled: v ? false : get().lyricsEnabled }),
      setLyricsEnabled: (v) => set({ lyricsEnabled: v, karaokeEnabled: v ? false : get().karaokeEnabled }),
      setThemeColor: (v) => set({ themeColor: v }),

      setMode: (mode) => set({ mode }),
      setAutoDJ: (autoDJ) => set({ autoDJ }),
      setAlwaysAvailable: (v) => set({ alwaysAvailable: v }),
      setStartTime: (t) => set({ startTime: t }),
      setEndTime: (t) => set({ endTime: t }),
      setAllowRepeats: (v) => set({ allowRepeats: v }), // DEPRECATED
      setRepeatCooldown: (v) => set({ repeatCooldown: v }),
      setCooldownEnabled: (v) => set({ cooldownEnabled: v }),
      setCooldownMinutes: (v) => set({ cooldownMinutes: v }),
      setExplicitFilter: (v) => set({ explicitFilter: v }),
      setRequestsPerHour: (v) => set({ requestsPerHour: v }),
      setRequestsPerGuest: (v) => set({ requestsPerGuest: v }),
      setTableCount: (v) => set({ tableCount: v }),
      
      // EnvAIro Selector AI
      enairoEnabled: false,
      enairoStartedAt: null,
      enairoLastRunAt: 0,
      setEnairoLastRunAt: (v) => set({ enairoLastRunAt: v }),
      setEnairoEnabled: (v) => set({ 
        enairoEnabled: v,
        enairoStartedAt: v ? Date.now() : null 
      }),
      enairoPrompt: '',
      setEnairoPrompt: (v) => set({ enairoPrompt: v }),
      enairoIsThinking: false,
      setEnairoIsThinking: (v) => set({ enairoIsThinking: v }),
      enairoTestMode: false,
      setEnairoTestMode: (v) => set({ enairoTestMode: v }),
      addWhitelistGenre: (g) =>
        set((s) => ({ whitelistGenres: [...new Set([...s.whitelistGenres, g])] })),
      removeWhitelistGenre: (g) =>
        set((s) => ({ whitelistGenres: s.whitelistGenres.filter((x) => x !== g) })),
      clearWhitelistGenres: () => set({ whitelistGenres: [] }),
      addBlacklistGenre: (g) =>
        set((s) => ({ blacklistGenres: [...new Set([...s.blacklistGenres, g])] })),
      removeBlacklistGenre: (g) =>
        set((s) => ({ blacklistGenres: s.blacklistGenres.filter((x) => x !== g) })),
      clearBlacklistGenres: () => set({ blacklistGenres: [] }),
      addBlacklistSong: (song) =>
        set((s) => ({ blacklistSongs: [...new Set([...s.blacklistSongs, song])] })),
      removeBlacklistSong: (song) =>
        set((s) => ({ blacklistSongs: s.blacklistSongs.filter((x) => x !== song) })),
      clearBlacklistSongs: () => set({ blacklistSongs: [] }),
      addBlacklistArtist: (a) =>
        set((s) => ({ blacklistArtists: [...new Set([...s.blacklistArtists, a])] })),
      removeBlacklistArtist: (a) =>
        set((s) => ({ blacklistArtists: s.blacklistArtists.filter((x) => x !== a) })),
      clearBlacklistArtists: () => set({ blacklistArtists: [] }),
      regenerateSession: () => set({ sessionId: `session-${Date.now()}` }),
    }),
    { name: 'bq-settings' }
  )
);
