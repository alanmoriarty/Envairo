import fetch from 'node-fetch';

const ALLOWED_ORIGINS = [
  'https://envairoqr.com',
  'https://www.envairoqr.com',
  'http://localhost:5173',
  'http://localhost:4173'
];

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
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Video ID parameter "id" is required' });
    }

    const apiKey = process.env.VITE_YOUTUBE_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'YouTube API Key not configured in backend' });
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.append('part', 'contentDetails,snippet');
    url.searchParams.append('id', id);
    url.searchParams.append('key', apiKey);

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Error fetching from YouTube API');
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('API /youtube-details error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
