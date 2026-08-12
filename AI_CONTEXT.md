# envAIro — AI Context Document (Single Source of Truth)

This document is the authoritative reference for any AI assistant or developer working on the envAIro codebase. Read this before writing any code. It reflects the current production state of the application.

---

## 1. Project Overview

**envAIro** is a collaborative, real-time jukebox PWA. A **Host** creates a music session on their device (PC or tablet connected to speakers), displays a QR code, and **Guests** scan it to request songs from their phones.

The application features an AI DJ system (**envAIro Filter** + **envAIro Selector**) that evaluates incoming requests and autonomously manages the music queue.

**Deployment:** Vercel (static SPA + API routes). Database & Auth: Supabase..

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Routing | React Router DOM v6 |
| Styles | Tailwind CSS with custom CSS variables (glassmorphism theme) |
| Global State | Zustand (with `persist` middleware for localStorage) |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| Playback Engine | **YouTube Iframe API** (exclusive — no Spotify) |
| i18n | Manual implementation via `useLanguageStore.js` |
| Notifications | `sonner` (toast library) |
| PWA | `vite-plugin-pwa` |

---

## 3. Absolute Rules (Never Break These)

### 3.1 Spotify is Gone — Do Not Bring It Back
Spotify was removed due to Web Playback SDK restrictions (Premium-only, token expiry). **There is no Spotify code in this codebase.** Never suggest, implement, or restore:
- `spotifyApi`, `useSpotifySDK`, `spotifyAuth`, or any Spotify OAuth flow.
- The `playbackEngine` field in `usePlayerStore` still has `'spotify'` as a possible string value in older schema — **ignore it**. In practice, the engine is always `'youtube'`.

### 3.2 Supabase RPC Over Direct Table Mutations
The `sessions` and `requests` tables have **no public UPDATE/DELETE policies**. All writes from the host must go through:
- `sync_host_config(p_session_id, p_secret, p_updates)` — JSONB patch-style upsert for session state.
- `manage_request(p_request_id, p_session_id, p_secret, p_new_status)` — approve/reject a guest request.
- Direct table inserts are only allowed for `SELECT` (everyone) and `INSERT` (anyone). Never call `.update()` or `.delete()` on these tables from the client.

### 3.3 `hostSecret` Must Not Be Persisted to localStorage
`hostSecret` is excluded from Zustand's `persist` middleware via `partialize`. It lives **in memory only** between page reloads. On reload it is recovered from Supabase via `host_takeover_session()` RPC inside `useQueueSync.js`. Never move `hostSecret` back into the persisted state.

### 3.4 All Text Must Be in `useLanguageStore.js`
Any user-facing string must be registered via the `t('key')` function from `useLanguageStore`. The store is in `src/store/useLanguageStore.js`. Add new keys to all supported languages (es-419 and en).

### 3.5 Authentication: Email + Password Only
No OAuth providers. Supabase Auth manages host login via `supabase.auth.signInWithPassword()`. No Google, GitHub, or Spotify login flows.

---

## 4. Application Roles & Modes

| Role | Description |
|---|---|
| **Host (Main)** | Authenticated user on the primary device. Runs `PersistentPlayer`, `useQueueSync`, `useTVBroadcast`, `useEnairoSelector`. Owns the session. |
| **Host (Remote Control)** | The host logs in from a secondary device (phone). Enters `isAdminMode = true`. Sends playback commands via `sync_host_config` → `playback_command` field. Cannot play audio directly. |
| **Guest** | Anonymous user who scanned the QR. Can search songs and submit requests. Limited to reading session state and inserting into `requests`. |
| **TV Display** | Anonymous browser on a Smart TV. Authenticated via `bq-tv-session-id` stored in localStorage. Receives sync via Supabase Realtime broadcast channel `tv-sync-{sessionId}`. |

---

## 5. State Management: Zustand Stores

### `usePlayerStore.js` (`src/store/usePlayerStore.js`)
The playback engine's brain. Persisted as `'bq-player'`.

**Key state:**
- `currentTrack` — The currently playing track object `{ id, name, artists, uri, source, queueId }`.
- `queue` — Array of track objects with unique `queueId` (`${id}-${Date.now()}-${i}`).
- `currentQueueIndex` — Index of the playing track in `queue`. `-1` means nothing is playing.
- `isPlaying` — Boolean. Reflects the YouTube player's actual play state.
- `progress` / `duration` — Integers in milliseconds. `progress` is updated by the progress timer in `useYouTubeSDK`.
- `youtubePlayer` — The **Virtual Player Proxy** object (not the raw YT.Player). Set by `useYouTubeSDK` after initialization.
- `currentYtId` — The YouTube video ID currently loaded in the active player iframe. Used to prevent redundant loads.
- `failedYouTubeIds` — Blacklist of YouTube IDs that triggered errors (100/101/150). Persisted locally and uploaded to the global `youtube_blocked_videos` table.
- `preloadWorkerRunning` — Guard flag to prevent concurrent preload workers.

