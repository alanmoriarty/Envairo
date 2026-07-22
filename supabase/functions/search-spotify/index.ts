import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID")
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, queries, limit = 6, type = 'track' } = await req.json()

    if (!query && (!queries || !Array.isArray(queries) || queries.length === 0)) {
      return new Response(JSON.stringify({ error: 'Query or queries array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Función auxiliar para mapear iTunes a Spotify format
    const mapITunesToSpotify = (itunesData: any) => {
      return {
        tracks: {
          items: (itunesData.results || []).map((track: any) => {
            // Reemplazar 100x100 por 600x600 para alta resolución
            const bigImageUrl = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '600x600bb') : '';
            return {
              id: track.trackId?.toString() || Math.random().toString(),
              uri: `itunes:track:${track.trackId}`,
              name: track.trackName || track.collectionName || 'Unknown',
              duration_ms: track.trackTimeMillis || 0,
              artists: [{ name: track.artistName || 'Unknown' }],
              album: {
                name: track.collectionName || '',
                images: [{ url: bigImageUrl }]
              }
            };
          })
        }
      };
    };

    // 2. Búsqueda masiva (Bulk) para Inteligencia Artificial usando DEEZER (Mayor límite de peticiones)
    if (queries && queries.length > 0) {
      const results = [];
      const chunkSize = 15; // Deezer aguanta muy bien ráfagas (50 reqs / 5s)
      
      for (let i = 0; i < queries.length; i += chunkSize) {
        const chunk = queries.slice(i, i + chunkSize);
        
        const chunkPromises = chunk.map(async (q: string) => {
          // Extraer pista y artista si vienen en formato "Cancion - Artista" para precisión extrema
          let d_query = q;
          if (q.includes('-')) {
            const parts = q.split('-');
            const trackPart = parts[0].trim();
            const artistPart = parts.slice(1).join('-').trim();
            d_query = `track:"${trackPart}" artist:"${artistPart}"`;
          }

          const searchParams = new URLSearchParams({
            q: d_query,
            limit: limit.toString(),
            order: 'RANKING' // Fuerza a ordenar por popularidad para evitar covers/karaokes
          });
          
          const searchResponse = await fetch(`https://api.deezer.com/search?${searchParams}`);
          
          if (!searchResponse.ok) {
            const errText = await searchResponse.text();
            console.error('Deezer API error for query:', q, searchResponse.status, errText);
            return { error: true, status: searchResponse.status, message: errText, query: q };
          }
          
          const deezerData = await searchResponse.json();
          
          // Mapear la respuesta de Deezer para que luzca EXACTAMENTE como la de Spotify
          const fakeSpotifyResponse = {
            tracks: {
              items: (deezerData.data || []).map((track: any) => ({
                id: track.id.toString(),
                uri: `deezer:track:${track.id}`,
                name: track.title,
                duration_ms: track.duration * 1000,
                artists: [{ name: track.artist.name }],
                album: {
                  name: track.album.title,
                  images: [
                    { url: track.album.cover_xl || track.album.cover_big || track.album.cover }
                  ]
                }
              }))
            }
          };
          
          return fakeSpotifyResponse;
        });
        
        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
        
        // Pausa diminuta para respetar el límite de 50 peticiones cada 5 segundos de Deezer
        if (i + chunkSize < queries.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      // Single search mode usando iTUNES
      const searchParams = new URLSearchParams({
        term: query,
        entity: 'song',
        limit: limit.toString()
      });

      const searchResponse = await fetch(`https://itunes.apple.com/search?${searchParams}`);

      if (!searchResponse.ok) {
        throw new Error(`iTunes search error: ${await searchResponse.text()}`)
      }

      const itunesData = await searchResponse.json();
      const fakeSpotifyResponse = mapITunesToSpotify(itunesData);

      return new Response(JSON.stringify(fakeSpotifyResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
