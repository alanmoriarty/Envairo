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
  
  // NOTE: Supabase might not return a NEW provider_token on refreshSession 
  // depending on provider settings. If it does, we save it.
  if (data?.session?.provider_token) {
    localStorage.setItem('spotify_access_token', data.session.provider_token);
    localStorage.setItem('spotify_token_expires_at', (Date.now() + 3600 * 1000).toString());
    return data.session;
  }
  
  // If it doesn't return a new one, the token is dead. We must force re-auth.
  throw new Error('No provider token found in refreshed session');
}

export function isTokenExpired() {
  const expiresAt = localStorage.getItem('spotify_token_expires_at');
  if (!expiresAt) return false;
  // Margen de 3 minutos para renovar antes de que falle
  return Date.now() > parseInt(expiresAt, 10) - 180000;
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
      clearSpotifyTokens();
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
