import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';

// Proxy rotativo residencial proporcionado por Webshare
const PROXIES = [
  'http://vskzegpk-rotate:qi5o4qxrnn38@p.webshare.io:80'
];

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { q, limit = 5 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    // Helper to fetch with timeout
    const fetchWithTimeout = async (url, options, timeoutMs = 3000) => {
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
        const res = await fetchWithTimeout(`${instance}/search?q=${encodeURIComponent(q)}&filter=all`, {}, 5000);
        if (res.ok) {
          const data = await res.json();
          const streams = (data.items || []).filter(i => i.type === 'stream').slice(0, parseInt(limit, 10));
          
          if (streams.length > 0) {
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

            if (items.length > 0) {
              return res.status(200).json({ items });
            }
          }
        }
      } catch (err) {
        // Ignorar y probar el siguiente nodo
      }
    }

    // --- 2. INTENTO VÍA SCRAPER (Webshare) ---
    let html = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        // Use a proxy for the first 2 attempts, then try direct connection
        const useProxy = attempts < maxAttempts;
        let agent = undefined;
        
        if (useProxy) {
          const randomProxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
          agent = new HttpsProxyAgent(randomProxy);
        }

        const response = await fetchWithTimeout(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, { 
          agent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
          }
        }, 4000); // 4 second timeout per attempt

        if (!response.ok) {
          throw new Error(`YouTube returned status ${response.status}`);
        }

        html = await response.text();
        
        // Verificamos si realmente obtuvimos la data
        if (html && html.includes('ytInitialData')) {
          break; // Success!
        }
      } catch (err) {
        console.warn(`Attempt ${attempts} failed:`, err.message);
        if (attempts >= maxAttempts) {
          throw new Error('Todos los intentos de búsqueda fallaron o la red bloqueó las peticiones.');
        }
      }
    }

    const match = html?.match(/ytInitialData[ =]*(.*?);<\/script>/);

    if (!match || !match[1]) {
      throw new Error('ytInitialData no encontrado en la respuesta (posible bloqueo o cambio de estructura)');
    }

    const data = JSON.parse(match[1]);
    let videos = [];
    
    // Navegar la compleja estructura de JSON de YouTube
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

    const items = videos.slice(0, parseInt(limit, 10));
    res.status(200).json({ items });
  } catch (error) {
    console.error('API /youtube-search error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