**Key actions:**
- `playEngineTrack(track, progressMs, forceMode, autoplay)` — The main playback entry point. Resolves the YouTube video ID for the track (with mode-aware search), then calls `loadVideoById` or `cueVideoById` on the virtual player. Implements a **fallback cascade**: if the resolved video ID is invalid, it retries with the next simpler mode: `karaoke → lyrics → normal → skip`.
- `resolveYouTubeVideoId(track, forceMode)` — Resolves the correct YouTube ID for a given track and mode. Returns `{ videoIdToPlay, isSpotifyTrack, effectiveMode }`. Uses localStorage cache (`yt_bridge_{trackId}_{mode}`) to avoid redundant API calls. All modes other than `normal` trigger a YouTube Data API search.
- `shiftQueue()` — Advances `currentQueueIndex` by 1 and returns the next track. Trims queue head if index exceeds 10. Returns `null` when the queue is exhausted.
- `startQueuePreloadWorker()` — Asynchronously pre-resolves YouTube IDs for the next 5 tracks in the queue. In `karaoke` or `lyrics` mode, ALL tracks are searched (not just Spotify-sourced ones). Uses 1s delay between searches to avoid rate-limiting. Protected by `preloadWorkerRunning` flag.
- `addToQueue(track)` — Inserts a new track into the queue up to 15 positions ahead of `currentQueueIndex`, triggers preload, and auto-starts playback if the player is idle.

---

### `useSettingsStore.js` (`src/store/useSettingsStore.js`)
Host configuration and session identity. Persisted as `'bq-settings'`.

**Key state:**
- `sessionId` — The Supabase `sessions.id`. Defaults to `session-${Date.now()}` on first load. Overwritten by `user.id` if the host is authenticated.
- `hostSecret` — A `crypto.randomUUID()` that acts as the bypass key for RLS-protected RPCs. **NOT persisted** (see `partialize`). Recovered from DB via `host_takeover_session` on reload.
- `isAdminMode` — `true` when the current device is acting as a remote control (not the main host).
- `karaokeEnabled` / `lyricsEnabled` — **Mutually exclusive**. Setting one via `setKaraokeEnabled(true)` automatically sets the other to `false`. Alters the YouTube search suffix: karaoke → `"KARAOKE ORIGINAL WITH LYRICS NO COPYRIGHT"`, lyrics → `"LYRICS NO COPYRIGHT"`.
- `autoDJ` — Enables the Auto DJ (envAIro Filter) for autonomous request approval.
- `pairedTvs` — Array of paired TV objects `{ id, label }`. Synced to `sessions.paired_tvs` via `sync_host_config`.
- `blacklistGenres`, `blacklistSongs`, `blacklistArtists` — Content filters applied by `evaluate-request` Edge Function.

---

### `useAuthStore.js`
Minimal. Holds Supabase `user` object and `logout()` function.

### `useLanguageStore.js`
Provides `t(key)` translation function and `LanguageSelector` component. Add all new UI strings here.

---

## 6. Hooks Architecture

### `useQueueSync.js` ⚠️ (Most Critical File)
**Purpose:** Bidirectional sync between local Zustand state and Supabase.

**Two `useEffect` blocks, both keyed on `sessionId`:**

**Effect 1 — Queue & Playback State:**
1. **Push (local → Supabase):** Subscribes to `usePlayerStore` changes. If `queue`, `currentQueueIndex`, `currentTrack`, `activeDeviceId`, `volume`, or `playHistory` changes (excluding `progress`), debounces (500ms) a `sync_host_config` RPC call. Progress is NOT pushed here — it goes via broadcast.
2. **Pull (Supabase → local):** Listens to `postgres_changes` on `sessions` table. On update:
   - Detects **Kickout**: if `active_instance_id` changed and we're the main host → logout + redirect.
   - Detects **Remote Kickout**: if `active_remote_id` changed and we're in admin mode → exit admin mode.
   - Processes playback commands from `playback_command` field (play, pause, next, prev, restart, set_volume, toggle_karaoke, toggle_lyrics, play_specific).
   - Calls `processStateUpdates()` to apply queue/track/history changes to the store.
