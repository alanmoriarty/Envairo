import { supabase } from './supabase';

// ── Google/YouTube OAuth 2.0 Config ─────────────────────────────────────
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'email',
  'profile'
].join(' ');

export async function redirectToYouTubeAuth() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: YOUTUBE_SCOPES,
      redirectTo: `${window.location.origin}/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent'
      }
    }
  });

  if (error) {
    console.error('Error logging in with Supabase/Google:', error);
    throw error;
  }
}

export function getYouTubeAccessToken() {
  return localStorage.getItem('youtube_access_token');
}

export async function refreshYouTubeToken() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  
  if (data?.session?.provider_token) {
    localStorage.setItem('youtube_access_token', data.session.provider_token);
    localStorage.setItem('youtube_token_expires_at', (Date.now() + 3600 * 1000).toString());
    return data.session;
  }
  
  throw new Error('No provider token found in refreshed session');
}

export function isYouTubeTokenExpired() {
  const expiresAt = localStorage.getItem('youtube_token_expires_at');
  if (!expiresAt) return true; // If no token, consider it expired to force re-auth or prevent API calls
  return Date.now() > parseInt(expiresAt, 10) - 180000;
}
