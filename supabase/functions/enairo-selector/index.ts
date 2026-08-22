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
    const reqBody = await req.json()
    const { history = [], playedHistory = [], queue = [], settings, action_mode = 'generate' } = reqBody

    // Formatear historial de sesión para el prompt
    const sessionHistoryList = Array.isArray(playedHistory) && playedHistory.length > 0
      ? playedHistory.map((song: string, idx: number) => `${idx + 1}. ${song}`).join('\n')
      : (Array.isArray(history) && history.length > 0 
          ? history.map((t: any, idx: number) => `${idx + 1}. ${t.name} - ${typeof t.artists === 'string' ? t.artists : (t.artists || []).map((a: any) => a.name || a).join(', ')}`).join('\n')
          : 'Ninguna (la sesión acaba de comenzar)');

    // Obtener API Keys
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    const deepSeekKey = Deno.env.get('DEEPSEEK_API_KEY') || 'sk-23ebc3e95db346e7a3d1bc401a4d1e02'

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no configurada en el servidor.')
    }

    let prompt = '';
    let systemPrompt = '';

    if (action_mode === 'generate') {
      prompt = `
Eres "envAIro Selector", un DJ de Inteligencia Artificial experto en curación musical de clase mundial.
Tu objetivo principal es generar una lista de reproducción fresca y continua basándote ESTRICTAMENTE en las "Instrucciones Especiales" y respetando el historial de la sesión.

VIBRA DESEADA (Instrucciones Especiales del Anfitrión): 
""" ${settings?.enairoPrompt || 'Genera canciones que encajen con las restricciones de género y artistas.'} """

IMPORTANTE: Si las instrucciones especiales especifican un género, ambiente o estilo (ej. "tienda de consolas", "electrónica suave", "soundtracks"), DEBES respetarlo al 100%. No agregues rock clásico, pop comercial ni géneros no relacionados si no encajan con la descripción.

HISTORIAL DE CANCIONES QUE YA HAN SONADO EN ESTA SESIÓN:
${sessionHistoryList}

Filtros de Seguridad:
- Géneros permitidos exclusivos: ${settings?.whitelistGenres?.length ? settings.whitelistGenres.join(', ') : 'Cualquiera que encaje con la vibra'}
- Géneros bloqueados: ${settings?.blacklistGenres?.length ? settings.blacklistGenres.join(', ') : 'Ninguno'}
- Artistas PROHIBIDOS: ${settings?.blacklistArtists?.length ? settings.blacklistArtists.join(', ') : 'Ninguno'}
- Canciones PROHIBIDAS: ${settings?.blacklistSongs?.length ? settings.blacklistSongs.join(', ') : 'Ninguna'}
${settings?.explicitFilter ? '- FILTRO EXPLÍCITO ESTRICTO (ACTIVADO): Queda estrictamente PROHIBIDO incluir canciones con groserías, letras vulgares, contenido sexual explícito, violencia o doble sentido obsceno. Todas las pistas deben ser 100% limpias y aptas para todo público.' : ''}

REGLAS DE ORO:
1. PROHIBICIÓN TOTAL DE REPETIR CANCIONES: NUNCA sugieras ninguna canción que ya esté presente en el HISTORIAL DE CANCIONES ANTERIOR o en las Canciones PROHIBIDAS. Todas tus sugerencias deben ser canciones NUEVAS que no hayan sonado.
2. CONTINUIDAD CON EL HISTORIAL: Utiliza el historial reciente como referencia de estilo, tempo y energía para que la sesión continúe de forma natural y armónica, aportando variedad y frescura.
3. CANTIDAD EXACTA: Genera una lista EXACTA de ${settings?.trackCount || 35} sugerencias de canciones (formato "Nombre Canción - Artista"). IMPORTANTE: Si el usuario especifica una cantidad exacta en las Instrucciones Especiales (ej. "dame 10 canciones" o "solo 5"), DEBES ignorar tu límite por defecto y generar EXACTAMENTE esa cantidad solicitada (máximo absoluto 50).
4. DIVERSIDAD EXTREMA: NUNCA repitas el mismo artista en la lista generada; cada canción debe ser de un artista diferente. Tampoco repitas artistas que ya hayan tenido protagonismo excesivo en el historial.
5. TRANSICIONES: El orden debe tener fluidez (ej. no saltes de una balada lenta a algo extremadamente agresivo de golpe).
6. REVISIÓN: Antes de generar la respuesta, verifica una por una que ninguna canción sugerida esté en el historial o en los filtros.

REGLAS DE SALIDA:
Responde ESTRICTAMENTE con un objeto JSON válido.
Estructura esperada:
{
  "tracksToAdd": ["Canción 1 - Artista 1", "Canción 2 - Artista 2"],
  "actions": [],
  "reasoning": "Explica brevemente cómo tu selección complementa el historial y cumple EXACTAMENTE con las instrucciones especiales (vibra) pedidas."
}
`
    } else if (action_mode === 'reorder') {
      const isInitial = settings?.isInitialReorder === true;

      prompt = `
Eres "envAIro Selector", un DJ de Inteligencia Artificial.
Tienes conocimiento de generos músicales tanto actuales como anteriores a nuestra época.
Tu ÚNICA tarea ahora es revisar la cola de reproducción pendiente (queue) y reordenarla para garantizar transiciones suaves entre géneros musicales y niveles de energía (ej. no saltar de balada acústica a heavy metal bruscamente). 

CONTEXTO DE LA VIBRA (ESTO ES CRUCIAL):
""" ${settings?.enairoPrompt || 'Genera canciones que encajen con un ambiente de fiesta general.'} """

Filtros de Seguridad Actuales:
- Géneros permitidos: ${settings?.whitelistGenres?.length ? settings.whitelistGenres.join(', ') : 'Cualquiera'}
- Géneros bloqueados: ${settings?.blacklistGenres?.length ? settings.blacklistGenres.join(', ') : 'Ninguno'}
- Artistas PROHIBIDOS: ${settings?.blacklistArtists?.length ? settings.blacklistArtists.join(', ') : 'Ninguno'}
- Canciones PROHIBIDAS: ${settings?.blacklistSongs?.length ? settings.blacklistSongs.join(', ') : 'Ninguna'}

REGLA MUY IMPORTANTE DE ESPACIADO: DEBES separar las canciones del mismo artista. Está estrictamente PROHIBIDO dejar dos o más canciones del mismo artista juntas de forma consecutiva. Asegúrate de que haya varias canciones de diferencia entre apariciones del mismo artista.
${isInitial ?
          'REGLA ESTRICTA: Este es el primer ordenamiento. NO PUEDES ELIMINAR (remove) ninguna canción bajo ninguna circunstancia. Solo debes reordenarlas.' :
          'También puedes ELIMINAR (remove) canciones, pero SOLO aquellas que rompan completamente el CONTEXTO DE LA VIBRA anterior o violen los filtros de seguridad.\nREGLA DE REEMPLAZO: Si ELIMINAS una canción, DEBES proponer en el arreglo "tracksToAdd" el título y artista de una canción NUEVA que SÍ encaje perfectamente con la VIBRA para reemplazar el hueco (formato: "Canción - Artista").'}

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
      const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
      let lastError = null;

      for (const model of models) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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

          if (response.ok) {
            const result = await response.json();
            const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJson);
          } else {
            const errText = await response.text();
            lastError = new Error(`Gemini API Error with ${model} (${response.status}): ${errText}`);
          }
        } catch (e) {
          lastError = e;
        }
      }

      // Fallback a DeepSeek si Gemini falla
      console.warn('Gemini falló, usando fallback de DeepSeek para generación:', lastError);
      const deepSeekFallback = await askDeepSeek(promptText);
      if (deepSeekFallback) return deepSeekFallback;

      throw lastError || new Error('No se pudo generar con Gemini ni DeepSeek');
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
      // Generación inicial con Gemini (eliminamos la segunda capa de DeepSeek según la nueva arquitectura)
      finalData = await askGemini(prompt);
    } else if (action_mode === 'sweep_explicit') {
      // Barrido de la cola actual con DeepSeek
      const sweepPrompt = `
REVISIÓN DE COLA (CONTENIDO EXPLÍCITO)
Aquí está la cola actual de reproducción:
${JSON.stringify(queue.map((t: any) => ({ queueId: t.queueId, name: t.name, artist: t.artists })), null, 2)}

TAREA: FILTRO DE CONTENIDO EXPLÍCITO ESTRICTO
Busca canciones que, en su letra, título o contexto cultural, contengan: lenguaje soez (groserías, malas palabras), contenido sexual, doble sentido obsceno, apología a drogas/violencia, o que sean canciones de géneros urbanos conocidas por ser vulgares.
Para cada canción explícita o soez que encuentres:
1. Emite una acción de tipo "remove" con el 'queueId'.
2. Propón en 'tracksToAdd' una canción nueva del MISMO GÉNERO EXACTO, pero que sea 100% limpia y apta para todo público.

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
    } else if (action_mode === 'check_single_explicit') {
      const trackName = reqBody.trackName || '';
      const singlePrompt = `Eres un filtro censor extremadamente estricto. Analiza la siguiente canción: "${trackName}".
Responde "YES" si la canción, su letra, su título o su contexto cultural contiene: lenguaje soez (groserías, malas palabras), contenido sexual, doble sentido obsceno, apología a drogas/violencia, o si es una canción de reggaetón/champeta/urbano conocida por ser vulgar o inapropiada para niños.
Responde "NO" solo si estás 100% seguro de que es una canción totalmente limpia y apta para todo público.
DEBES responder ÚNICAMENTE con un JSON válido en este formato exacto: {"isExplicit": true} o {"isExplicit": false}. NO agregues ningún otro texto.`;
      finalData = await askDeepSeek(singlePrompt) || { isExplicit: false };
    } else if (action_mode === 'check_single_prompt') {
      const trackName = reqBody.trackName || '';
      const filterPrompt = reqBody.prompt || '';
      const singlePrompt = `Eres un selector musical estricto (Auto DJ). Analiza la siguiente canción: "${trackName}".
El usuario ha establecido el siguiente filtro/prompt estricto para la música que desea que suene: "${filterPrompt}".
¿Esta canción encaja bien con este filtro? 
DEBES responder ÚNICAMENTE con un JSON válido en este formato exacto: {"approved": true, "reason": "Breve razón"} o {"approved": false, "reason": "Breve razón"}. NO agregues ningún otro texto.`;
      finalData = await askDeepSeek(singlePrompt) || { approved: false, reason: "Error en la IA" };
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
