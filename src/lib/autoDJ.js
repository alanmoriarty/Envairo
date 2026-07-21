import { getArtists, searchTracks, getRecommendations } from './spotifyApi';

const artistGenreCache = new Map();

/**
 * Normaliza textos (ej. "Reggaetón" -> "reggaeton")
 */
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Obtiene los géneros de un artista, usando caché para no saturar la API
 */
async function getArtistGenres(artistId) {
  if (!artistId) return [];
  if (artistGenreCache.has(artistId)) {
    return artistGenreCache.get(artistId);
  }
  
  try {
    const data = await getArtists([artistId]);
    if (data && data.artists && data.artists[0]) {
      const genres = data.artists[0].genres.map(normalizeString);
      artistGenreCache.set(artistId, genres);
      return genres;
    }
  } catch (err) {
    console.error('Error fetching artist genres', err);
  }
  
  return [];
}

async function getTrackGenre(trackName, artistName) {
  try {
    const term = encodeURIComponent(`${trackName} ${artistName}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&limit=1&entity=song`);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].primaryGenreName;
    }
  } catch (err) {
    console.error('Error fetching track genre', err);
  }
  return null;
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

  if (validWhitelist.length > 0 || validBlacklist.length > 0) {
    const artistName = track.artists ? track.artists.split(',')[0] : '';
    const trackGenre = await getTrackGenre(track.name, artistName);
    
    if (!trackGenre) {
      // Si la canción no tiene tags o no la encontramos, requiere revisión manual
      return { approved: null, reason: 'No se encontraron etiquetas de género para esta pista' };
    }

    const normalizedTrackGenre = normalizeString(trackGenre);

    // Si hay lista blanca, el género DEBE coincidir parcialmente (bidireccional)
    if (validWhitelist.length > 0) {
      if (!validWhitelist.some(ag => normalizedTrackGenre.includes(ag))) {
        return { approved: false, reason: `El género "${trackGenre}" no está en la lista blanca permitida.` };
      }
    }

    // Si hay lista negra, el género NO DEBE coincidir
    if (validBlacklist.length > 0) {
      if (validBlacklist.some(bg => normalizedTrackGenre.includes(bg))) {
        return { approved: false, reason: `El género "${trackGenre}" está prohibido en esta sesión.` };
      }
    }
  }

  // Si pasó todas las pruebas
  return { approved: true, reason: 'Aprobada por Auto DJ' };
}

export async function getAutoQueueRecommendations(playHistory, settings) {
  // Extract seed tracks from history (most recent first, up to 5)
  const recentTracks = playHistory
    .filter(t => t.id && !t.id.includes('youtube')) // Ignore youtube ids if any
    .slice(0, 5)
    .map(t => t.id);

  if (recentTracks.length === 0) return null;

  try {
    const data = await getRecommendations(recentTracks, 10);
    if (!data || !data.tracks || data.tracks.length === 0) return null;

    // Evaluate each track against current settings
    for (const track of data.tracks) {
      const result = await evaluateTrack(track, settings);
      if (result.approved) {
        return track; // Return the first valid one
      }
    }
  } catch (err) {
    console.error('Error fetching recommendations in autoDJ:', err);
  }

  return null;
}
