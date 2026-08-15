import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';

// Proxy rotativo residencial - credencial en variable de entorno del servidor
const PROXIES = [
  process.env.WEBSHARE_PROXY_URL || 'http://p.webshare.io:80'
];

// Orígenes permitidos para CORS
const ALLOWED_ORIGINS = [
  'https://envairoqr.com',
  'https://www.envairoqr.com',
  'http://localhost:5173',
  'http://localhost:4173'
];

export default async function handler(req, res) {
  // CORS headers
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, Date');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { id } = req.query;
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "id" (playlist ID) is required' });
    }

    const playlistId = id.trim();

    // Helper to fetch with timeout
    const fetchWithTimeout = async (url, options, timeoutMs = 4000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    };

    // --- 1. INTENTO VÍA PIPED (Descentralizado) ---
    const pipedInstances = [
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.tokhmi.xyz',
      'https://pipedapi.moomoo.me',
      'https://pipedapi.syncpundit.io',
      'https://api-piped.mha.fi'
    ];
    const instancesToTry = pipedInstances.sort(() => 0.5 - Math.random());

    for (const instance of instancesToTry) {
      try {
        const pipedRes = await fetchWithTimeout(`${instance}/playlists/${playlistId}`, {}, 5000);
        if (pipedRes.ok) {
          const data = await pipedRes.json();
          const name = data.name || 'Playlist de YouTube';
          const thumbnail = data.thumbnailUrl || (data.relatedStreams?.[0]?.thumbnail) || '';
          const relatedStreams = data.relatedStreams || [];

          const items = relatedStreams.map(stream => {
            let videoId = '';
            if (stream.url) {
              if (stream.url.includes('v=')) {
                videoId = stream.url.split('v=')[1].split('&')[0];
              } else if (stream.url.includes('/shorts/')) {
                videoId = stream.url.split('/shorts/')[1].split('?')[0];
              } else {
                const match = stream.url.match(/([a-zA-Z0-9_-]{11})/);
                if (match) videoId = match[1];
              }
            }

            return {
              id: videoId,
              title: stream.title || 'Sin Título',
              uploaderName: stream.uploaderName || 'YouTube',
              thumbnail: stream.thumbnail || '',
              duration: typeof stream.duration === 'number' ? stream.duration : 0 // seconds
            };
          }).filter(i => i.id && i.id.length === 11);

          if (items.length > 0 || name) {
            return res.status(200).json({
              id: playlistId,
              name,
              thumbnail,
              items
            });
          }
        }
      } catch (e) {
        // Fallback al siguiente nodo
      }
    }

    // --- 2. INTENTO VÍA SCRAPER (Webshare Proxy) ---
    let html = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        const useProxy = attempts <= maxAttempts;
        let agent = undefined;
        if (useProxy && PROXIES.length > 0) {
          const randomProxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
          agent = new HttpsProxyAgent(randomProxy);
        }

        const response = await fetchWithTimeout(`https://www.youtube.com/playlist?list=${playlistId}`, {
          agent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
          }
        }, 5000);

        if (response.ok) {
          html = await response.text();
          if (html && html.includes('ytInitialData')) break;
        }
      } catch (err) {
        // Retry
      }
    }

    if (html && html.includes('ytInitialData')) {
      const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/s) || html.match(/var ytInitialData\s*=\s*({.+?});/s);
      if (match) {
        try {
          const json = JSON.parse(match[1]);
          const header = json.header?.playlistHeaderRenderer;
          const name = header?.title?.simpleText || json.metadata?.playlistMetadataRenderer?.title || 'Playlist de YouTube';
          const thumbnail = header?.playlistHeaderBanner?.heroPlaylistThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url || '';

          const tabs = json.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
          let rawContents = [];
          for (const tab of tabs) {
            const section = tab.tabRenderer?.content?.sectionListRenderer?.contents?.[0];
            const plVideoList = section?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;
            if (plVideoList) {
              rawContents = plVideoList;
              break;
            }
          }

          const items = [];
          for (const c of rawContents) {
            const renderer = c.playlistVideoRenderer;
            if (renderer && renderer.videoId) {
              const durationSec = parseInt(renderer.lengthSeconds || '0', 10);
              items.push({
                id: renderer.videoId,
                title: renderer.title?.runs?.[0]?.text || renderer.title?.simpleText || 'Sin Título',
                uploaderName: renderer.shortBylineText?.runs?.[0]?.text || 'YouTube',
                thumbnail: renderer.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${renderer.videoId}/hqdefault.jpg`,
                duration: durationSec
              });
            }
          }

          return res.status(200).json({
            id: playlistId,
            name,
            thumbnail,
            items
          });
        } catch (parseErr) {
          console.error('Error parsing playlist scraper JSON:', parseErr);
        }
      }
    }

    return res.status(500).json({ error: 'No se pudo obtener la playlist. Verifica que el enlace sea público o no listado.' });
  } catch (err) {
    console.error('Error general en playlist proxy:', err);
    return res.status(500).json({ error: err.message || 'Error interno al procesar la playlist' });
  }
}
