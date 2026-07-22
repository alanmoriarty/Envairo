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

    // 1. Get Client Credentials Token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)
      },
      body: 'grant_type=client_credentials'
    })

    if (!tokenResponse.ok) {
      throw new Error(`Spotify token error: ${await tokenResponse.text()}`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // 2. Search Spotify
    if (queries && queries.length > 0) {
      // Bulk search mode
      const results = [];
      // Procesamiento secuencial puro con un pequeño retraso entre CADA petición
      // Esto evita los picos de ráfaga (bursts) que disparan el error 429 de Spotify.
      for (const q of queries) {
        let retries = 3;
        let success = false;

        while (retries > 0 && !success) {
          const searchParams = new URLSearchParams({
            q: q,
            type: type,
            limit: limit.toString()
          });
          
          const searchResponse = await fetch(`https://api.spotify.com/v1/search?${searchParams}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          if (searchResponse.status === 429) {
            // Fuimos bloqueados, leer cuánto tiempo esperar
            const retryAfter = searchResponse.headers.get('Retry-After');
            const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000; // Por defecto 2 segundos
            console.warn(`[429 RATE LIMIT] Esperando ${waitTime}ms para reintentar... (${retries} intentos restantes)`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retries--;
          } else if (!searchResponse.ok) {
            const errText = await searchResponse.text();
            console.error('Spotify API error for query:', q, searchResponse.status, errText);
            results.push({ error: true, status: searchResponse.status, message: errText, query: q });
            success = true; // Salir del while para este item
          } else {
            results.push(await searchResponse.json());
            success = true;
          }
        }

        if (!success) {
           results.push({ error: true, status: 429, message: "Too many requests after retries", query: q });
        }
        
        // Retraso uniforme de 600ms para evitar llegar al límite (menos de 2 peticiones por seg)
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      // Single search mode
      const searchParams = new URLSearchParams({
        q: query,
        type: type,
        limit: limit.toString()
      })

      const searchResponse = await fetch(`https://api.spotify.com/v1/search?${searchParams}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (!searchResponse.ok) {
        throw new Error(`Spotify search error: ${await searchResponse.text()}`)
      }

      const searchData = await searchResponse.json()

      return new Response(JSON.stringify(searchData), {
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
