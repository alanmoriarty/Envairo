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

  // Si pasó todas las pruebas
  return { approved: true, reason: 'Aprobada por Auto DJ' };
}

/**
 * Selecciona una canción aleatoria del "Pool Local" (Playlists de usuario, Historial, Cola y Peticiones)
 * cuando la cola se vacía y el AutoDJ está encendido.
 */
export async function getAutoQueueRecommendations(playHistory = [], settings = {}) {
  const pool = new Map(); // Usamos un Map para evitar duplicados por ID

  // 1. Extraer canciones de Playlists Personalizadas guardadas localmente
  try {
    const savedPlaylists = JSON.parse(localStorage.getItem('envairo_custom_playlists') || '[]');
    savedPlaylists.forEach(playlist => {
      if (playlist.tracks && Array.isArray(playlist.tracks)) {
        playlist.tracks.forEach(track => {
          if (track && track.id) {
            pool.set(track.id, { ...track, source: 'Custom Playlist' });
          }
        });
      }
    });
  } catch (err) {
    console.error('Error parseando playlists guardadas para AutoDJ', err);
  }

  // Para evitar ciclos e importaciones circulares en el boot, importamos de forma dinámica el store
  let currentState = null;
  try {
    const { usePlayerStore } = await import('../store/usePlayerStore');
    currentState = usePlayerStore.getState();
  } catch (err) {
    console.warn('No se pudo acceder a usePlayerStore desde AutoDJ', err);
  }

  if (currentState) {
    // 2. Extraer de la Cola Completa (Incluye peticiones aprobadas pasadas y envAIro Selector)
    if (Array.isArray(currentState.queue)) {
      currentState.queue.forEach(track => {
        if (track && track.id) {
          pool.set(track.id, { ...track, source: track.requestedBy || 'Queue' });
        }
      });
    }

    // 3. Extraer del Historial de Reproducción
    if (Array.isArray(currentState.playHistory)) {
      currentState.playHistory.forEach(track => {
        if (track && track.id) {
          pool.set(track.id, { ...track, source: 'History' });
        }
      });
    }
  }

  // Convertimos a array
  let tracksPool = Array.from(pool.values());

  // NUEVO FILTRO ESTRICTO: Solo permitir canciones que fueron explícitamente pedidas (ignorar lo que el Auto DJ agregó antes)
  tracksPool = tracksPool.filter(track => track.requestedBy && track.requestedBy !== 'Auto DJ');

  // 4. Filtrar: No queremos repetir canciones que han sonado muy recientemente
  const recentHistory = playHistory.slice(-20).map(t => t.id);
  tracksPool = tracksPool.filter(track => !recentHistory.includes(track.id));

  // 5. Shuffle (Aleatorizar)
  tracksPool.sort(() => Math.random() - 0.5);

  // 6. Evaluar contra los filtros (Blacklist, etc.)
  for (const track of tracksPool) {
    const evaluation = await evaluateTrack(track, settings);
    if (evaluation.approved) {
      return track;
    }
  }

  // Si después de todo no encontramos nada válido (ej. primera canción de la fiesta sin playlists), 
  // devolvemos null y esperamos a que el usuario añada algo.
  return null;
}
