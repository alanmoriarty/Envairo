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

