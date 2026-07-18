import { supabase } from './supabase';

// ── Spotify OAuth 2.0 Config ───────────────────────────────────────────
export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-modify-public',
  'playlist-modify-private',
  'playlist-read-private',
  'playlist-read-collaborative'
].join(' ');

export async function redirectToSpotifyAuth(showDialog = true) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'spotify',
    options: {
      scopes: SPOTIFY_SCOPES,
      redirectTo: `${window.location.origin}/callback`,
      queryParams: showDialog ? { show_dialog: 'true' } : {}
    }
  });

  if (error) {
    console.error('Error logging in with Supabase/Spotify:', error);
    throw error;
  }
}

export function getAccessToken() {
  return localStorage.getItem('spotify_access_token');
}

export async function refreshSpotifyToken() {
  // Supabase refreshes the session automatically on auth state change.
  // We can explicitly refresh the session if needed:
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  
  if (data?.session?.provider_token) {
    localStorage.setItem('spotify_access_token', data.session.provider_token);
    return data.session;
  }
  throw new Error('No provider token found in refreshed session');
}

export function isTokenExpired() {
  // Con Supabase, la sesión se maneja automáticamente
  return false; 
}

export async function logoutSpotify() {
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_expires_at');
  sessionStorage.removeItem('spotify_code_verifier');
  await supabase.auth.signOut();
}

export async function getValidToken() {
  if (isTokenExpired()) {
    try {
      await refreshSpotifyToken();
    } catch {
      localStorage.clear();
      return null;
    }
  }
  return getAccessToken();
}

export function clearSpotifyTokens() {
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_expires_at');
  sessionStorage.removeItem('spotify_code_verifier');
  supabase.auth.signOut().catch(console.error);
}