3. **Broadcast (progress):** Every 5s, sends `{ progress, isPlaying }` via Realtime broadcast to `queue-sync-{sessionId}` channel. Remote controls and guests receive this to sync their progress bar.
4. **Initial Pull:** On mount, does a direct `SELECT` from `sessions` to hydrate the store before the Realtime subscription is ready.
5. **Visibility Handler:** On `document.visibilitychange → visible`, re-fetches session state to handle mobile tab-switching gaps.

**Effect 2 — Requests & Session Initialization:**
1. **`syncSession()`:** On mount, calls `host_takeover_session` RPC to register the current instance ID and recover `hostSecret`. If session doesn't exist in DB, creates it via direct `INSERT`.
2. **Requests Pull:** Fetches all existing `requests` for this session and populates `pendingRequests` + `requestHistory`.
3. **Requests Realtime:** Listens to `INSERT` on `requests`. On new request:
   - If `autoDJ` is enabled, calls `evaluateTrack()` from `lib/autoDJ.js` and auto-approves/rejects via `manage_request` RPC.
   - Otherwise, shows a toast notification to the host.
4. Listens to `UPDATE` on `requests` (for remote approval/rejection) and removes from `pendingRequests`.

---

### `useYouTubeSDK.js`

**Dual-Buffer Architecture for Seamless Crossfade:**

The hook maintains **two YouTube Iframe API players** (`player1Ref`, `player2Ref`) and an `activePlayerIndex` ref (1 or 2). At any given time, one player is "active" (visible, playing) and the other is the "buffer" (hidden, loading the next track).

**`applyStyles(wrapper, isVis, isFs)`:** Controls the visual position/opacity of the `#youtube-wrapper` div:
- **Fullscreen:** Full viewport, z-index 9999, opacity 1 (or 0 if `errorHidden === 'true'`).
- **Visualizer mode:** Small pip (160×90px) bottom-right, semi-transparent. Hides if `errorHidden === 'true'`.
- **Normal/background mode:** Full viewport, `z-index: -1`, blurred, opacity 0.5 (or 0 if no `currentTrack` or `errorHidden === 'true'`).

**`errorHidden` data attribute:** Set to `'true'` in `handleError` to hide the YouTube error screen from users/audience. Cleared to `'false'` when a video successfully enters `PLAYING` state.

**Virtual Player Proxy:** A plain object (`virtualPlayer`) is stored in `usePlayerStore.youtubePlayer`. It delegates calls to the active/buffer player as appropriate. The most important method is `loadVideoById(args)`:
- If the requested `videoId === currentYtIdRef.current` (same video, no transition): seeks and plays in place.
- If the active player is currently `PLAYING`: triggers crossfade by loading into buffer player (muted). The swap happens in `handleStateChange` when the buffer reports `PLAYING`.
- Otherwise: loads directly into active player.

**`handleStateChange` on ACTIVE player:**
- `PLAYING` → `setIsPlaying(true)`, `setDuration()`, starts progress interval, clears `errorHidden`.
- `PAUSED` → `setIsPlaying(false)`, stops progress interval.
- `ENDED` → calls `shiftQueue()`. If next track exists, calls `playEngineTrack()`. If queue exhausted, clears `currentYtIdRef`, sets `{ currentTrack: null, isPlaying: false, progress: 0, duration: 0 }`, calls `stopVideo()` on both players.

**`handleStateChange` on BUFFER player (during transition):**
- When buffer reaches `PLAYING`: swaps active/buffer containers (opacity crossfade 0.8s), pauses old player, updates `activePlayerIndex`.

**`handleError`:**
- If error is on the **buffer player**: abort transition silently, keep active player playing, `return` — do not disrupt audience.
- If error is on the **active player**: immediately set `errorHidden = 'true'` + call `applyStyles()` to hide the error screen. Then for fatal errors (100, 101, 150): blacklist the ID, clear cache entry, call `playEngineTrack` (which will cascade through karaoke → lyrics → normal before skipping).

**Resume on reload:** After both players are `onReady` (counter hits 2), waits 800ms for `useQueueSync` to hydrate the store, then calls `playEngineTrack(currentTrack, progress)` if a track is persisted.

---

### `useTVBroadcast.js`

Runs on the host. Broadcasts player state to slave TV displays via:
1. **`BroadcastChannel('envairo_tv_sync')`** — for TVs on the same machine/LAN.
2. **Supabase Realtime broadcast** on `tv-sync-{sessionId}` channel — for remote Smart TVs.

