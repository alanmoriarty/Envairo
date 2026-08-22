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
      let { query, queries, type = 'track', limit = 10, filterExplicit = false } = await req.json()
      
      // Asegurar que limit sea un número válido para los algoritmos
      const originalLimit = parseInt(limit.toString()) || 10;
      // Si necesitamos filtrar, pedimos más resultados a las APIs para tener de donde escoger versiones limpias
      const fetchLimit = filterExplicit ? Math.max(originalLimit * 3, 10).toString() : originalLimit.toString();

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

    // 2. Búsqueda masiva (Bulk) ultra-rápida usando iTunes CDN (con fallback Deezer)
    if (queries && queries.length > 0) {
      const searchPromises = queries.map(async (q: string) => {
        try {
          const cleanQuery = q.replace(/-/g, ' ').trim();
          const itunesParams = new URLSearchParams({
            term: cleanQuery,
            entity: 'song',
            limit: fetchLimit
          });

          // Timeout de 2000ms
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);

          let itunesResponse = await fetch(`https://itunes.apple.com/search?${itunesParams}`, {
            signal: controller.signal
          }).catch(() => null);

          clearTimeout(timeoutId);

          let itunesData = itunesResponse && itunesResponse.ok ? await itunesResponse.json().catch(() => null) : null;

          if (itunesData && itunesData.results && itunesData.results.length > 0) {
            let results = itunesData.results;
            if (filterExplicit) {
              results = results.filter((track: any) => track.trackExplicitness !== 'explicit');
            }
            results = results.slice(0, originalLimit);

            if (results.length > 0) {
              return {
                tracks: {
                  items: results.map((track: any) => {
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
            }
          }

          // Fallback a Deezer si iTunes no arrojó resultados
          const deezerParams = new URLSearchParams({
            q: cleanQuery,
            limit: fetchLimit,
            order: 'RANKING'
          });

          const deezerRes = await fetch(`https://api.deezer.com/search?${deezerParams}`).catch(() => null);
          if (deezerRes && deezerRes.ok) {
            const deezerData = await deezerRes.json().catch(() => null);
            let cleanData = deezerData?.data || [];
            if (filterExplicit) {
              cleanData = cleanData.filter((track: any) => track.explicit_lyrics === false);
            }
            cleanData = cleanData.slice(0, originalLimit);

            return {
              tracks: {
                items: cleanData.map((track: any) => ({
                  id: track.id.toString(),
                  uri: `deezer:track:${track.id}`,
                  name: track.title,
                  duration_ms: track.duration * 1000,
                  artists: [{ name: track.artist.name }],
                  album: {
                    name: track.album.title,
                    images: [{ url: track.album.cover_xl || track.album.cover_big || track.album.cover }]
                  }
                }))
              }
            };
          }

          return { tracks: { items: [] } };
        } catch (err) {
          console.error('Error buscando canción individual en lote:', q, err);
          return { tracks: { items: [] } };
        }
      });

      const results = await Promise.all(searchPromises);

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Single search mode usando iTUNES
      const searchParams = new URLSearchParams({
        term: query,
        entity: 'song',
        limit: fetchLimit
      });

      const searchResponse = await fetch(`https://itunes.apple.com/search?${searchParams}`);

      if (!searchResponse.ok) {
        throw new Error(`iTunes search error: ${await searchResponse.text()}`)
      }

      const itunesData = await searchResponse.json();
      
      if (filterExplicit && itunesData.results) {
        itunesData.results = itunesData.results.filter((track: any) => track.trackExplicitness !== 'explicit');
      }
      if (itunesData.results) {
        itunesData.results = itunesData.results.slice(0, originalLimit);
      }
      
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
