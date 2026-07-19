const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
const BASE_URL = 'https://www.googleapis.com/youtube/v3';

/**
 * Busca videos en YouTube por término de búsqueda.
 * Retorna una lista formateada para ser compatible con el sistema de cola existente.
 */
export async function searchYouTubeVideos(query, limit = 8) {
  if (!API_KEY) {
    throw new Error('No YouTube API Key found');
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

  // Transformar los resultados para que coincidan con el formato de las pistas en EnvAIro
  return data.items.map(item => ({
    id: item.id.videoId,
    uri: `youtube:${item.id.videoId}`, // URI personalizada para identificar que es de YouTube
    name: item.snippet.title,
    artists: [{ name: item.snippet.channelTitle }],
    album: {
      images: [
        { url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url }
      ]
    },
    duration_ms: 0, // YouTube Search API no devuelve la duración. Requeriría otra llamada a /videos. Se deja en 0 por ahora.
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
  let durationMs = 0;
  
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (match) {
    const hours = parseInt(match[1] || 0, 10);
    const minutes = parseInt(match[2] || 0, 10);
    const seconds = parseInt(match[3] || 0, 10);
    durationMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

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
