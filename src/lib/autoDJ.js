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
export async function evaluateTrack(track, settings, queue = [], playHistory = []) {
  const {
    whitelistGenres = [],
    blacklistGenres = [],
    blacklistSongs = [],
    blacklistArtists = [],
    repeatCooldown = -1,
    artistRepeatCooldown = -1,
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

  // 1b. Artist Repeat Cooldown Check (Variedad de Artistas)
  if (artistRepeatCooldown !== -1 && trackArtistNames.length > 0) {
    // Verificar si el artista ya tiene canciones por sonar en la cola activa
    const artistInQueue = queue.some(t => {
      const qArtists = (t.artists || '').split(',').map(normalizeString).filter(Boolean);
      return trackArtistNames.some(ta => qArtists.includes(ta));
    });

    if (artistInQueue) {
      return { approved: false, reason: `Ya hay canciones de este artista en la cola de reproducción.` };
    }

    // Verificar si el artista sonó recientemente en el historial
    const now = Date.now();
    for (const h of playHistory) {
      if (!h.playedAt) continue;
      const hArtists = (h.artists || '').split(',').map(normalizeString).filter(Boolean);
      const isSameArtist = trackArtistNames.some(ta => hArtists.includes(ta));

      if (isSameArtist) {
        const playedTime = new Date(h.playedAt).getTime();
        const diffMinutes = (now - playedTime) / (1000 * 60);

        if (artistRepeatCooldown === 0) {
          return { approved: false, reason: `Este artista ya fue reproducido en esta sesión.` };
        } else if (diffMinutes < artistRepeatCooldown) {
          const remaining = Math.ceil(artistRepeatCooldown - diffMinutes);
          return { approved: false, reason: `Este artista sonó recientemente. Disponible en ${remaining} min.` };
        }
      }
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
 * Auto-DJ no añade canciones automáticamente a la cola.
 */
export async function getAutoQueueRecommendations(playHistory = [], settings = {}) {
  return null;
}
