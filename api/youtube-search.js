import ytSearch from 'yt-search';

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

    // Usar yt-search para buscar en YouTube sin usar API key
    const r = await ytSearch(q);
    
    // Filtrar solo los videos
    const videos = r.videos.slice(0, parseInt(limit, 10));
    
    // Formatear los resultados para que coincidan con la estructura que espera la app
    const items = videos.map(item => ({
      id: { videoId: item.videoId },
      snippet: {
        title: item.title,
        channelTitle: item.author.name,
        thumbnails: {
          high: { url: item.thumbnail },
          default: { url: item.thumbnail }
        }
      }
    }));

    res.status(200).json({ items });
  } catch (error) {
    console.error('API /youtube-search error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
