import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sanitizePrompt } from '../utils/security';

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
      artistRepeatCooldown: -1, // -1 = always allow, 0 = block forever, >0 = minutes
      cooldownEnabled: false,
      cooldownMinutes: 10,
      explicitFilter: false,
      whitelistGenres: [],
      blacklistGenres: [],
      blacklistSongs: [],
      blacklistArtists: [],
      requestsPerHour: 15,
      requestsPerGuest: 0,
      tableCount: 0,
      guestVersionRequest: false, // Allow guests to request Normal / Lyrics / Karaoke version
      guestSessionExpiryHours: 6, // 2 | 4 | 6 | 8 | 12 | 24
      partyRequestOffset: 5,
      pairedTvs: [],

      // DJ Transitions
      djTransitionsEnabled: true,
      djTransitionMode: 'random', // 'random' | 'fade' | 'cut' | 'brake' | 'echo' | 'start'
      djTransitionDuration: 5,
      setDjTransitionsEnabled: (val) => set({ djTransitionsEnabled: val }),
      setDjTransitionMode: (mode) => set({ djTransitionMode: mode }),
      setDjTransitionDuration: (dur) => set({ djTransitionDuration: dur }),
      
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
      enairoIncludeGuestMetrics: true,
      setEnairoIncludeGuestMetrics: (v) => set({ enairoIncludeGuestMetrics: v }),
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
        alwaysAvailable: false,
        startTime: '19:00',
        endTime: '03:00',
        allowRepeats: true,
        repeatCooldown: -1,
        artistRepeatCooldown: -1,
        cooldownEnabled: false,
        cooldownMinutes: 10,
        explicitFilter: false,
        whitelistGenres: [],
        blacklistGenres: [],
        blacklistSongs: [],
        blacklistArtists: [],
        requestsPerHour: 15,
        requestsPerGuest: 0,
        tableCount: 0,
        partyRequestOffset: 5,
        guestVersionRequest: false,
        guestSessionExpiryHours: 6,
        djName: 'Dj Anfitrión',
        djAvatar: 'avatar1',
        lastSavedSignature: '',
        enairoEnabled: true,
        enairoPrompt: '',
        enairoTestMode: false,
        sessionId: null,
        hostSecret: null,
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
      setArtistRepeatCooldown: (v) => set({ artistRepeatCooldown: Number(v) }),
      setCooldownEnabled: (v) => set({ cooldownEnabled: v }),
      setCooldownMinutes: (v) => set({ cooldownMinutes: v }),
      setExplicitFilter: (v) => set({ explicitFilter: v }),
      setRequestsPerHour: (v) => set({ requestsPerHour: v }),
      setRequestsPerGuest: (v) => set({ requestsPerGuest: v }),
      setTableCount: (v) => set({ tableCount: v }),
      setPartyRequestOffset: (v) => set({ partyRequestOffset: Math.max(1, Math.min(20, parseInt(v, 10) || 5)) }),
      setGuestVersionRequest: (v) => set({ guestVersionRequest: v }),
      setGuestSessionExpiryHours: (v) => set({ guestSessionExpiryHours: Math.max(1, Math.min(48, parseInt(v, 10) || 6)) }),

      // envAIro Selector AI
      enairoEnabled: false,
      enairoLastRunAt: 0,
      enairoUsageCount: 0,
      enairoLastUsedDate: '',
      enairoAutoReorderCount: 0,
      enairoAutoReorderDate: '',
      enairoReorderCooldownUntil: 0,

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
      setEnairoReorderCooldownUntil: (until) => set({ enairoReorderCooldownUntil: until }),
      enairoPrompt: '',
      setEnairoPrompt: (v) => set({ enairoPrompt: sanitizePrompt(v) }),
      enairoIsThinking: false,
      setEnairoIsThinking: (v) => set({ enairoIsThinking: v }),
      enairoTestMode: false,
      setEnairoTestMode: (v) => set({ enairoTestMode: v }),
      enairoAutoIntervalEnabled: false,
      setEnairoAutoIntervalEnabled: (v) => set({ enairoAutoIntervalEnabled: v }),
      enairoAutoReorderEnabled: false,
      enairoAutoReorderIntervalMinutes: 45,
      setEnairoAutoReorderEnabled: (v) => set({ enairoAutoReorderEnabled: v }),
      setEnairoAutoReorderIntervalMinutes: (v) => set({ enairoAutoReorderIntervalMinutes: Number(v) || 45 }),

      autoDjPrompt: '',
      setAutoDjPrompt: (v) => set({ autoDjPrompt: sanitizePrompt(v) }),

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
      setPairedTvs: (tvs) => set({ pairedTvs: tvs }),
      regenerateSession: () => set({ sessionId: `session-${Date.now()}` }),
    }),
    { 
      name: 'bq-settings',
      // SECURITY: hostSecret is excluded from localStorage persistence.
      // It's a sensitive auth secret; keeping it only in memory prevents
      // AdSense scripts, browser extensions, or XSS from reading it.
      // On page reload, it is securely recovered from Supabase via
      // host_takeover_session() in useQueueSync.js.
      partialize: (state) => {
        const { hostSecret, ...rest } = state;
        return rest;
      }
    }
  )
);
