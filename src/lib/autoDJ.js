import { sanitizePrompt } from '../utils/security';

/**
 * Normaliza textos (ej. "Reggaetón" -> "reggaeton")
 */
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

async function getTrackGenresArray(trackName, artistName) {
  const genres = new Set();

  // 1. iTunes API (Multiple results to capture variants)
  try {
    const term = encodeURIComponent(`${trackName} ${artistName}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&limit=5&entity=song`);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      data.results.forEach(r => {
        if (r.primaryGenreName) genres.add(normalizeString(r.primaryGenreName));
      });
    }
  } catch (err) {
    console.error('Error fetching iTunes genre', err);
  }



  return Array.from(genres);
}

/**
 * Evalúa si una canción cumple con las reglas del Auto DJ
 */
export async function evaluateTrack(track, settings) {
  const {
    whitelistGenres = [],
    blacklistGenres = [],
    blacklistSongs = [],
    blacklistArtists = [],
    allowRepeats = false
  } = settings;

  // 1. Blacklist Artists
  const blockedArtists = blacklistArtists.map(a => normalizeString(a.name || a)).filter(Boolean);
  const trackArtistNames = (track.artists || '').split(',').map(normalizeString).filter(Boolean);

  for (const name of trackArtistNames) {
    if (blockedArtists.includes(name)) {
      return { approved: false, reason: `El artista ${name} está en la lista negra.` };
    }
  }

  // 2. Blacklist Songs
  if (blacklistSongs && blacklistSongs.length > 0) {
    const validBlockedSongs = blacklistSongs.map(normalizeString).filter(Boolean);
    if (validBlockedSongs.length > 0) {
      const blocked = validBlockedSongs.some(s =>
        normalizeString(track.name).includes(s)
      );
      if (blocked) {
        return { approved: false, reason: 'Canción en lista negra' };
      }
    }
  }

  // 3. Genres Check (Whitelist & Blacklist)
  const validWhitelist = whitelistGenres.map(normalizeString).filter(Boolean);
  const validBlacklist = blacklistGenres.map(normalizeString).filter(Boolean);

  // Solo requerimos género si el filtro está activo Y tenemos token de Spotify
  const needsGenreCheck = validWhitelist.length > 0 || validBlacklist.length > 0;
  let trackGenre = null;

  if (needsGenreCheck) {
    const artistName = track.artists ? track.artists.split(',')[0] : '';
    const trackGenres = await getTrackGenresArray(track.name, artistName);

    if (!trackGenres || trackGenres.length === 0) {
      return { approved: null, reason: 'No se encontraron etiquetas de género para esta pista' };
    }

    if (validWhitelist.length > 0) {
      const hasAllowedGenre = trackGenres.some(tg =>
        validWhitelist.some(ag => tg === ag || tg.includes(ag))
      );
      if (!hasAllowedGenre) {
        return { approved: false, reason: `Ninguno de los géneros (${trackGenres.join(', ')}) está en la lista blanca permitida.` };
      }
    }

    if (validBlacklist.length > 0) {
      const blockedGenre = trackGenres.find(tg =>
        validBlacklist.some(bg => tg === bg || tg.includes(bg))
      );
      if (blockedGenre) {
        return { approved: false, reason: `El género "${blockedGenre}" está prohibido en esta sesión.` };
      }
    }
  }

  // 4. DeepSeek AI Explicit Check
  if (settings.explicitFilter) {
    try {
      const { supabase } = await import('./supabase');
      const { data: explicitData, error: explicitError } = await supabase.functions.invoke('enairo-selector', {
        body: {
          action_mode: 'check_single_explicit',
          trackName: `${track.name} - ${track.artists}`
        }
      });
      if (!explicitError && explicitData && explicitData.isExplicit) {
        return { approved: false, reason: 'Contenido explícito bloqueado' };
      }
    } catch (err) {
      console.error('Explicit check failed in AutoDJ', err);
    }
  }

  // 5. DeepSeek AI Prompt Filter for Auto-DJ
  if (settings.autoDjPrompt && settings.autoDjPrompt.trim() !== '') {
    try {
      const { supabase } = await import('./supabase');
      const { data: promptData, error: promptError } = await supabase.functions.invoke('enairo-selector', {
        body: {
          action_mode: 'check_single_prompt',
          trackName: `${track.name} - ${track.artists}`,
          prompt: sanitizePrompt(settings.autoDjPrompt)
        }
      });
      if (!promptError && promptData) {
        if (!promptData.approved) {
          return { approved: false, reason: promptData.reason || 'No encaja con el prompt de envAIro Filter' };
        }
      }
    } catch (err) {
      console.error('Auto-DJ Prompt check failed', err);
    }
  }

  // Si pasó todas las pruebas
  return { approved: true, reason: 'Aprobada por envAIro Filter' };
}