**Sync events sent:**
- `SYNC` — on `currentYtId` or `isPlaying` change. Payload: `{ type, videoId, isPlaying, time }`.
- `SYNC_TIME` — every 4s and on manual seeks (>1500ms delta). Same payload.
- `MASTER_DISCONNECT` — on `beforeunload`.

**Events received from slaves:**
- `REQUEST_SYNC` — slave requests full state resync.
- `SLAVE_ERROR` — slave reports a failed video ID. Host blacklists it via `addFailedYouTubeId()` and calls `playEngineTrack` to find an alternative.
- `TV_STOLEN` — this TV's slot was claimed by another user → remove from `pairedTvs`.

---

### `useEnairoSelector.js`

The AI DJ that proactively injects songs into the queue. Calls a Supabase Edge Function (`envairo-selector`) with context (play history, current settings, queue) and receives a list of recommended tracks. Subject to usage limits (configured via `enairoUsageCount`, `enairoCooldownUntil`, etc. in `useSettingsStore`).

### `useAutoQueue.js`

Thin wrapper that calls `lib/autoDJ.js` → `evaluate-request` Edge Function. Evaluates a track against the host's `blacklistGenres`, `blacklistSongs`, `blacklistArtists`, `explicitFilter`, and `repeatCooldown` settings.

---

## 7. Pages

| Page | Route | Role |
|---|---|---|
| `LoginPage.jsx` | `/` | Public. Host login (email + password). |
| `OnboardingPage.jsx` | `/app/onboarding` | First-time setup for new hosts. |
| `DashboardPage.jsx` | `/app/dashboard` | **Main host page.** Queue, requests, QR, playlists, AI DJ controls. |
| `SettingsPage.jsx` | `/app/settings` | All host configuration. |
| `MetricsPage.jsx` | `/app/metrics` | Analytics from the `requests` table (user-submitted only). |
| `ActivitiesPage.jsx` | `/app/activities` | History and recent activity feed. |
| `GuestPage.jsx` | `/session/:sessionId` | Guest interface. Song search and request submission. |
| `TVDisplayPage.jsx` | `/tv` | Slave TV display. Autonomous YouTube player synced to host. |

---

## 8. Guest Access Control (Token System)

The QR code contains a **permanent** `qr_token` (`?t={qr_token}`) embedded in the URL. This token never expires by itself.

**Flow:**
1. Guest scans QR → arrives at `/session/{sessionId}?t={qr_token}`.
2. If no `gat_{sessionId}` key in their `localStorage`, calls `create_guest_access(p_session_id, p_qr_token)` RPC.
3. RPC validates the `qr_token` against `sessions.qr_token` and returns a `guest_access_token` (personal, valid 6 hours).
4. Token stored in guest's `localStorage` as `gat_{sessionId}`.
5. All subsequent song requests use this token for rate-limiting validation via `submit_guest_request` RPC.
6. If host regenerates the QR (changes `qr_token`), old tokens cannot be created from the new QR — existing tokens within their 6h window remain valid.

---

## 9. Database Schema Summary

### `sessions` table
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | The `sessionId` (= `session-{timestamp}` or `auth.uid()`) |
| `host_secret` | UUID | Admin bypass key. Must match for most RPC calls. |
| `active_instance_id` | UUID | Browser tab ID of the primary host. Used for kickout. |
| `active_remote_id` | UUID | Browser tab ID of the active remote control. |
| `supabase_user_id` | UUID | Links to `auth.users`. Allows ownership bypass in RPCs. |
| `playback_command` | JSONB | `{ action, ts, [value], [queueId] }`. Written by remote, read by host. |
| `queue` | JSONB | Full queue array. |
| `current_track` | JSONB | Currently playing track object. |
| `current_queue_index` | INTEGER | Index in `queue`. |
| `paired_tvs` | JSONB | Array of `{ id, label }` TV objects. |
| `play_history` | JSONB | Last N played tracks. |

### `requests` table
`{ id UUID, session_id TEXT, track JSONB, requester TEXT, status TEXT, created_at TIMESTAMP }`
Status values: `'pending'`, `'approved'`, `'rejected'`.

### `playlists` table
`{ uuid UUID, user_id UUID, id TEXT, name TEXT, source TEXT, images JSONB, is_custom BOOLEAN }`
Protected by RLS: `auth.uid() = user_id`.

