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
      const chunkSize = 5; // Reducido para evitar el error 429 de Spotify
      
      for (let i = 0; i < queries.length; i += chunkSize) {
        const chunk = queries.slice(i, i + chunkSize);
        
        const chunkPromises = chunk.map(async (q: string) => {
          const searchParams = new URLSearchParams({
            q: q,
            type: type,
            limit: limit.toString()
          })
          const searchResponse = await fetch(`https://api.spotify.com/v1/search?${searchParams}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          })
          
          if (!searchResponse.ok) {
            const errText = await searchResponse.text();
            console.error('Spotify API error for query:', q, searchResponse.status, errText);
            return { error: true, status: searchResponse.status, message: errText, query: q };
          }
          return searchResponse.json();
        });
        
        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
        
        // Delay más conservador para evitar ban temporal de Spotify (429 Too Many Requests)
        if (i + chunkSize < queries.length) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }
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
