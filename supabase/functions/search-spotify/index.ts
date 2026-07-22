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

    // Búsqueda masiva (Bulk) usando DEEZER
    if (queries && queries.length > 0) {
      const results = [];
      const chunkSize = 15; // Deezer aguanta muy bien ráfagas (50 reqs / 5s)
      
      for (let i = 0; i < queries.length; i += chunkSize) {
        const chunk = queries.slice(i, i + chunkSize);
        
        const chunkPromises = chunk.map(async (q: string) => {
          const searchParams = new URLSearchParams({
            q: q,
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
          // Así el frontend no se rompe y cree que sigue hablando con Spotify.
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
      // Single search mode usando DEEZER
      const searchParams = new URLSearchParams({
        q: query,
        limit: limit.toString(),
        order: 'RANKING' // Fuerza a ordenar por popularidad
      })

      const searchResponse = await fetch(`https://api.deezer.com/search?${searchParams}`);

      if (!searchResponse.ok) {
        throw new Error(`Deezer search error: ${await searchResponse.text()}`)
      }

      const deezerData = await searchResponse.json();
      
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