### `youtube_blocked_videos` table
`{ video_id TEXT }` — global blacklist of broken YouTube IDs. All hosts contribute to and read from it.

### Key RPCs
| RPC | Purpose |
|---|---|
| `sync_host_config(p_session_id, p_secret, p_updates)` | JSONB patch upsert for all session state |
| `host_takeover_session(p_session_id, p_active_instance_id, p_secret)` | Claim session ownership, returns `host_secret` |
| `manage_request(p_request_id, p_session_id, p_secret, p_new_status)` | Approve/reject guest request |
| `create_guest_access(p_session_id, p_qr_token)` | Exchange QR token for 6h personal access token |
| `submit_guest_request(p_session_id, p_guest_token, p_track, p_requester)` | Rate-limited request submission |

---

## 10. Security Model

1. **`hostSecret` = RLS Bypass Key.** Never broadcast it. Never put it in a Realtime channel payload. It goes only in RPC `p_secret` arguments (encrypted in transit via HTTPS).
2. **RLS on `sessions` and `requests`:** Public SELECT + INSERT only. All mutations are via `SECURITY DEFINER` RPCs that validate the secret.
3. **Admin QR URL:** Contains `?session=...&admin={hostSecret}`. The UI hides it behind warnings. Never display this URL to guests.
4. **`isAdminMode`:** When true, the device only sends commands — it does not push queue state. The main host executes commands received via `playback_command`.
5. **Kickout logic:** `active_instance_id` prevents two main-host sessions from coexisting. If it changes in Supabase and differs from the current tab's ID, the old tab logs out immediately.

---

## 11. TV Display Architecture (`TVDisplayPage.jsx`)

The TV display is a self-contained page at `/tv` that works **without** a user account. It uses the same dual-buffer crossfade architecture as the host's `useYouTubeSDK.js`.

**Pairing flow:** TV generates a 6-digit PIN and listens on `tv-pair-{PIN}` Supabase channel. Host sends pairing via the same channel.

**`handleSync(data)`:**
- If `data.videoId !== currentVideoIdRef.current`: new video incoming.
  - If active player is PLAYING: triggers crossfade → shows `isLoadingVideo` overlay to hide old video during buffering. Overlay auto-dismisses on buffer PLAYING (or 8s safety timeout).
  - Otherwise: loads directly or cues.
- Same video: seek correction + play/pause sync.

