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
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ── User ─────────────────────────────────────────────────────────────────────
export async function getCurrentUser() {
  return apiFetch('/me');
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

export async function playTrack(deviceId, uris) {
  return apiFetch(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ uris }),
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
