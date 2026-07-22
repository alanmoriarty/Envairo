const BASE_URL = 'https://www.googleapis.com/youtube/v3';

async function ensureYouTubeToken() {
  const { isYouTubeTokenExpired, refreshYouTubeToken } = await import('./youtubeAuth');
  if (isYouTubeTokenExpired()) {
    try {
      await refreshYouTubeToken();
    } catch (e) {
      console.warn('Failed to refresh YouTube token:', e);
    }
  }
  return localStorage.getItem('youtube_access_token');
}
let activePipedInstance = null;

const searchCache = new Map();

/**
 * Busca videos en YouTube por término de búsqueda.
 * Retorna una lista formateada para ser compatible con el sistema de cola existente.
 */
export async function searchYouTubeVideos(query, limit = 8) {
  const cacheKey = `${query}_${limit}`;
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey);
  }
  
  const results = await _doSearchYouTubeVideos(query, limit);
  if (results && results.length > 0) {
    searchCache.set(cacheKey, results);
  }
  return results;
}

async function _doSearchYouTubeVideos(query, limit = 8) {
  // Ahora toda la lógica de búsqueda (Piped descentralizado + Webshare Scraper)
  // reside en nuestro backend (api/youtube-search) para no filtrar URLs en el Network tab del cliente.
  try {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocal ? 'https://envairoqr.com' : window.location.origin;
    const proxyUrl = new URL(baseUrl + '/api/youtube-search');
    proxyUrl.searchParams.append('q', query);
    proxyUrl.searchParams.append('limit', limit.toString());
    
    const res = await fetch(proxyUrl.toString());
    if (res.ok) {
      const data = await res.json();
      return data.items.map(item => ({
        id: item.id.videoId,
        uri: `youtube:${item.id.videoId}`,
        name: item.snippet.title,
        artists: item.snippet.channelTitle || 'YouTube',
        album: {
          images: [
            { url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url }
          ]
        },
        duration_ms: 0, 
        source: 'youtube'
      }));
    }
  } catch (err) {
    // console.warn('El proxy falló:', err);
  }

  throw new Error('La búsqueda está temporalmente fuera de servicio. Intenta más tarde.');
}

/**
 * Obtiene detalles adicionales de un video (como la duración real)
 */
export async function getYouTubeVideoDetails(videoId) {
  try {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocal ? 'https://envairoqr.com' : window.location.origin;
    const url = new URL(baseUrl + '/api/youtube-details');
    url.searchParams.append('id', videoId);

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.items || data.items.length === 0) return null;

    const item = data.items[0];
    
    // Convertir duración ISO 8601 (ej. PT3M2S) a milisegundos
    const durationStr = item.contentDetails.duration;
    const durationMs = parseYouTubeDuration(durationStr);

    return {
      id: item.id,
      uri: `youtube:${item.id}`,
      name: item.snippet.title,
      artists: item.snippet.channelTitle || 'YouTube',
      album: {
        images: [
          { url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url }
        ]
      },
      duration_ms: durationMs,
      source: 'youtube'
    };
  } catch (error) {
    console.error('Error fetching video details via proxy:', error);
    return null;
  }
}

function parseYouTubeDuration(durationStr) {
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (match) {
    const hours = parseInt(match[1] || 0, 10);
    const minutes = parseInt(match[2] || 0, 10);
    const seconds = parseInt(match[3] || 0, 10);
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }
  return 0;
}

export function getMockYouTubeResults(query) {
  return [
    {
      id: "dQw4w9WgXcQ",
      uri: "youtube:dQw4w9WgXcQ",
      name: "Never Gonna Give You Up (Mock)",
      artists: "Rick Astley",
      image: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
      duration_ms: 213000,
      source: "youtube"
    }
  ];
}

/**
 * Obtiene las playlists del usuario autenticado en YouTube.
 */
export async function getUserYouTubePlaylists(limit = 50) {
  const token = await ensureYouTubeToken();
  if (!token) throw new Error('YOUTUBE_AUTH_REQUIRED');

  const url = new URL(`${BASE_URL}/playlists`);
  url.searchParams.append('part', 'snippet,contentDetails');
  url.searchParams.append('mine', 'true');
  url.searchParams.append('maxResults', limit.toString());

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('youtube_access_token');
      throw new Error('YOUTUBE_AUTH_REQUIRED');
    }
    const error = await response.json();
    throw new Error(error.error?.message || 'Error fetching YouTube playlists');
  }

  const data = await response.json();
  return data;
}

/**
 * Obtiene los detalles de una playlist específica de YouTube.
 */
export async function getYouTubePlaylist(playlistId) {
  const token = await ensureYouTubeToken();
  const url = new URL(`${BASE_URL}/playlists`);
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('id', playlistId);
  
  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;

  if (!token && !apiKey) {
    throw new Error('No YouTube auth available (OAuth token or API Key required)');
  }

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (apiKey) {
    url.searchParams.append('key', apiKey);
  }

  const response = await fetch(url.toString(), { headers });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Error fetching YouTube playlist');
  }

  const data = await response.json();
  if (!data.items || data.items.length === 0) return null;
  
  const pl = data.items[0];
  return {
    id: pl.id,
    name: pl.snippet.title,
    snapshot_id: pl.etag,
    owner: { id: pl.snippet.channelId },
    images: [{ url: pl.snippet.thumbnails?.medium?.url || pl.snippet.thumbnails?.default?.url }]
  };
}

/**
 * Obtiene los videos de una playlist de YouTube.
 */
export async function getYouTubePlaylistItems(playlistId, limit = 50) {
  const token = await ensureYouTubeToken();
  const url = new URL(`${BASE_URL}/playlistItems`);
  url.searchParams.append('part', 'snippet,contentDetails');
  url.searchParams.append('playlistId', playlistId);
  url.searchParams.append('maxResults', limit.toString());
  
  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;

  if (!token && !apiKey) {
    throw new Error('No YouTube auth available for fetching playlist items');
  }

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (apiKey) {
    url.searchParams.append('key', apiKey);
  }

  const response = await fetch(url.toString(), { headers });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Error fetching YouTube playlist items');
  }

  const data = await response.json();
  
  // Try to pre-fetch durations for these items if possible
  // YouTube Data API requires a separate call to /videos to get duration
  const videoIds = data.items.map(item => item.contentDetails.videoId).filter(Boolean);
  
  let durations = {};
  if (videoIds.length > 0) {
    try {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const baseUrlStr = isLocal ? 'https://envairoqr.com' : window.location.origin;
      const vidUrl = new URL(`${baseUrlStr}/api/youtube-details`);
      vidUrl.searchParams.append('id', videoIds.join(','));
      
      const vidRes = await fetch(vidUrl.toString());
      if (vidRes.ok) {
        const vidData = await vidRes.json();
        vidData.items.forEach(v => {
          durations[v.id] = parseYouTubeDuration(v.contentDetails.duration);
        });
      }
    } catch (e) {
      console.error('Error fetching durations for playlist items', e);
    }
  }

  // Mapear al formato esperado
  const items = data.items.map(item => {
    const snippet = item.snippet;
    const videoId = item.contentDetails.videoId;
    return {
      track: {
        id: videoId,
        uri: `youtube:${videoId}`,
        name: snippet.title,
        artists: snippet.videoOwnerChannelTitle || snippet.channelTitle,
        album: {
          images: [{ url: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url }]
        },
        duration_ms: durations[videoId] || 0,
        source: 'youtube',
        is_local: false
      }
    };
  });
  
  return { items };
}