/**
 * Selecciona una canción aleatoria del "Pool Local" (Playlists de usuario, Historial, Cola y Peticiones)
 * cuando la cola se vacía y el AutoDJ está encendido.
 */
export async function getAutoQueueRecommendations(playHistory = [], settings = {}) {
  const pool = new Map(); // Usamos un Map para evitar duplicados por ID

  let currentState = null;
  try {
    const { usePlayerStore } = await import('../store/usePlayerStore');
    currentState = usePlayerStore.getState();
  } catch (err) {
    console.warn('No se pudo acceder a usePlayerStore desde AutoDJ', err);
  }

  if (currentState) {
    // Solo extraer canciones de la cola actual (NO del historial de reproducción)
    if (Array.isArray(currentState.queue)) {
      currentState.queue.forEach(track => {
        if (track && track.id) {
          pool.set(track.id, { ...track, source: track.requestedBy || 'Queue' });
        }
      });
    }
  }

  // Convertimos a array
  let tracksPool = Array.from(pool.values());

  // Solo permitir canciones pedidas por invitados reales (ignorar envAIro Filter, Auto DJ e Historial)
  tracksPool = tracksPool.filter(track => {
    if (!track.requestedBy) return false;
    const rb = track.requestedBy;
    return rb !== 'envAIro Filter' && rb !== 'Auto DJ' && !rb.includes('Playlist') && !rb.includes('Historial') && rb !== 'Host';
  });

  // FILTRO ESTRICTO: Excluir NINGUNA canción que ya haya sonado en el historial (playHistory)
  const allPlayedIds = new Set((playHistory || []).map(t => t.id).filter(Boolean));
  const allPlayedNames = new Set((playHistory || []).map(t => (t.name || '').toLowerCase().trim()).filter(Boolean));

  tracksPool = tracksPool.filter(track => {
    const normName = (track.name || '').toLowerCase().trim();
    return !allPlayedIds.has(track.id) && !allPlayedNames.has(normName);
  });

  // 5. Shuffle (Aleatorizar)
  tracksPool.sort(() => Math.random() - 0.5);

  // 6. Evaluar contra los filtros (Blacklist, etc.)
  for (const track of tracksPool) {
    const evaluation = await evaluateTrack(track, settings);
    if (evaluation.approved) {
      return track;
    }
  }

  // Si no hay canciones sin sonar en el pool local, generar una recomendación fresca vía IA (envAIro Selector)
  try {
    const { supabase } = await import('./supabase');
    const todayPlayHistory = (playHistory || []).filter(t => t && t.id);
    const playedSongNames = todayPlayHistory.map(t => `${t.name} - ${typeof t.artists === 'string' ? t.artists : (t.artists || []).map(a => a.name || a).join(', ')}`);

    const { data, error } = await supabase.functions.invoke('enairo-selector', {
      body: {
        action_mode: 'generate',
        history: todayPlayHistory.slice(-5),
        playedHistory: playedSongNames,
        queue: currentState?.queue || [],
        settings: {
          enairoPrompt: settings.autoDjPrompt || settings.enairoPrompt || 'música variada según el ambiente',
          whitelistGenres: settings.whitelistGenres || [],
          blacklistGenres: settings.blacklistGenres || [],
          blacklistSongs: Array.from(new Set([...(settings.blacklistSongs || []), ...playedSongNames])),
          blacklistArtists: settings.blacklistArtists || [],
          trackCount: 1
        }
      }
    });

    if (!error && data && data.tracksToAdd && data.tracksToAdd.length > 0) {
      const { data: searchData } = await supabase.functions.invoke('search-spotify', {
        body: { queries: data.tracksToAdd, type: 'track', limit: 1, filterExplicit: settings.explicitFilter }
      });

      if (searchData && searchData.results) {
        const freshTracks = searchData.results.map((res) => {
          if (res && res.tracks && res.tracks.items && res.tracks.items.length > 0) {
            const spotifyTrack = res.tracks.items[0];
            return {
              id: spotifyTrack.id,
              name: spotifyTrack.name,
              artists: spotifyTrack.artists.map(a => a.name).join(', '),
              image: spotifyTrack.album?.images?.[0]?.url || '',
              duration_ms: spotifyTrack.duration_ms,
              uri: spotifyTrack.uri,
              source: 'spotify',
              addedBy: 'envAIro Filter'
            };
          }
          return null;
        }).filter(Boolean);

        const unplayedFresh = freshTracks.filter(track => !allPlayedIds.has(track.id) && !allPlayedNames.has((track.name || '').toLowerCase().trim()));
        if (unplayedFresh.length > 0) {
          const evaluation = await evaluateTrack(unplayedFresh[0], settings);
          if (evaluation.approved) {
            return unplayedFresh[0];
          }
        }
      }
    }
  } catch (err) {
    console.error('Error generando canción fresca para envAIro Filter:', err);
  }

  return null;
}
