let activePipedInstance = null;

const MAX_SEARCH_CACHE = 150;
const searchCache = new Map();

/**
 * Busca videos en YouTube por término de búsqueda.
 * Retorna una lista formateada para ser compatible con el sistema de cola existente.
 */
export async function searchYouTubeVideos(query, limit = 8) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  const cacheKey = `${normalizedQuery}_${limit}`;
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey);
  }
  
  const results = await _doSearchYouTubeVideos(query, limit);
  if (results && results.length > 0) {
    if (searchCache.size >= MAX_SEARCH_CACHE) {
      const firstKey = searchCache.keys().next().value;
      searchCache.delete(firstKey);
    }
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
 * Obtiene los detalles de una playlist de YouTube (Título, Portada, ID)
 * utilizando el backend proxy/scraper sin requerir OAuth de Google.
 */
export async function getYouTubePlaylist(playlistId) {
  try {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocal ? 'https://envairoqr.com' : window.location.origin;
    const url = new URL(baseUrl + '/api/youtube-playlist');
    url.searchParams.append('id', playlistId);

    const response = await fetch(url.toString());
    if (response.ok) {
      const data = await response.json();
      return {
        id: data.id || playlistId,
        name: data.name || 'Playlist de YouTube',
        snapshot_id: `yt-${playlistId}`,
        owner: { id: 'youtube' },
        images: data.thumbnail ? [{ url: data.thumbnail }] : []
      };
    }
  } catch (err) {
    console.warn('Error en proxy de playlist:', err);
  }

  throw new Error('No se pudo cargar la playlist. Verifica que el enlace sea público o no listado.');
}

/**
 * Obtiene los videos de una playlist de YouTube con sus duraciones y metadatos
 * utilizando el backend proxy/scraper.
 */
export async function getYouTubePlaylistItems(playlistId, limit = 50) {
  try {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocal ? 'https://envairoqr.com' : window.location.origin;
    const url = new URL(baseUrl + '/api/youtube-playlist');
    url.searchParams.append('id', playlistId);

    const response = await fetch(url.toString());
    if (response.ok) {
      const data = await response.json();
      const rawItems = data.items || [];

      const items = rawItems.slice(0, limit).map(item => ({
        track: {
          id: item.id,
          uri: `youtube:${item.id}`,
          name: item.title,
          artists: item.uploaderName || 'YouTube',
          album: {
            images: [{ url: item.thumbnail || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg` }]
          },
          duration_ms: (item.duration || 0) * 1000,
          source: 'youtube',
          is_local: false
        }
      }));

      return { items };
    }
  } catch (err) {
    console.warn('Error en proxy de playlist items:', err);
  }

  throw new Error('No se pudieron obtener las canciones de la playlist.');
}
