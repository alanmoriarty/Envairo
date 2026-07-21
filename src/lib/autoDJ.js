import { getArtists, searchTracks, getRecommendations } from './spotifyApi';
import { getAccessToken } from './spotifyAuth';

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

  // 2. Spotify API (If token available)
  if (getAccessToken()) {
    try {
      const searchRes = await searchTracks(`${trackName} ${artistName}`);
      if (searchRes && searchRes.length > 0) {
        const firstTrack = searchRes[0];
        if (firstTrack.artists && firstTrack.artists[0] && firstTrack.artists[0].id) {
          const spotifyGenres = await getArtistGenres(firstTrack.artists[0].id);
          spotifyGenres.forEach(g => genres.add(g));
        }
      }
    } catch (err) {
      console.error('Error fetching Spotify genre in AutoDJ', err);
    }
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
        validWhitelist.some(ag => tg.includes(ag) || ag.includes(tg))
      );
      if (!hasAllowedGenre) {
        return { approved: false, reason: `Ninguno de los géneros (${trackGenres.join(', ')}) está en la lista blanca permitida.` };
      }
    }

    if (validBlacklist.length > 0) {
      const blockedGenre = trackGenres.find(tg => 
        validBlacklist.some(bg => tg.includes(bg) || bg.includes(tg))
      );
      if (blockedGenre) {
        return { approved: false, reason: `El género "${blockedGenre}" está prohibido en esta sesión.` };
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
  if (!getAccessToken()) return null; // Auto DJ silently disabled if no Spotify token

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
