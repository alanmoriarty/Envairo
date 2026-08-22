# envAIro — AI Context Document (Single Source of Truth)

This document is the authoritative reference for any AI assistant or developer working on the envAIro codebase. Read this before writing any code. It reflects the current production state of the application.

---

## 1. Project Overview

**envAIro** is a collaborative, real-time jukebox PWA. A **Host** creates a music session on their device (PC or tablet connected to speakers), displays a QR code, and **Guests** scan it to request songs from their phones.

The application features an intelligent dual-AI DJ system:
1. **envAIro Filter (Auto-DJ & Rule Evaluator):** Evaluates incoming requests in real-time, enforcing blacklists, genre matching, explicit content blocks, artist rotation cooldowns, song repeat cooldowns, and smart insertion offsets.
2. **envAIro Selector (Gemini AI Music Director):** Curates automated music sets based on the host's natural language vibe prompt and harmonizes playback queues for seamless energy transitions.

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
| i18n | Dual-dictionary implementation via `useLanguageStore.js` (`es-419` / `en`) |
| Notifications | `sonner` (toast library) |
| PWA | `vite-plugin-pwa` |

---

## 3. Absolute Rules (Never Break These)

### 3.1 Zero Google / YouTube API Key Consumption
All YouTube searches, playlist imports, video details, and karaoke/lyrics bridge resolutions are handled through **Piped decentralized nodes** and **Webshare residential proxies** (`api/youtube-search.js`, `api/youtube-playlist.js`, `api/youtube-details.js`). Never reintroduce direct calls to `googleapis.com/youtube/v3` or hardcode Google Data API tokens.

### 3.2 Proxied Catalog Search for Host & Guest
All song search queries in `AddSongModal.jsx` and `GuestPage.jsx` route through `searchMusicCatalog` in `src/lib/musicApi.js` (which queries `/api/music-search` with FIFO caching and Supabase Edge Function fallback). This guarantees rich Spotify-like metadata (exact artists, official tracks, high-res covers, durations) without quota limits.

### 3.3 Supabase RPC Over Direct Table Mutations
The `sessions` and `requests` tables have **no public UPDATE/DELETE policies**. All writes from the host and guest must go through secure RPCs:
- `sync_host_config(p_session_id, p_secret, p_updates)` — JSONB patch-style upsert for session state.
- `submit_guest_request(p_session_id, p_track, p_requester, p_guest_token)` — Submits a song request with server-side validation.
- `manage_request(p_request_id, p_session_id, p_secret, p_new_status)` — Host approves/rejects a guest request.
- Direct table inserts are blocked on `requests`. Never call `.update()` or `.delete()` on these tables from the client.

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
| **Guest** | Anonymous user who scanned the QR. Can search songs and submit requests. Validated via individual guest access tokens with configurable expiry (`create_guest_access`). |
| **TV Display** | Anonymous browser on a Smart TV (`/tv/:sessionId`). Authenticated via `bq-tv-session-id` and `PIN`. Receives video sync via Supabase Realtime broadcast channel `tv-sync-{sessionId}` and local `BroadcastChannel`. |

---

## 5. State Management: Zustand Stores

### `usePlayerStore.js` (`src/store/usePlayerStore.js`)
The playback engine's brain. Persisted as `'bq-player'`.

**Key state:**
- `currentTrack` — The currently playing track object `{ id, name, artists, uri, source, queueId }`. Persisted in `partialize` for synchronous refresh recovery.
- `queue` — Array of track objects with unique `queueId` (`${id}-${Date.now()}-${i}`).
- `currentQueueIndex` — Index of the playing track in `queue`. `-1` means nothing is playing.
- `playbackMinutes` — Accumulated playback minutes, used to trigger periodic queue harmonization.
- `isPlaying` — Boolean. Reflects the YouTube player's actual play state.
- `progress` / `duration` — Integers in milliseconds.
- `youtubePlayer` — The Virtual Player Proxy object set by `useYouTubeSDK`.
- `currentYtId` — The YouTube video ID currently loaded in the active iframe.
- `failedYouTubeIds` — Blacklist of YouTube IDs that triggered playback errors.

**Key actions:**
- `playEngineTrack(track, progressMs, forceMode, autoplay)` — Main playback entry point with fallback cascade: `karaoke → lyrics → normal → skip`.
- `resolveYouTubeVideoId(track, forceMode)` — Resolves YouTube ID with localStorage cache (`yt_bridge_{trackId}_{mode}`).
- `shiftQueue()` — Advances `currentQueueIndex` by 1 and returns the next track. Trims queue head if index exceeds 10.
- `addToQueue(track)` — Inserts track into queue and auto-starts playback if idle.

---

### `useSettingsStore.js` (`src/store/useSettingsStore.js`)
Host configuration and session identity. Persisted as `'bq-settings'`.

