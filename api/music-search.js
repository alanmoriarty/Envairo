import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';

const PROXIES = [
  process.env.WEBSHARE_PROXY_URL || 'http://p.webshare.io:80'
];

const ALLOWED_ORIGINS = [
  'https://envairoqr.com',
  'https://www.envairoqr.com',
  'http://localhost:5173',
  'http://localhost:4173'
];

// ── In-Memory Server Cache (LRU + 24h TTL) ───────────────────────────────────
const MAX_CACHE_SIZE = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const memoryCache = new Map();

function getCachedResults(key) {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return cached.data;
}

function setCachedResults(key, data) {
  if (memoryCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, { data, timestamp: Date.now() });
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, Date');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const q = req.method === 'POST' ? req.body?.query : req.query.q;
    const limit = Math.min(Math.max(parseInt((req.method === 'POST' ? req.body?.limit : req.query.limit) || '10', 10), 1), 25);
    const filterExplicit = (req.method === 'POST' ? req.body?.filterExplicit : req.query.filterExplicit) === true;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" or body "query" is required' });
    }

    const query = q.trim();
    const cacheKey = `${query.toLowerCase()}_${limit}_${filterExplicit}`;

    // 1. Verificar caché en memoria antes de tocar la red o el proxy
    const cachedResponse = getCachedResults(cacheKey);
    if (cachedResponse) {
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cachedResponse);
    }

    let agent = undefined;
    if (PROXIES.length > 0) {
      agent = new HttpsProxyAgent(PROXIES[Math.floor(Math.random() * PROXIES.length)]);
    }

    // 2. Intentar Deezer vía Proxy Residencial (Ordenado por RANKING/popularidad)
    try {
      const searchParams = new URLSearchParams({
        q: query,
        limit: (limit * 2).toString(),
        order: 'RANKING'
      });

      const response = await fetch(`https://api.deezer.com/search?${searchParams.toString()}`, {
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Encoding': 'gzip, deflate, br'
        }
      });

      if (response.ok) {
        const deezerData = await response.json();
        let cleanData = deezerData.data || [];
        if (filterExplicit) {
          cleanData = cleanData.filter(t => t.explicit_lyrics === false);
        }
        cleanData = cleanData.slice(0, limit);

        if (cleanData.length > 0) {
          const resultPayload = {
            tracks: {
              items: cleanData.map(track => ({
                id: track.id.toString(),
                uri: `deezer:track:${track.id}`,
                name: track.title,
                duration_ms: (track.duration || 0) * 1000,
                artists: [{ name: track.artist?.name || 'Unknown' }],
                album: {
                  name: track.album?.title || '',
                  images: [
                    { url: track.album?.cover_xl || track.album?.cover_big || track.album?.cover || '' }
                  ]
                }
              }))
            }
          };

          setCachedResults(cacheKey, resultPayload);
          res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
          res.setHeader('X-Cache', 'MISS');
          return res.status(200).json(resultPayload);
        }
      }
    } catch (deezerErr) {
      console.warn('Deezer proxy search failed, falling back to iTunes proxy:', deezerErr.message);
    }

    // 3. Fallback a iTunes vía Proxy Residencial
    const itunesParams = new URLSearchParams({
      term: query,
      entity: 'song',
      limit: (limit * 2).toString()
    });

    const itunesRes = await fetch(`https://itunes.apple.com/search?${itunesParams.toString()}`, {
      agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    });

    if (itunesRes.ok) {
      const itunesData = await itunesRes.json();
      let results = itunesData.results || [];
      if (filterExplicit) {
        results = results.filter(t => t.trackExplicitness !== 'explicit');
      }
      results = results.slice(0, limit);

      const resultPayload = {
        tracks: {
          items: results.map(track => ({
            id: track.trackId?.toString() || Math.random().toString(),
            uri: `itunes:track:${track.trackId}`,
            name: track.trackName || track.collectionName || 'Unknown',
            duration_ms: track.trackTimeMillis || 0,
            artists: [{ name: track.artistName || 'Unknown' }],
            album: {
              name: track.collectionName || '',
              images: [
                { url: track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '600x600bb') : '' }
              ]
            }
          }))
        }
      };

      setCachedResults(cacheKey, resultPayload);
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).json(resultPayload);
    }

    res.status(500).json({ error: 'Search failed on all proxy providers' });
  } catch (error) {
    console.error('API /music-search error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

