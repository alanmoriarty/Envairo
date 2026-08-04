import { supabase } from './supabase';

// ── Google/YouTube OAuth 2.0 Config ─────────────────────────────────────
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'email',
  'profile'
].join(' ');

export async function redirectToYouTubeAuth() {
  localStorage.setItem('auth_intent', 'youtube');
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

export async function openYouTubeAuthPopup() {
  localStorage.setItem('auth_intent', 'youtube');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: YOUTUBE_SCOPES,
      redirectTo: `${window.location.origin}/callback`,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent'
      }
    }
  });

  if (error) {
    console.error('Error getting Google auth URL:', error);
    throw error;
  }

  if (data?.url) {
    const width = 500;
    const height = 750;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(data.url, 'YouTubeAuth', `width=${width},height=${height},left=${left},top=${top}`);
  }
}

export function getYouTubeAccessToken() {
  return sessionStorage.getItem('youtube_access_token');
}

export async function refreshYouTubeToken() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  
  if (data?.session?.provider_token) {
    // SECURITY: Use sessionStorage instead of localStorage so the token
    // is automatically cleared when the tab closes.
    sessionStorage.setItem('youtube_access_token', data.session.provider_token);
    sessionStorage.setItem('youtube_token_expires_at', (Date.now() + 3600 * 1000).toString());
    return data.session;
  }
  
  throw new Error('No provider token found in refreshed session');
}

export function isYouTubeTokenExpired() {
  const expiresAt = sessionStorage.getItem('youtube_token_expires_at');
  if (!expiresAt) return true;
  return Date.now() > parseInt(expiresAt, 10) - 180000;
}