**Key state:**
- `sessionId` — The Supabase `sessions.id`.
- `hostSecret` — `crypto.randomUUID()` bypass key for RLS-protected RPCs (**in memory only**).
- `alwaysAvailable` — Master switch controlling whether guest song requests are open (`active = true`) or closed (`active = false`).
- `repeatCooldown` — Track repeat cooldown (`-1` = allow always, `30`, `60`, `120`, `0` = whole session).
- `artistRepeatCooldown` — Artist repeat cooldown (`-1` = allow always, `15`, `30`, `45`, `60`, `120`, `0` = whole session).
- `guestSessionExpiryHours` — Duration of guest QR access (`2`, `4`, `6`, `8`, `12`, `24` hours).
- `partyRequestOffset` — Guest request insertion position (`1` = next song, up to `20`).
- `enairoAutoReorderEnabled` / `enairoAutoReorderIntervalMinutes` — Periodic AI queue harmonization settings (`30`, `45`, `60`, `90` minutes).
- `enairoReorderCooldownUntil` / `enairoAutoReorderCount` — Anti-abuse controls for queue harmonization (5 min cooldown, max 5 runs/day).
- `karaokeEnabled` / `lyricsEnabled` — Mutually exclusive playback modes.
- `autoDJ` — Enables envAIro Filter.

---

## 6. AI DJ Architecture

### 6.1 envAIro Filter (`src/lib/autoDJ.js`)
Autonomous rule evaluator running on the host and guest sides:
1. **Genre Whitelist / Blacklist:** Matches track genres against permitted/forbidden families.
2. **Song & Artist Blacklists:** Checks normalized title and artist strings.
3. **Explicit Content Filter (`explicitFilter`):** Rejects songs flagged as explicit.
4. **Artist Repeat Cooldown (`artistRepeatCooldown`):**
   - Normalizes and splits multi-artist strings (`'Shakira, Bizarrap'`).
   - Checks both active queue (no duplicate artists in upcoming queue) and `playHistory` timestamps against the cooldown window.
5. **Track Repeat Cooldown (`repeatCooldown`):** Prevents the same track ID from being requested within the cooldown duration.
6. **Smart Insertion Offset (`partyRequestOffset`):** Inserts approved requests at `currentQueueIndex + offset` instead of the end of the queue.

---

### 6.2 envAIro Selector (`supabase/functions/enairo-selector/index.ts` & `src/hooks/useEnairoSelector.js`)
Gemini AI Music Director that curates and maintains the vibe:
1. **Catalog Auto-Curation:** Generates track batches matching the host's natural language vibe prompt and guest metrics.
2. **Harmonize Queue (`autoReorderQueue`):**
   - **Active & Past Song Immunity:** Slices strictly `upcomingQueue = queue.slice(currentQueueIndex + 1)`. The currently playing track and history are 100% immutable.
   - **Guest Request Protection:** Gemini prompt and client guards strictly forbid deleting songs requested by guests (`requestedBy`).
   - **Anti-Abuse Shielding:** Enforces a 5-minute cooldown (`enairoReorderCooldownUntil`) and a daily maximum limit of 5 runs/day (`enairoAutoReorderCount`).
   - **Harmonize Modal & Automation:** Clicking "Armonizar Cola" displays a confirmation modal with on-demand execution and background periodic automation options (30, 45, 60, 90 min).

---

## 7. Multi-Layer Security & Server-Side Enforcement

All request limits, timeouts, and validations are enforced in PostgreSQL via `submit_guest_request` with `SECURITY DEFINER`:

```
                                [ GUEST SONG REQUEST FLOW ]
                                             │
                                             ▼
                             1. Guest scans QR code
                                (`create_guest_access`)
                                             │
                                             ▼
                     2. Receives individual UUID token in `guest_access`
                        (Configurable expiry: 2h, 4h, 6h, 8h, 12h, 24h)
                                             │
                                             ▼
                     3. Submits request via `submit_guest_request` RPC
                                             │
        ┌────────────────────────────────────┼────────────────────────────────────┐
        ▼                                    ▼                                    ▼
[ Token & Expiry Check ]             [ Cooldown & Limits ]               [ Session Status ]
• `p_guest_token` is MANDATORY       • Server cooldown (`last_request_at`) • `sessions.active = true`
• Token must exist in DB             • Per-guest limit (`requests_per_guest`) • Rejects if closed
• Token must not be expired          • Hourly limit (`requests_per_hour`)
```

### Server Error Codes:
- `MISSING_GUEST_TOKEN` — Request sent without a valid QR token (blocks API bypasses).
- `INVALID_TOKEN` — Token does not belong to the session.
- `TOKEN_EXPIRED` — Guest token exceeded `guest_session_expiry_hours`.
- `COOLDOWN_ACTIVE` — Guest submitted before `cooldown_minutes` elapsed (enforced via `last_request_at` in DB).
- `GUEST_LIMIT_REACHED` — Guest exceeded `requests_per_guest` quota.
- `HOURLY_LIMIT_REACHED` — Session exceeded `requests_per_hour`.
- `SESSION_NOT_FOUND` — Session does not exist or requests are closed (`active = false`).

---

## 8. Serverless API Endpoints (`api/`)

| Endpoint | Purpose | Upstream Provider |
|---|---|---|
| `/api/youtube-search` | Search YouTube videos with query & limit | Piped decentralized instances + Webshare Residential Proxies |
| `/api/youtube-playlist` | Scrapes YouTube playlists (`PL...`) and Mixes (`RD...`) | Piped decentralized instances + Webshare Residential Proxies |
| `/api/youtube-details` | Retrieves ISO 8601 duration & high-res thumbnail | Piped API stream details + Webshare scraper |
| `/api/music-search` | Spotify-like structured song search for Host & Guest | Webshare Residential Proxies + Deezer/iTunes fallback |

---

## 9. GPU & Memory Optimization Standards

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
