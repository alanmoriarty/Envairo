import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';

// Lista de proxies proporcionados por Webshare
const PROXIES = [
  'http://vskzegpk:qi5o4qxrnn38@31.59.20.176:6754',
  'http://vskzegpk:qi5o4qxrnn38@31.56.127.193:7684',
  'http://vskzegpk:qi5o4qxrnn38@45.38.107.97:6014',
  'http://vskzegpk:qi5o4qxrnn38@185.199.229.156:7492',
  'http://vskzegpk:qi5o4qxrnn38@185.199.228.220:7300',
  'http://vskzegpk:qi5o4qxrnn38@185.199.231.45:8382',
  'http://vskzegpk:qi5o4qxrnn38@188.74.210.207:6286',
  'http://vskzegpk:qi5o4qxrnn38@188.74.183.10:8279',
  'http://vskzegpk:qi5o4qxrnn38@188.74.210.21:6100',
  'http://vskzegpk:qi5o4qxrnn38@45.55.159.228:7945'
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

    // Elegir un proxy al azar para rotar IPs y evitar baneos de YouTube
    const randomProxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
    const agent = new HttpsProxyAgent(randomProxy);

    // Hacer la petición a YouTube usando el proxy
    const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, { 
      agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube returned status ${response.status}`);
    }

    const html = await response.text();
    const match = html.match(/ytInitialData[ =]*(.*?);<\/script>/);

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