**Error handling on TV:**
- Buffer player error: abort transition silently, keep active player visible, notify host via `SLAVE_ERROR`.
- Active player error (100/101/150): clear `currentVideoId` → show neutral waiting screen (not "searching alternative" — audience doesn't need to know). Notify host via `SLAVE_ERROR`.

---

## 12. Playback Mode System (Normal / Karaoke / Lyrics)

These modes are **mutually exclusive** (`setKaraokeEnabled(true)` auto-disables `lyricsEnabled`).

| Mode | YouTube Search Suffix |
|---|---|
| `normal` | Native YouTube ID used directly (no search needed for YT tracks) |
| `lyrics` | `"[artist name] [song name] LYRICS NO COPYRIGHT"` |
| `karaoke` | `"[artist name] [song name] KARAOKE ORIGINAL WITH LYRICS NO COPYRIGHT"` |

**Cache key format:** `yt_bridge_{trackId}_{mode}` in `localStorage`.

**Preload worker behavior:** In `normal` mode, only Spotify-sourced tracks need preloading. In `karaoke` or `lyrics` mode, **every track** in the upcoming 5-track window is searched and cached.

**Fallback cascade in `playEngineTrack`:**
```
karaoke not found → retry with 'lyrics'
lyrics not found  → retry with 'normal'
normal not found  → show toast + skip to next track
```

---

## 13. Critical Patterns & Gotchas

### Anti-spam for queue skips
`checkSkipSpam()` in `usePlayerStore` limits to 5 skips per 5 minutes. Exceeding it triggers a 10-minute cooldown.

### `isRemoteUpdate` flag in `useQueueSync`
When state is applied from Supabase (remote update), `isRemoteUpdate.current = true` prevents the Zustand subscriber from pushing that state BACK to Supabase (infinite loop guard).

### `_currentPlayExecId` race condition guard
`playEngineTrack` sets a unique execution ID at start. After the async `resolveYouTubeVideoId` call, if `_currentPlayExecId` has changed (user skipped), the current invocation aborts silently.

### Progress is NOT written to Supabase via `sync_host_config`
Progress syncs via Realtime broadcast (`playback_sync`) every 5 seconds. Writing it via the full RPC every second would be prohibitively expensive.

### `supabase.rpc()` returns `PostgrestBuilder`, not a native Promise
It is thenable but **does not have `.catch()`**. Always use `await` inside a `try/catch` block, or `.then(null, handler)`. Never `.catch()` directly on the result.

### YouTube player `stopVideo()` vs `currentYtIdRef`
`stopVideo()` halts the iframe but the video remains loaded. If `playVideo()` is called afterwards (even with `currentTrack: null`), it replays. The `handlePlayPause` in `PersistentPlayer.jsx` guards against this: if `currentTrack` is null, it attempts `shiftQueue()` instead of calling `playVideo()`.

### `bq-settings` Zustand persist key
`hostSecret` is explicitly excluded via `partialize`. Any new security-sensitive field added to `useSettingsStore` must also be excluded there.

---

## 14. File Map (Quick Reference)

```
src/
├── App.jsx                          # Root: sets engine='youtube', PWA prompt, Toaster
├── router/index.jsx                 # React Router route definitions
├── store/
│   ├── usePlayerStore.js            # Queue, playback, YouTube IDs, preload worker
│   ├── useSettingsStore.js          # Session config, hostSecret, karaoke/lyrics modes
│   ├── useAuthStore.js              # Supabase auth user state
│   └── useLanguageStore.js          # All UI string translations (i18n)
├── hooks/
│   ├── useQueueSync.js              # ⚠️ Bidirectional Supabase ↔ Zustand sync
│   ├── useYouTubeSDK.js             # YouTube dual-buffer player, crossfade, virtual proxy
│   ├── useTVBroadcast.js            # TV sync broadcasting from host
│   ├── useEnairoSelector.js         # AI song injection (envAIro Selector)
│   ├── useAutoQueue.js              # Request auto-evaluation (envAIro Filter)
│   ├── useAvailability.js           # Session open/closed window logic
│   └── useInactivityTimeout.js      # Auto-logout on inactivity
├── pages/
│   ├── DashboardPage.jsx            # Main host UI
│   ├── GuestPage.jsx                # Guest song request UI (token-gated)
│   ├── TVDisplayPage.jsx            # TV slave display (dual-buffer YouTube player)
│   ├── SettingsPage.jsx             # All host settings
│   ├── MetricsPage.jsx              # Analytics from requests table
│   └── LoginPage.jsx                # Host authentication
├── components/
│   ├── layout/
│   │   ├── PersistentPlayer.jsx     # Bottom player bar (host UI)
│   │   ├── RootLayout.jsx           # Auth wrapper, settings hydration, TV migration
│   │   ├── Sidebar.jsx              # Navigation sidebar
│   │   └── BackgroundVideo.jsx      # Ambient background for login/guest
│   ├── qr/
│   │   └── QRCard.jsx               # QR code display using static qr_token
│   ├── tv/
│   │   └── TVPairingModal.jsx        # Host-side TV pairing UI
│   └── dashboard/
│       └── CastToTvModal.jsx         # Send cast to TV modal
└── lib/
    ├── supabase.js                   # Supabase client init
    ├── youtubeApi.js                 # YouTube Data API search
    └── autoDJ.js                     # evaluate-request Edge Function caller
```

---

## 15. Instructions for the AI

1. **Before modifying any playback state logic**, read `useQueueSync.js` and `useYouTubeSDK.js` in full. State changes in the wrong layer cause infinite sync loops or race conditions.
2. **Before modifying queue or track logic**, verify `shiftQueue()`, `addToQueue()`, and the `isRemoteUpdate` guard are not disrupted.
3. **All RPC calls** to `sync_host_config` must use `await` inside `try/catch`, not `.catch()` chaining.
4. **Any error state on the YouTube player** should hide the `#youtube-wrapper` via `wrapper.dataset.errorHidden = 'true'` + `applyStyles()` before doing anything else.
5. **Karaoke and lyrics modes** affect the preload worker AND the fallback cascade — both must be considered when touching `resolveYouTubeVideoId` or `startQueuePreloadWorker`.
6. **TV slave error handling** must never show error text to the audience. On fatal errors, switch to the neutral waiting screen and notify the host silently.
7. **Do not persist `hostSecret`** to any form of browser storage.
8. **Use `grep_search` liberally** before writing new functions — similar utilities often already exist.
9. **New UI strings** → add to `useLanguageStore.js` in both `es-419` and `en` blocks.
10. **Skip Spam protection** is in `checkSkipSpam()` inside `usePlayerStore` — call it before any user-triggered skip action.
