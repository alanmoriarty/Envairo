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
    const { history, queue, settings, action_mode = 'generate' } = await req.json()

    // Obtener API Key de Gemini desde variables de entorno
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no configurada en el servidor.')
    }

    let prompt = '';

    if (action_mode === 'generate') {
      prompt = `
Eres "envAIro Selector", un DJ de Inteligencia Artificial experto en curación musical de clase mundial.
Tu objetivo principal es generar una lista de reproducción basándote ESTRICTAMENTE en las "Instrucciones Especiales".

VIBRA DESEADA (Instrucciones Especiales del Anfitrión): 
""" ${settings?.enairoPrompt || 'Genera canciones que encajen con las restricciones de género y artistas.'} """

IMPORTANTE: Si las instrucciones especiales especifican un género, ambiente o estilo (ej. "tienda de consolas", "electrónica suave", "soundtracks"), DEBES respetarlo al 100%. No agregues rock clásico, pop comercial ni géneros no relacionados si no encajan con la descripción.

Filtros de Seguridad:
- Géneros permitidos exclusivos: ${settings?.whitelistGenres?.length ? settings.whitelistGenres.join(', ') : 'Cualquiera que encaje con la vibra'}
- Géneros bloqueados: ${settings?.blacklistGenres?.length ? settings.blacklistGenres.join(', ') : 'Ninguno'}
- Artistas PROHIBIDOS: ${settings?.blacklistArtists?.length ? settings.blacklistArtists.join(', ') : 'Ninguno'}
- Canciones PROHIBIDAS: ${settings?.blacklistSongs?.length ? settings.blacklistSongs.join(', ') : 'Ninguna'}

REGLAS DE ORO:
1. Genera una lista EXACTA de ${settings?.trackCount || 35} sugerencias de canciones (formato "Nombre Canción - Artista"). IMPORTANTE: Si el usuario especifica una cantidad exacta en las Instrucciones Especiales (ej. "dame 10 canciones" o "solo 5"), DEBES ignorar tu límite por defecto y generar EXACTAMENTE esa cantidad solicitada (máximo absoluto 50).
2. DIVERSIDAD EXTREMA: NUNCA repitas el mismo artista en la lista, por lo menos exista un espacio de 5 canciones si retornas al mismo artista en el resultado.
3. TRANSICIONES: El orden debe tener fluidez (ej. no saltes de una balada lenta a algo extremadamente agresivo de golpe).
4. REVISIÓN: Antes de generar la respuesta revisa una vez más, para cumplir las reglas, tomate un momento.

REGLAS DE SALIDA:
Responde ESTRICTAMENTE con un objeto JSON válido.
Estructura esperada:
{
  "tracksToAdd": ["Canción 1 - Artista 1", "Canción 2 - Artista 2"],
  "actions": [],
  "reasoning": "Explica brevemente por qué tu selección cumple EXACTAMENTE con las instrucciones especiales (vibra) pedidas."
}
`
    } else if (action_mode === 'reorder') {
      const isInitial = settings?.isInitialReorder === true;

      prompt = `
Eres "envAIro Selector", un DJ de Inteligencia Artificial.
Tienes conocimiento de generos músicales tanto actuales como anteriores a nuestra época.
Tu ÚNICA tarea ahora es revisar la cola de reproducción pendiente (queue) y reordenarla para garantizar transiciones suaves entre géneros musicales y niveles de energía (ej. no saltar de balada acústica a heavy metal bruscamente). 
REGLA MUY IMPORTANTE DE ESPACIADO: DEBES separar las canciones del mismo artista. Está estrictamente PROHIBIDO dejar dos o más canciones del mismo artista juntas de forma consecutiva. Asegúrate de que haya varias canciones de diferencia entre apariciones del mismo artista.
${isInitial ?
          'REGLA ESTRICTA: Este es el primer ordenamiento. NO PUEDES ELIMINAR (remove) ninguna canción bajo ninguna circunstancia. Solo debes reordenarlas.' :
          'También puedes ELIMINAR (remove) canciones, pero SOLO aquellas que no cumplan con el género musical o rompan completamente la vibra de la lista.'}

Cola actual pendiente (ESTAS SON LAS QUE DEBES REORDENAR${isInitial ? '' : ' O ELIMINAR'}):
${JSON.stringify(queue.map((t: any, i: number) => ({ index: i, id: t.queueId, name: t.name, artist: t.artists })))}

ACCIONES PERMITIDAS:
${isInitial ? '' : '- {"type": "remove", "queueId": "id_de_la_cola"}\n'}- {"type": "reorder", "queueId": "id_de_la_cola", "newIndex": indice_entero} (donde newIndex es la nueva posición deseada dentro de la cola)

REGLAS DE SALIDA:
Responde ESTRICTAMENTE con un objeto JSON (sin formato Markdown). No añadas canciones nuevas.
Estructura esperada:
{
  "tracksToAdd": [],
  "actions": [
    ${isInitial ? '' : '{"type": "remove", "queueId": "id-ejemplo-123"},\n    '}{"type": "reorder", "queueId": "id-ejemplo-456", "newIndex": 2}
  ],
  "reasoning": "Breve explicación de los cambios que hiciste para mejorar la transición."
}
`
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const result = await response.json();
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    // Limpiar backticks si la IA los añade accidentalmente a pesar del response_format
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    return new Response(JSON.stringify(parsedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error en enairo-selector:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})
