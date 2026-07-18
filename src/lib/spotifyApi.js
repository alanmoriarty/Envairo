import { getValidToken } from './spotifyAuth';

const BASE = 'https://api.spotify.com/v1';

async function apiFetch(path, options = {}) {
  const token = await getValidToken();
  if (!token) throw new Error('No auth token');

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    throw new Error('UNAUTHORIZED');
  }
  if (!res.ok) {
    const text = await res.text();
    let err;
    try {
      err = JSON.parse(text);
    } catch {
      err = {};
    }
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    console.warn('API returned non-JSON:', text);
    return text;
  }
}

// ── User ─────────────────────────────────────────────────────────────────────
export async function getCurrentUser() {
  return apiFetch('/me');
}

export async function getUserPlaylists(limit = 20) {
  return apiFetch(`/me/playlists?limit=${limit}&_t=${Date.now()}`, { cache: 'no-store' });
}

export async function getPlaylistTracks(playlistId, limit = 100, offset = 0) {
  return apiFetch(`/playlists/${playlistId}/items?limit=${limit}&offset=${offset}`);
}

export async function getPlaylist(playlistId) {
  return apiFetch(`/playlists/${playlistId}`);
}

export async function getArtists(ids) {
  const params = new URLSearchParams({ ids: ids.join(',') });
  return apiFetch(`/artists?${params}`);
}

export async function getArtist(id) {
  return apiFetch(`/artists/${id}`);
}

export async function searchArtists(query, limit = 1) {
  const params = new URLSearchParams({ q: query, type: 'artist', limit });
  return apiFetch(`/search?${params}`);
}

// ── Search ────────────────────────────────────────────────────────────────────
export async function searchTracks(query, limit = 8) {
  const params = new URLSearchParams({ q: query, type: 'track', limit });
  return apiFetch(`/search?${params}`);
}

// ── Player ────────────────────────────────────────────────────────────────────
export async function getPlaybackState() {
  return apiFetch('/me/player');
}

export async function transferPlayback(deviceId, play = true) {
  return apiFetch('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play }),
  });
}

export async function playTrack(deviceId, uris, positionMs = 0) {
  const body = { uris };
  if (positionMs > 0) {
    body.position_ms = positionMs;
  }
  return apiFetch(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function playContext(deviceId, contextUri) {
  return apiFetch(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ context_uri: contextUri }),
  });
}


export async function pausePlayback(deviceId) {
  return apiFetch(`/me/player/pause?device_id=${deviceId}`, { method: 'PUT' });
}

export async function resumePlayback(deviceId) {
  return apiFetch(`/me/player/play?device_id=${deviceId}`, { method: 'PUT' });
}

export async function skipToNext(deviceId) {
  return apiFetch(`/me/player/next?device_id=${deviceId}`, { method: 'POST' });
}

export async function skipToPrevious(deviceId) {
  return apiFetch(`/me/player/previous?device_id=${deviceId}`, { method: 'POST' });
}

export async function seekToPosition(positionMs, deviceId) {
  return apiFetch(
    `/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`,
    { method: 'PUT' }
  );
}

export async function setVolume(volumePercent, deviceId) {
  return apiFetch(
    `/me/player/volume?volume_percent=${volumePercent}&device_id=${deviceId}`,
    { method: 'PUT' }
  );
}

export async function getQueue() {
  return apiFetch('/me/player/queue');
}

export async function getAvailableDevices() {
  return apiFetch('/me/player/devices');
}

// ── Auto DJ ───────────────────────────────────────────────────────────────────
export async function getArtistTopTracks(artistId) {
  return apiFetch(`/artists/${artistId}/top-tracks?market=US`);
}


export async function getTracks(ids) {
  const params = new URLSearchParams({ ids: ids.join(',') });
  return apiFetch(`/tracks?${params}`);
}
