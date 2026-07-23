import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSettingsStore = create(
  persist(
    (set) => ({
      mode: 'party',          // 'party' | 'commercial'
      eventName: '',
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
      
      // DJ Profile
      djName: 'Dj Anfitrión',
      djAvatar: 'avatar1',
      setDjName: (name) => set({ djName: name }),
      setDjAvatar: (avatar) => set({ djAvatar: avatar }),

      lastSavedSignature: '',
      setLastSavedSignature: (sig) => set({ lastSavedSignature: sig }),

      enairoEnabled: true,
      enairoPrompt: '',
      setEnairoPrompt: (prompt) => set({ enairoPrompt: prompt }),
      enairoTrackCount: 35,
      setEnairoTrackCount: (count) => set({ enairoTrackCount: count }),
      enairoTestMode: false,
      setEnairoTestMode: (v) => set({ enairoTestMode: v }),
      // Session QR ID
      sessionId: `session-${Date.now()}`,
      setSessionId: (id) => set({ sessionId: id }),

      // Host Security Secret (to bypass RLS for remote control)
      hostSecret: crypto.randomUUID(),
      isAdminMode: false, // Flag to indicate if we are in restricted remote control mode
      setHostSecret: (secret) => set({ hostSecret: secret }),
      setIsAdminMode: (val) => set({ isAdminMode: val }),

      clearSettingsState: () => set({
        mode: 'party',
        eventName: '',
        autoDJ: false,
        autoDjPrompt: '',
        alwaysAvailable: true,
        startTime: '19:00',
        endTime: '03:00',
        allowRepeats: true,
        repeatCooldown: -1,
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
        djName: 'Dj Anfitrión',
        djAvatar: 'avatar1',
        lastSavedSignature: '',
        enairoEnabled: true,
        enairoPrompt: '',
        enairoTestMode: false,
        sessionId: `session-${Date.now()}`,
        hostSecret: crypto.randomUUID(),
        isAdminMode: false
      }),

      // Dashboard UI State
      showRequests: true,
      showQR: true,
      showPlaylists: true,
      visualizerEnabled: false,
      visualizerUrl: '',
      karaokeEnabled: false, // busca "[canción] KARAOKE ORIGINAL WITH LYRICS"
      setKaraokeEnabled: (v) => set({ karaokeEnabled: v }),
      youtubeNativeCast: false,
      setYoutubeNativeCast: (v) => set({ youtubeNativeCast: v }),
      lyricsEnabled: false,  // busca "[canción] LYRICS"
      themeColor: 'default', // 'default', 'red', 'blue', 'green', 'amber'
      setShowRequests: (v) => set({ showRequests: v }),
      setShowQR: (v) => set({ showQR: v }),
      setShowPlaylists: (v) => set({ showPlaylists: v }),
      setVisualizerEnabled: (v) => set({ visualizerEnabled: v }),
      setVisualizerUrl: (v) => set({ visualizerUrl: v }),
      // Mutually exclusive: activating one disables the other
      setKaraokeEnabled: (v) => set(v ? { karaokeEnabled: true, lyricsEnabled: false } : { karaokeEnabled: false }),
      setLyricsEnabled: (v) => set(v ? { lyricsEnabled: true, karaokeEnabled: false } : { lyricsEnabled: false }),
      setThemeColor: (v) => set({ themeColor: v }),

      setMode: (mode) => set({ mode }),
      setEventName: (name) => set({ eventName: name }),
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

      // envAIro Selector AI
      enairoEnabled: false,
      enairoLastRunAt: 0,
      enairoUsageCount: 0,
      enairoLastUsedDate: '',
      enairoCooldownUntil: 0,
      enairoAutoReorderCount: 0,
      enairoAutoReorderCount: 0,
      enairoAutoReorderDate: '',
      enairoSweepCount: 0,
      enairoSweepDate: '',

      setEnairoLastRunAt: (v) => set({ enairoLastRunAt: v }),
      setEnairoEnabled: (v) => set({ enairoEnabled: v }),
      setEnairoCooldown: (until, newCount, todayDate) => set({
        enairoCooldownUntil: until,
        enairoUsageCount: newCount,
        enairoLastUsedDate: todayDate
      }),
      resetEnairoUsage: () => set({ enairoUsageCount: 0, enairoLastUsedDate: '' }),
      setEnairoAutoReorderCount: (count, date) => set({ enairoAutoReorderCount: count, enairoAutoReorderDate: date }),
      resetEnairoAutoReorderUsage: () => set({ enairoAutoReorderCount: 0, enairoAutoReorderDate: '' }),
      setEnairoSweepCount: (count, date) => set({ enairoSweepCount: count, enairoSweepDate: date }),
      resetEnairoSweepUsage: () => set({ enairoSweepCount: 0, enairoSweepDate: '' }),
      enairoPrompt: '',
      setEnairoPrompt: (v) => set({ enairoPrompt: v }),
      enairoIsThinking: false,
      setEnairoIsThinking: (v) => set({ enairoIsThinking: v }),
      enairoTestMode: false,
      setEnairoTestMode: (v) => set({ enairoTestMode: v }),

      autoDjPrompt: '',
      setAutoDjPrompt: (v) => set({ autoDjPrompt: v }),

      addWhitelistGenre: (g) =>
        set((s) => ({ whitelistGenres: [...new Set([...s.whitelistGenres, g])] })),
      removeWhitelistGenre: (g) =>
        set((s) => ({ whitelistGenres: s.whitelistGenres.filter((x) => x !== g) })),
      clearWhitelistGenres: () => set((s) => ({ whitelistGenres: [] })),
      addBlacklistGenre: (g) =>
        set((s) => ({ blacklistGenres: [...new Set([...s.blacklistGenres, g])] })),
      removeBlacklistGenre: (g) =>
        set((s) => ({ blacklistGenres: s.blacklistGenres.filter((x) => x !== g) })),
      clearBlacklistGenres: () => set((s) => ({ blacklistGenres: [] })),
      addBlacklistSong: (song) =>
        set((s) => ({ blacklistSongs: [...new Set([...s.blacklistSongs, song])] })),
      removeBlacklistSong: (song) =>
        set((s) => ({ blacklistSongs: s.blacklistSongs.filter((x) => x !== song) })),
      clearBlacklistSongs: () => set((s) => ({ blacklistSongs: [] })),
      addBlacklistArtist: (a) =>
        set((s) => ({ blacklistArtists: [...new Set([...s.blacklistArtists, a])] })),
      removeBlacklistArtist: (a) =>
        set((s) => ({ blacklistArtists: s.blacklistArtists.filter((x) => x !== a) })),
      clearBlacklistArtists: () => set((s) => ({ blacklistArtists: [] })),
      regenerateSession: () => set({ sessionId: `session-${Date.now()}` }),
    }),
    { name: 'bq-settings' }
  )
);
