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

    // Obtener API Keys
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    const deepSeekKey = Deno.env.get('DEEPSEEK_API_KEY') || 'sk-23ebc3e95db346e7a3d1bc401a4d1e02'

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
2. DIVERSIDAD EXTREMA: NUNCA repitas el mismo artista en la lista, es decir, cada canción debe tener un artista diferente.
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

    const askGemini = async (promptText: string) => {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
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

      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    };

    const askDeepSeek = async (promptText: string) => {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepSeekKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'Eres un supervisor de seguridad experto. Tu objetivo principal es evitar contenido explícito. SIEMPRE respondes con un JSON válido.' },
            { role: 'user', content: promptText }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`DeepSeek API Error (${response.status}): ${errText}`);
        return null;
      }

      const result = await response.json();
      const responseText = result.choices?.[0]?.message?.content || '{}';
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    };

    let finalData;

    if (action_mode === 'generate') {
      // Generación inicial con Gemini
      let parsedData = await askGemini(prompt);

      // Si el filtro explícito está encendido, usamos DeepSeek para revisar y limpiar
      if (settings?.explicitFilter === true && parsedData && Array.isArray(parsedData.tracksToAdd)) {
        const explicitCheckPrompt = `
Revisa la siguiente lista de canciones:
${JSON.stringify(parsedData.tracksToAdd, null, 2)}

TAREA: FILTRO DE CONTENIDO EXPLÍCITO (LETRAS Y VIDEOS)
Analiza estrictamente si ALGUNA de estas canciones tiene letras altamente explícitas o si su video oficial es conocido por tener contenido inapropiado o explícito.
Si detectas canciones inapropiadas:
1. ELIMÍNALAS de la lista.
2. REEMPLÁZALAS por canciones de un género idéntico o muy similar, de la misma época y vibra, pero que sean "Clean" o no explícitas.
Si la canción es segura, mantenla intacta.

REGLAS DE SALIDA:
Devuelve un JSON con la lista FINAL completa (misma cantidad de canciones).
{
  "tracksToAdd": ["Canción 1 - Artista 1", "Nueva Canción Limpia - Artista 2"],
  "actions": [],
  "reasoning": "Menciona qué canciones eliminaste por contenido explícito y por cuáles las reemplazaste."
}`;
        const deepSeekData = await askDeepSeek(explicitCheckPrompt);
        if (deepSeekData && Array.isArray(deepSeekData.tracksToAdd)) {
          finalData = deepSeekData;
        } else {
          finalData = parsedData; // Fallback
        }
      } else {
        finalData = parsedData;
      }
    } else if (action_mode === 'sweep_explicit') {
      // Barrido de la cola actual con DeepSeek
      const sweepPrompt = `
REVISIÓN DE COLA (CONTENIDO EXPLÍCITO)
Aquí está la cola actual de reproducción:
${JSON.stringify(queue.map((t: any) => ({ queueId: t.queueId, name: t.name, artist: t.artists })), null, 2)}

TAREA:
Busca canciones con letras explícitas o videos explícitos.
Para cada canción explícita que encuentres:
1. Emite una acción de tipo "remove" con el 'queueId'.
2. Propón en 'tracksToAdd' una canción nueva del MISMO GÉNERO EXACTO, pero que sea completamente limpia.

REGLAS DE SALIDA:
Devuelve un JSON estrictamente así (vacío si no hay nada que limpiar):
{
  "tracksToAdd": ["Canción Limpia Reemplazo - Artista X"],
  "actions": [
    {"type": "remove", "queueId": "id-de-la-cancion-mala"}
  ],
  "reasoning": "Se eliminó X por contenido explícito y se reemplazó por Y."
}`;
      finalData = await askDeepSeek(sweepPrompt) || { tracksToAdd: [], actions: [] };
    } else {
      // Para 'reorder' hacemos una sola pasada con Gemini
      finalData = await askGemini(prompt);
    } 
    
    return new Response(JSON.stringify(finalData), {
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
