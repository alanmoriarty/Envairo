const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
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

/**
 * Busca videos en YouTube por término de búsqueda.
 * Retorna una lista formateada para ser compatible con el sistema de cola existente.
 */
export async function searchYouTubeVideos(query, limit = 8) {
  // 1. Vía Descentralizada (Piped): Alta disponibilidad y sin consumir recursos propios
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.moomoo.me',
    'https://pipedapi.syncpundit.io',
    'https://api-piped.mha.fi'
  ];

  // Ordenar aleatoriamente para balancear carga globalmente
  const shuffledInstances = pipedInstances.sort(() => 0.5 - Math.random());

  for (const instance of shuffledInstances) {
    try {
      const res = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=all`);
      if (res.ok) {
        const data = await res.json();
        const streams = (data.items || []).filter(i => i.type === 'stream').slice(0, limit);
        if (streams.length > 0) {
          console.log(`[YouTube API] Éxito usando nodo descentralizado: ${instance}`);
          return streams.map(item => {
            const videoId = item.url.replace('/watch?v=', '');
            return {
              id: videoId,
              uri: `youtube:${videoId}`,
              name: item.title,
              artists: [{ name: item.uploaderName }],
              album: {
                images: [{ url: item.thumbnail }]
              },
              duration_ms: item.duration * 1000, 
              source: 'youtube'
            };
          });
        }
      }
    } catch (err) {
      console.warn(`[YouTube API] Falló nodo descentralizado (${instance}), intentando el siguiente...`);
    }
  }

  // 2. Vía Centralizada (Nuestro Vercel Scraper): Como primer nivel de respaldo
  try {
    const proxyUrl = new URL(window.location.origin + '/api/youtube-search');
    proxyUrl.searchParams.append('q', query);
    proxyUrl.searchParams.append('limit', limit.toString());
    
    const res = await fetch(proxyUrl.toString());
    if (res.ok) {
      const data = await res.json();
      return data.items.map(item => ({
        id: item.id.videoId,
        uri: `youtube:${item.id.videoId}`,
        name: item.snippet.title,
        artists: [{ name: item.snippet.channelTitle }],
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
    console.warn('Vercel serverless scraper falló, usando API oficial como respaldo:', err);
  }

  // 2. Fallback: API oficial de YouTube (Consume 100 unidades de cuota)
  if (!API_KEY) {
    throw new Error('No YouTube API Key found and Serverless function failed');
  }

  const url = new URL(`${BASE_URL}/search`);
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('q', query);
  url.searchParams.append('type', 'video');
  url.searchParams.append('maxResults', limit.toString());
  url.searchParams.append('key', API_KEY);
  url.searchParams.append('videoCategoryId', '10'); // 10 = Music category

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Error fetching from YouTube API');
  }

  const data = await response.json();

  // Transformar los resultados
  return data.items.map(item => ({
    id: item.id.videoId,
    uri: `youtube:${item.id.videoId}`, 
    name: item.snippet.title,
    artists: [{ name: item.snippet.channelTitle }],
    album: {
      images: [
        { url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url }
      ]
    },
    duration_ms: 0,
    source: 'youtube'
  }));
}

/**
 * Obtiene detalles adicionales de un video (como la duración real)
 */
export async function getYouTubeVideoDetails(videoId) {
  if (!API_KEY) return null;

  const url = new URL(`${BASE_URL}/videos`);
  url.searchParams.append('part', 'contentDetails,snippet');
  url.searchParams.append('id', videoId);
  url.searchParams.append('key', API_KEY);

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
    artists: [{ name: item.snippet.channelTitle }],
    album: {
      images: [
        { url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url }
      ]
    },
    duration_ms: durationMs,
    source: 'youtube'
  };
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
  if (!token) throw new Error('No YouTube access token found');

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
  
  if (!token && API_KEY) {
    url.searchParams.append('key', API_KEY);
  } else if (!token && !API_KEY) {
    throw new Error('No YouTube auth available');
  }

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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
  
  if (!token && API_KEY) {
    url.searchParams.append('key', API_KEY);
  } else if (!token && !API_KEY) {
    throw new Error('No YouTube auth available for fetching playlist items');
  }

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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
      const vidUrl = new URL(`${BASE_URL}/videos`);
      vidUrl.searchParams.append('part', 'contentDetails');
      vidUrl.searchParams.append('id', videoIds.join(','));
      
      if (!token && API_KEY) {
        vidUrl.searchParams.append('key', API_KEY);
      }
      
      const vidHeaders = {};
      if (token) {
        vidHeaders['Authorization'] = `Bearer ${token}`;
      }
      
      const vidRes = await fetch(vidUrl.toString(), { headers: vidHeaders });
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
