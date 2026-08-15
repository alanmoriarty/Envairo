# envAIro — AI Context Document (Single Source of Truth)

This document is the authoritative reference for any AI assistant or developer working on the envAIro codebase. Read this before writing any code. It reflects the current production state of the application.

---

## 1. Project Overview

**envAIro** is a collaborative, real-time jukebox PWA. A **Host** creates a music session on their device (PC or tablet connected to speakers), displays a QR code, and **Guests** scan it to request songs from their phones.

The application features an AI DJ system (**envAIro Filter** + **envAIro Selector**) that evaluates incoming requests and autonomously manages the music queue.

**Deployment:** Vercel (static SPA + API routes). Database & Auth: Supabase.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Routing | React Router DOM v6 |
| Styles | Tailwind CSS with custom CSS variables (hardware-accelerated glassmorphism) |
| Global State | Zustand (with `persist` middleware for localStorage) |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| Serverless Proxies | Node.js Vercel API Routes with `https-proxy-agent` (Webshare residential proxies + Piped decentralized nodes) |
| Playback Engine | **YouTube Iframe API** (exclusive — no Spotify Web Playback SDK) |
| Music Catalog | Proxied Spotify-formatted search (`/api/music-search` via Webshare + Deezer/iTunes) |
| i18n | Manual implementation via `useLanguageStore.js` |
| Notifications | `sonner` (toast library) |
| PWA | `vite-plugin-pwa` |

---

## 3. Absolute Rules (Never Break These)

### 3.1 Zero Google / YouTube API Key Consumption
All YouTube searches, playlist imports, video details, and karaoke/lyrics bridge resolutions are handled through **Piped decentralized nodes** and **Webshare residential proxies** (`api/youtube-search.js`, `api/youtube-playlist.js`, `api/youtube-details.js`). Never reintroduce direct calls to `googleapis.com/youtube/v3` or hardcode Google Data API tokens.

### 3.2 Proxied Catalog Search for Host & Guest
All song search queries in `AddSongModal.jsx` and `GuestPage.jsx` route through `searchMusicCatalog` in `src/lib/musicApi.js` (which queries `/api/music-search` with FIFO caching and Supabase Edge Function fallback). This guarantees rich Spotify-like metadata (exact artists, official tracks, high-res covers, durations) without quota limits.

### 3.3 Supabase RPC Over Direct Table Mutations
The `sessions` and `requests` tables have **no public UPDATE/DELETE policies**. All writes from the host must go through:
- `sync_host_config(p_session_id, p_secret, p_updates)` — JSONB patch-style upsert for session state.
- `manage_request(p_request_id, p_session_id, p_secret, p_new_status)` — approve/reject a guest request.
- Direct table inserts are only allowed for `SELECT` (everyone) and `INSERT` (anyone). Never call `.update()` or `.delete()` on these tables from the client.

### 3.4 `hostSecret` Must Not Be Persisted to localStorage
`hostSecret` is excluded from Zustand's `persist` middleware via `partialize`. It lives **in memory only** between page reloads. On reload it is recovered from Supabase via `host_takeover_session()` RPC inside `useQueueSync.js`. Never move `hostSecret` back into the persisted state.

### 3.5 All Text Must Be in `useLanguageStore.js`
Any user-facing string must be registered via the `t('key')` function from `useLanguageStore`. The store is in `src/store/useLanguageStore.js`. Add new keys to all supported languages (`es-419` and `en`).

### 3.6 Authentication: Email + Password Only
No OAuth providers. Supabase Auth manages host login via `supabase.auth.signInWithPassword()`. No Google, GitHub, or Spotify login flows.

---

## 4. Application Roles & Modes

