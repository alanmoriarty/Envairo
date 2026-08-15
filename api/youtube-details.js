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

export default async function handler(req, res) {
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
      return res.status(400).json({ error: 'Video ID parameter "id" is required' });
    }

    const cleanId = id.trim();

    // 1. Intentar vía Piped (descentralizado)
    const pipedInstances = [
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.tokhmi.xyz',
      'https://pipedapi.moomoo.me',
      'https://pipedapi.syncpundit.io',
      'https://api-piped.mha.fi'
    ].sort(() => 0.5 - Math.random());

    for (const instance of pipedInstances) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const r = await fetch(`${instance}/streams/${cleanId}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (r.ok) {
          const data = await r.json();
          const durationSeconds = data.duration || 0;
          const hours = Math.floor(durationSeconds / 3600);
          const minutes = Math.floor((durationSeconds % 3600) / 60);
          const seconds = durationSeconds % 60;
          const isoDuration = `PT${hours ? hours + 'H' : ''}${minutes ? minutes + 'M' : ''}${seconds}S`;

          return res.status(200).json({
            items: [
              {
                id: cleanId,
                snippet: {
                  title: data.title || '',
                  channelTitle: data.uploader || 'YouTube',
                  thumbnails: {
                    high: { url: data.thumbnailUrl || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg` },
                    default: { url: `https://i.ytimg.com/vi/${cleanId}/default.jpg` }
                  }
                },
                contentDetails: {
                  duration: isoDuration
                }
              }
            ]
          });
        }
      } catch (e) {}
    }

    // 2. Fallback vía Scraper Webshare
    let agent = undefined;
    if (PROXIES.length > 0) {
      agent = new HttpsProxyAgent(PROXIES[0]);
    }

    const ytRes = await fetch(`https://www.youtube.com/watch?v=${cleanId}`, {
      agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });

    if (ytRes.ok) {
      const html = await ytRes.text();
      const lengthMatch = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/) || html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
      const titleMatch = html.match(/<title>(.*?)<\/title>/);
      const cleanTitle = (titleMatch ? titleMatch[1] : '').replace(' - YouTube', '').trim();
      
      const durationSeconds = lengthMatch ? (lengthMatch[1].length > 6 ? Math.floor(parseInt(lengthMatch[1], 10) / 1000) : parseInt(lengthMatch[1], 10)) : 180;
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      const seconds = durationSeconds % 60;
      const isoDuration = `PT${hours ? hours + 'H' : ''}${minutes ? minutes + 'M' : ''}${seconds}S`;

      return res.status(200).json({
        items: [
          {
            id: cleanId,
            snippet: {
              title: cleanTitle || 'YouTube Video',
              channelTitle: 'YouTube',
              thumbnails: {
                high: { url: `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg` },
                default: { url: `https://i.ytimg.com/vi/${cleanId}/default.jpg` }
              }
            },
            contentDetails: {
              duration: isoDuration
            }
          }
        ]
      });
    }

    // Default fallback seguro si no responde el scraper
    res.status(200).json({
      items: [
        {
          id: cleanId,
          snippet: {
            title: 'YouTube Video',
            channelTitle: 'YouTube',
            thumbnails: {
              high: { url: `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg` },
              default: { url: `https://i.ytimg.com/vi/${cleanId}/default.jpg` }
            }
          },
          contentDetails: {
            duration: 'PT3M30S'
          }
        }
      ]
    });
  } catch (error) {
    console.error('API /youtube-details error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
