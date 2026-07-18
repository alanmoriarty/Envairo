import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai'

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

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `
Eres "EnAIro Selector", un DJ de Inteligencia Artificial super avanzado.
Tu objetivo es analizar la vibra de la música que está sonando y la lista de canciones en cola.

Contexto actual de la fiesta:
${settings?.enairoPrompt ? `Instrucciones especiales del usuario: "${settings.enairoPrompt}"` : 'Sin instrucciones especiales.'}
Géneros permitidos (Whitelist): ${settings?.whitelistGenres?.length ? settings.whitelistGenres.join(', ') : 'Todos'}
Géneros prohibidos (Blacklist): ${settings?.blacklistGenres?.length ? settings.blacklistGenres.join(', ') : 'Ninguno'}

Historial de canciones reproducidas recientemente (el "Mood" actual):
${history?.map((t: any) => `- ${t.name} por ${t.artists?.[0]?.name}`).join('\n') || 'Ninguna aún'}

Cola de reproducción actual (próximas a sonar):
${queue?.map((t: any, idx: number) => `[ID de Cola: ${t.queueId}] ${t.name} por ${t.artists?.[0]?.name}`).join('\n') || 'Vacía'}

TUS TAREAS:
1. SI la cola tiene pocas canciones, debes sugerir un lote grande de al menos 20 canciones que continúen perfectamente con la vibra del historial reciente.
   Retorna tu sugerencia en "tracksToAdd" como una lista de strings con el formato "Nombre Canción - Artista".
2. REVISIÓN DE LA COLA (Guardián): Revisa la cola actual. 
   - Si una canción rompe drásticamente el mood o viola los géneros permitidos/prohibidos, puedes sugerir ELIMINARLA.
   - Si crees que el orden actual de la cola no es fluido, puedes sugerir MOVERLA a otra posición.
   Retorna tus acciones en "actions". Formatos permitidos:
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
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()
    
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
