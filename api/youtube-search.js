import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';

// Proxy residencial - credencial en variable de entorno del servidor (soporta lista separada por comas)
const PROXIES = (process.env.WEBSHARE_PROXY_URL || process.env.WEBSHARE_PROXIES || 'http://p.webshare.io:80')
  .split(',')
  .map(p => p.trim())
  .filter(Boolean);

// Orígenes permitidos para CORS
const ALLOWED_ORIGINS = [
  'https://envairoqr.com',
  'https://www.envairoqr.com',
  'http://localhost:5173',
  'http://localhost:4173'
];

// ── In-Memory Server Cache (LRU + 24h TTL) ───────────────────────────────────
const MAX_CACHE_SIZE = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const youtubeMemoryCache = new Map();

function getCachedYtResults(key) {
  const cached = youtubeMemoryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    youtubeMemoryCache.delete(key);
    return null;
  }
  return cached.data;
}

function setCachedYtResults(key, data) {
  if (youtubeMemoryCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = youtubeMemoryCache.keys().next().value;
    youtubeMemoryCache.delete(oldestKey);
  }
  youtubeMemoryCache.set(key, { data, timestamp: Date.now() });
}

export default async function handler(req, res) {
  // CORS headers - solo permitir orígenes de confianza
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
    const { q } = req.query;
    // Clamp limit between 1 and 20 to prevent abuse
    const limit = Math.min(Math.max(parseInt(req.query.limit || '5', 10), 1), 20);

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const query = q.trim();
    const cacheKey = `${query.toLowerCase()}_${limit}`;

    // 1. Servir desde caché en memoria si existe (0 MB de proxy y <5ms de respuesta)
    const cached = getCachedYtResults(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    // Helper to fetch with timeout
    const fetchWithTimeout = async (url, options, timeoutMs = 2500) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
      } catch (err) {
        clearTimeout(id);
        throw err;
      }
    };

    // --- 1. INTENTO CONCURRENTE VÍA PIPED (Máximo 1.5s total en paralelo) ---
    const pipedInstances = [
      'https://pipedapi.kavin.rocks',
      'https://api-piped.mha.fi',
      'https://pipedapi.syncpundit.io'
    ];

    try {
      const pipedPromises = pipedInstances.map(async (instance) => {
        const pipedRes = await fetchWithTimeout(`${instance}/search?q=${encodeURIComponent(query)}&filter=all`, {
          headers: { 'Accept-Encoding': 'gzip, deflate, br' }
        }, 1500);

        if (!pipedRes.ok) throw new Error('Piped instance not OK');
        const data = await pipedRes.json();
        const streams = (data.items || []).filter(i => i.type === 'stream').slice(0, limit);
        if (!streams || streams.length === 0) throw new Error('No streams');

        const items = streams.map(item => {
          let videoId = '';
          if (item.url.includes('v=')) {
            videoId = item.url.split('v=')[1].split('&')[0];
          } else if (item.url.includes('/shorts/')) {
            videoId = item.url.split('/shorts/')[1].split('?')[0];
          } else {
            const match = item.url.match(/([a-zA-Z0-9_-]{11})/);
            if (match) videoId = match[1];
          }

          return {
            id: { videoId },
            snippet: {
              title: item.title,
              channelTitle: item.uploaderName || 'YouTube',
              thumbnails: {
                high: { url: item.thumbnail },
                default: { url: item.thumbnail }
              }
            }
          };
        }).filter(t => t.id && t.id.videoId && t.id.videoId.length === 11);

        if (items.length === 0) throw new Error('No valid items');
        return { items };
      });

      const pipedResult = await Promise.any(pipedPromises);
      if (pipedResult && pipedResult.items && pipedResult.items.length > 0) {
        setCachedYtResults(cacheKey, pipedResult);
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
        res.setHeader('X-Cache', 'MISS');
        return res.status(200).json(pipedResult);
      }
    } catch (pipedErr) {
      // Si fallan los nodos Piped rápidos, pasa inmediatamente al Scraper
    }

    // --- 2. INTENTO VÍA SCRAPER CON COMPRESIÓN (Webshare) ---
    let html = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        const useProxy = attempts < maxAttempts;
        let agent = undefined;
        
        if (useProxy && PROXIES.length > 0) {
          const randomProxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
          agent = new HttpsProxyAgent(randomProxy);
        }

        const response = await fetchWithTimeout(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { 
          agent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br'
          }
        }, 2500);

        if (!response.ok) {
          throw new Error(`YouTube returned status ${response.status}`);
        }

        html = await response.text();
        
        if (html && html.includes('ytInitialData')) {
          break;
        }
      } catch (err) {
        if (attempts >= maxAttempts) {
          throw new Error('Búsqueda agotó reintentos de conexión.');
        }
      }
    }

    const match = html?.match(/ytInitialData[ =]*(.*?);<\/script>/);

    if (!match || !match[1]) {
      throw new Error('ytInitialData no encontrado en la respuesta (posible bloqueo o cambio de estructura)');
    }

    const data = JSON.parse(match[1]);
    let videos = [];
    
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (contents) {
       for (const section of contents) {
          const items = section?.itemSectionRenderer?.contents;
          if (items) {
             for (const item of items) {
                const video = item.videoRenderer;
                if (video && video.videoId) {
                   videos.push({
                      id: { videoId: video.videoId },
                      snippet: {
                        title: video.title?.runs?.[0]?.text || '',
                        channelTitle: video.ownerText?.runs?.[0]?.text || '',
                        thumbnails: {
                          high: { url: video.thumbnail?.thumbnails?.[0]?.url || '' },
                          default: { url: video.thumbnail?.thumbnails?.[0]?.url || '' }
                        }
                      }
                   });
                }
             }
          }
       }
    }

    const items = videos.slice(0, limit);
    const finalPayload = { items };
    setCachedYtResults(cacheKey, finalPayload);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(finalPayload);
  } catch (error) {
    console.error('API /youtube-search error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

