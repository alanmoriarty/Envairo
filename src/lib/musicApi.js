/**
 * Cliente de búsqueda de catálogo musical
 * Consulta nuestro endpoint serverless (/api/music-search) respaldado por proxies residenciales Webshare.
 * Si falla, tiene fallback automático a la función edge search-spotify de Supabase.
 */
import { supabase } from './supabase';

const searchMemoryCache = new Map();
const MAX_CACHE = 60;

export async function searchMusicCatalog(query, limit = 12, filterExplicit = false) {
  if (!query || query.trim().length === 0) return [];
  const cleanQ = query.trim();
  const cacheKey = `${cleanQ}_${limit}_${filterExplicit}`;

  if (searchMemoryCache.has(cacheKey)) {
    return searchMemoryCache.get(cacheKey);
  }

  // 1. Intento primario: Endpoint proxy de backend (/api/music-search)
  try {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocal ? 'https://envairoqr.com' : window.location.origin;
    const url = new URL(baseUrl + '/api/music-search');
    url.searchParams.append('q', cleanQ);
    url.searchParams.append('limit', limit.toString());
    if (filterExplicit) url.searchParams.append('filterExplicit', 'true');

    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      const items = (data?.tracks?.items || []).map(t => ({
        id: t.id,
        uri: t.uri,
        name: t.name,
        artists: Array.isArray(t.artists) ? t.artists.map(a => a.name || a).join(', ') : (t.artists || 'Artista Desconocido'),
        image: t.album?.images?.[0]?.url || t.image || '',
        duration_ms: t.duration_ms || 0
      }));

      if (items.length > 0) {
        if (searchMemoryCache.size >= MAX_CACHE) {
          const firstKey = searchMemoryCache.keys().next().value;
          searchMemoryCache.delete(firstKey);
        }
        searchMemoryCache.set(cacheKey, items);
        return items;
      }
    }
  } catch (err) {
    console.warn('Proxy search failed, falling back to Supabase function:', err.message);
  }

  // 2. Fallback secundario: Supabase Edge Function (search-spotify)
  try {
    const { data, error } = await supabase.functions.invoke('search-spotify', {
      body: { query: cleanQ, limit, filterExplicit }
    });
    if (!error && data?.tracks?.items) {
      const items = data.tracks.items.map(t => ({
        id: t.id,
        uri: t.uri,
        name: t.name,
        artists: Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : (t.artists || 'Artista Desconocido'),
        image: t.album?.images?.[0]?.url || t.image || '',
        duration_ms: t.duration_ms || 0
      }));

      if (items.length > 0) {
        searchMemoryCache.set(cacheKey, items);
        return items;
      }
    }
  } catch (e) {
    console.error('All music search providers failed:', e);
  }

  return [];
}