| Role | Description |
|---|---|
| **Host (Main)** | Authenticated user on the primary device. Runs `PersistentPlayer`, `useYouTubeSDK`, `useQueueSync`, `useTVBroadcast`, `useEnairoSelector`. Owns the session. |
| **Host (Remote Control)** | The host logs in from a secondary device (phone). Enters `isAdminMode = true`. Sends playback commands via `sync_host_config` → `playback_command` field. Cannot play audio directly. |
| **Guest** | Anonymous user who scanned the QR. Can search songs and submit requests. Validated via individual 6-hour guest access tokens (`create_guest_access`). |
| **TV Display** | Anonymous browser on a Smart TV (`/tv/:sessionId`). Authenticated via `bq-tv-session-id` and `PIN`. Receives video sync via Supabase Realtime broadcast channel `tv-sync-{sessionId}` and local `BroadcastChannel`. |

---

## 5. State Management: Zustand Stores

### `usePlayerStore.js` (`src/store/usePlayerStore.js`)
The playback engine's brain. Persisted as `'bq-player'`.

**Key state:**
- `currentTrack` — The currently playing track object `{ id, name, artists, uri, source, queueId }`. Persisted in `partialize` for synchronous refresh recovery.
- `queue` — Array of track objects with unique `queueId` (`${id}-${Date.now()}-${i}`).
- `currentQueueIndex` — Index of the playing track in `queue`. `-1` means nothing is playing.
- `isPlaying` — Boolean. Reflects the YouTube player's actual play state.
- `progress` / `duration` — Integers in milliseconds. `progress` is updated by the progress timer in `useYouTubeSDK`.
- `youtubePlayer` — The **Virtual Player Proxy** object. Set by `useYouTubeSDK` after initialization.
- `currentYtId` — The YouTube video ID currently loaded in the active player iframe.
- `failedYouTubeIds` — Blacklist of YouTube IDs that triggered playback errors. Uploaded to `youtube_blocked_videos`.
- `preloadWorkerRunning` — Guard flag to prevent concurrent preload workers.

**Key actions:**
- `playEngineTrack(track, progressMs, forceMode, autoplay)` — Main playback entry point. Resolves YouTube video ID dynamically via `resolveYouTubeVideoId`, updates `currentTrack` & `currentYtId`, and commands `get().youtubePlayer.loadVideoById`. Implements fallback cascade: `karaoke → lyrics → normal → skip`.
- `resolveYouTubeVideoId(track, forceMode)` — Resolves the correct YouTube ID for a given track and mode. Returns `{ videoIdToPlay, isSpotifyTrack, effectiveMode }`. Uses localStorage cache (`yt_bridge_{trackId}_{mode}`).
- `shiftQueue()` — Advances `currentQueueIndex` by 1 and returns the next track. Trims queue head if index exceeds 10.
- `startQueuePreloadWorker()` — Asynchronously pre-resolves YouTube IDs for the next 5 tracks in the queue.
- `addToQueue(track)` — Inserts track into queue, triggers preload, and auto-starts playback if the player is idle.

---

### `useSettingsStore.js` (`src/store/useSettingsStore.js`)
Host configuration and session identity. Persisted as `'bq-settings'`.

**Key state:**
- `sessionId` — The Supabase `sessions.id`. Defaults to `session-${Date.now()}` on first load. Overwritten by `user.id` if the host is authenticated.
- `hostSecret` — `crypto.randomUUID()` bypass key for RLS-protected RPCs. **NOT persisted** (see `partialize`).
- `isAdminMode` — `true` when the current device is acting as a remote control.
- `karaokeEnabled` / `lyricsEnabled` — **Mutually exclusive**. Setting one auto-disables the other. Alters YouTube search suffix.
- `autoDJ` — Enables the Auto DJ (envAIro Filter) for autonomous request approval.
- `pairedTvs` — Array of paired TV objects `{ id, name, linkedAt, soundEnabled }`. Synced to `sessions.paired_tvs`.

---

## 6. Hooks & Realtime Architecture

### `useQueueSync.js`
**Purpose:** Bidirectional real-time sync between local Zustand state and Supabase.
1. **Push (local → Supabase):** Debounced by **120ms** to push queue, current track, history, and paired TVs via `sync_host_config`.
2. **Pull (Supabase → local):** Listens to `postgres_changes` on `sessions`. Applies remote state and processes `playback_command` actions (`play`, `pause`, `restart`, `set_volume`, `play_specific`).
3. **Playback Broadcast (`playback_sync`):** Emits immediate broadcast on play/pause/ended state changes and a 1000ms pulse for progress synchronization with remote controls.
4. **Initial Pull on Mount:** Hydrates store from Supabase `sessions` and starts playback with `autoplay: true`.

