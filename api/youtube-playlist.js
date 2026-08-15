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

          if (items.length > 0) {
            return res.status(200).json({
              id: playlistId,
              name,
              thumbnail: thumbnail || `https://i.ytimg.com/vi/${items[0].id}/hqdefault.jpg`,
              items
            });
          }
        }
      } catch (e) {
        // Fallback al siguiente nodo
      }
    }

    // --- 2. INTENTO VÍA SCRAPER (Webshare Proxy) ---
    // Maneja playlists estándar (PL...), Mixes (RD...), y radio mixes de YouTube
    let html = null;
    let attempts = 0;
    const maxAttempts = 3;

    // Si es un mix tipo RD..., la URL principal es watch?v=...&list=RD...
    const isMix = playlistId.startsWith('RD') || playlistId.startsWith('UL');
    const targetUrl = isMix && playlistId.length > 2
      ? `https://www.youtube.com/watch?v=${playlistId.slice(2, 13)}&list=${playlistId}`
      : `https://www.youtube.com/playlist?list=${playlistId}`;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        const useProxy = attempts <= maxAttempts;
        let agent = undefined;
        if (useProxy && PROXIES.length > 0) {
          const randomProxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
          agent = new HttpsProxyAgent(randomProxy);
        }

        const response = await fetchWithTimeout(targetUrl, {
          agent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
          }
        }, 6000);

        if (response.ok) {
          html = await response.text();
          if (html && (html.includes('ytInitialData') || html.includes('playlistVideoRenderer') || html.includes('playlistPanelVideoRenderer'))) break;
        }
      } catch (err) {
        // Retry
      }
    }

    if (html) {
      const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/s) || html.match(/var ytInitialData\s*=\s*({.+?});/s);
      if (match) {
        try {
          const json = JSON.parse(match[1]);
          const header = json.header?.playlistHeaderRenderer;
          let name = header?.title?.simpleText || json.metadata?.playlistMetadataRenderer?.title;
          
          // Si es un Mix o no tiene header estándar
          if (!name) {
            const twoCol = json.contents?.twoColumnWatchNextResults?.playlist?.playlist;
            name = twoCol?.title || 'Mix de YouTube';
          }

          // Extractor recursivo de videos en cualquier nivel del JSON
          const items = [];
          const seenIds = new Set();

          const extractVideos = (obj) => {
            if (!obj || typeof obj !== 'object') return;

            // Formato 1: playlistVideoRenderer (Playlists estándar)
            if (obj.playlistVideoRenderer && obj.playlistVideoRenderer.videoId) {
              const r = obj.playlistVideoRenderer;
              if (!seenIds.has(r.videoId)) {
                seenIds.add(r.videoId);
                const dur = parseInt(r.lengthSeconds || '0', 10);
                items.push({
                  id: r.videoId,
                  title: r.title?.runs?.[0]?.text || r.title?.simpleText || 'Sin Título',
                  uploaderName: r.shortBylineText?.runs?.[0]?.text || 'YouTube',
                  thumbnail: r.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
                  duration: dur
                });
              }
            }

            // Formato 2: playlistPanelVideoRenderer (Mixes de YouTube RD...)
            if (obj.playlistPanelVideoRenderer && obj.playlistPanelVideoRenderer.videoId) {
              const r = obj.playlistPanelVideoRenderer;
              if (!seenIds.has(r.videoId)) {
                seenIds.add(r.videoId);
                // Extraer duración de simpleText ej "3:45"
                let dur = 0;
                const durText = r.lengthText?.simpleText || r.lengthText?.runs?.[0]?.text;
                if (durText) {
                  const parts = durText.split(':').map(Number);
                  if (parts.length === 2) dur = parts[0] * 60 + parts[1];
                  else if (parts.length === 3) dur = parts[0] * 3600 + parts[1] * 60 + parts[2];
                }
                items.push({
                  id: r.videoId,
                  title: r.title?.simpleText || r.title?.runs?.[0]?.text || 'Sin Título',
                  uploaderName: r.shortBylineText?.simpleText || r.shortBylineText?.runs?.[0]?.text || 'YouTube',
                  thumbnail: r.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
                  duration: dur
                });
              }
            }

            // Formato 3: compactVideoRenderer
            if (obj.compactVideoRenderer && obj.compactVideoRenderer.videoId) {
              const r = obj.compactVideoRenderer;
              if (!seenIds.has(r.videoId)) {
                seenIds.add(r.videoId);
                items.push({
                  id: r.videoId,
                  title: r.title?.simpleText || r.title?.runs?.[0]?.text || 'Sin Título',
                  uploaderName: r.shortBylineText?.runs?.[0]?.text || 'YouTube',
                  thumbnail: r.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
                  duration: 0
                });
              }
            }

            for (const key of Object.keys(obj)) {
              extractVideos(obj[key]);
            }
          };

          extractVideos(json);

          if (items.length > 0) {
            const thumbnail = header?.playlistHeaderBanner?.heroPlaylistThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${items[0].id}/hqdefault.jpg`;

            return res.status(200).json({
              id: playlistId,
              name: name || 'Playlist de YouTube',
              thumbnail,
              items
            });
          }
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
