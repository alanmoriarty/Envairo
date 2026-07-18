import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejar OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { history, queue, settings } = await req.json()
    
    // Obtener API Key de Gemini desde variables de entorno
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no configurada en el servidor.')
    }

    const prompt = `
Eres "EnAIro Selector", un DJ de Inteligencia Artificial super avanzado.
Tu tarea es analizar la música que ha sonado (history) y la cola de reproducción actual (queue).
Las configuraciones del administrador son:
- Instrucciones especiales: ${settings?.enairoPrompt || 'Ninguna'}
- Géneros permitidos: ${settings?.whitelistGenres?.length ? settings.whitelistGenres.join(', ') : 'Todos'}
- Géneros bloqueados: ${settings?.blacklistGenres?.length ? settings.blacklistGenres.join(', ') : 'Ninguno'}
- Artistas PROHIBIDOS: ${settings?.blacklistArtists?.length ? settings.blacklistArtists.join(', ') : 'Ninguno'}
- Canciones PROHIBIDAS: ${settings?.blacklistSongs?.length ? settings.blacklistSongs.join(', ') : 'Ninguna'}

El usuario quiere mantener el ambiente perfecto. 
Analiza el history para entender la vibra actual.
Analiza la queue para ver qué viene.
Genera una lista EXACTA de 15 sugerencias de canciones (formato "Nombre Canción - Artista") que encajen perfectamente.
Además, si en la queue hay alguna canción que rompa completamente la vibra, genera una acción de "remove".
Si hay que reordenar, usa "reorder".

Historial reciente:
${JSON.stringify(history.map((t: any) => t.name + ' - ' + t.artists))}

Cola actual:
${JSON.stringify(queue.map((t: any, i: number) => ({ index: i, id: t.queueId, name: t.name, artist: t.artists })))}

ACCIONES PERMITIDAS:
- {"type": "remove", "queueId": "id_de_la_cola"}
- {"type": "reorder", "queueId": "id_de_la_cola", "newIndex": indice_entero}

REGLAS DE SALIDA:
Debes responder ESTRICTAMENTE con un objeto JSON válido y nada más (sin backticks de markdown).
Estructura esperada:
{
  "tracksToAdd": ["Canción 1 - Artista 1", "Canción 2 - Artista 2"],
  "actions": [
    {"type": "remove", "queueId": "id-ejemplo-123"},
    {"type": "reorder", "queueId": "id-ejemplo-456", "newIndex": 2}
  ],
  "reasoning": "Breve explicación de por qué tomaste estas decisiones."
}
`

    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
        }
      })
    })

    if (!response.ok) {
      let errorText = await response.text()
      
      // Si da 404, vamos a consultar qué modelos sí están disponibles para esta API Key
      if (response.status === 404) {
        try {
          const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`)
          if (modelsRes.ok) {
            const modelsData = await modelsRes.json()
            const availableModels = modelsData.models?.map((m: any) => m.name).join(', ') || 'Ninguno'
            errorText = `${errorText}\n\n[DEBUG] Modelos disponibles para tu API Key: ${availableModels}`
          } else {
            const fallbackErr = await modelsRes.text()
            errorText = `${errorText}\n\n[DEBUG] Falló listar modelos: ${modelsRes.status} - ${fallbackErr}`
          }
        } catch (e: any) {
          errorText = `${errorText}\n\n[DEBUG] Excepción listar modelos: ${e?.message}`
        }
      }

      throw new Error(`Gemini API Error (${response.status}): ${errorText}`)
    }

    const result = await response.json()
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    
    // Limpiar backticks si Gemini los añade accidentalmente
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim()
    
    const parsedData = JSON.parse(cleanJson)

    return new Response(JSON.stringify(parsedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Error en enairo-selector:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