---

### `useYouTubeSDK.js`
**Purpose:** Manages the floating PiP YouTube Iframe Player with zero-overhead GPU compositing.
1. **Floating PiP (240x135px) & Fullscreen (1080p):**
   - PiP mode sets `suggestedQuality: 'medium'` (360p/480p) to conserve RAM buffer.
   - Fullscreen expands to 100vw/100vh with `suggestedQuality: 'hd1080'`.
2. **Instant State Broadcast:** Fires `playback_sync` immediately upon `PLAYING`, `PAUSED`, or `ENDED` events.
3. **Autoplay on Refresh:** Resolves active track and starts playback reliably upon SDK `onReady`.

---

### `useTVBroadcast.js`
**Purpose:** Synchronizes Smart TVs connected locally via `BroadcastChannel('envairo_tv_sync')` and over the Internet via Supabase Realtime channel `tv-sync-{sessionId}`.
- Handles time sync drift correction (`seekTo` / `setPlaybackRate`).
- Listens to `SLAVE_UNPAIRED` events to immediately remove unlinked TVs from the host dashboard.

---

## 7. Serverless API Endpoints (`api/`)

| Endpoint | Purpose | Upstream Provider |
|---|---|---|
| `/api/youtube-search` | Search YouTube videos with query & limit | Piped decentralized instances + Webshare Residential Proxies |
| `/api/youtube-playlist` | Scrapes YouTube playlists (`PL...`) and Mixes (`RD...`) | Piped decentralized instances + Webshare Residential Proxies |
| `/api/youtube-details` | Retrieves ISO 8601 duration & high-res thumbnail | Piped API stream details + Webshare scraper |
| `/api/music-search` | Spotify-like structured song search for Host & Guest | Webshare Residential Proxies + Deezer/iTunes fallback |

---

## 8. GPU & Memory Optimization Standards

1. **No CSS Blur Shaders on Dynamic/Large Elements:**
   - Avoid `backdrop-blur` and heavy `filter: blur(...)` on full-viewport backgrounds (`BackgroundVideo.jsx`, `VisualizerBackground.jsx`). Use pure `radial-gradient` color ramps and translucent alpha layers (`bg-bg-card/90`, `bg-bg-elevated/80`).
2. **Hardware Compositing:**
   - Apply `transform: translateZ(0)` and `willChange: opacity` to fixed background elements.
3. **Lazy Image Loading:**
   - All song cover images in queues render with `loading="lazy"` and `decoding="async"`.
4. **RAM Buffer Caps:**
   - `searchCache` in `youtubeApi.js` capped at 50 items.
   - `searchMemoryCache` in `musicApi.js` capped at 60 items.
   - `playHistory` capped at 100 items in memory.

---

## 9. QR Guest Access System

1. Host QR contains a permanent `?t={qr_token}` URL parameter.
2. When a guest scans the QR, `GuestPage.jsx` calls `create_guest_access(p_session_id, p_qr_token)`.
3. The guest receives an individual **6-hour personal access token** (`gat_{sessionId}`) stored in `localStorage`.
4. Each request submitted validates the guest token on the database level (`submit_guest_request`).
5. Re-scanning a QR always refreshes and extends the 6-hour window.

---

## 10. Playback Mode System (Normal / Karaoke / Lyrics)

| Mode | YouTube Search Suffix |
|---|---|
| `normal` | Native video ID or clean artist/title search |
| `lyrics` | `"[artist] [song] LETRA LYRICS NO COPYRIGHT"` |
| `karaoke` | `"[artist] [song] KARAOKE ORIGINAL WITH LYRICS NO COPYRIGHT"` |

**Fallback cascade in `playEngineTrack`:**
```
karaoke not found → retry with 'lyrics'
lyrics not found  → retry with 'normal'
normal not found  → show toast + skip to next track
```
