import { getArtists, searchTracks } from './spotifyApi';

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
  const blockedArtists = blacklistArtists.map(a => normalizeString(a.name || a));
  const trackArtistNames = (track.artists || '').split(',').map(normalizeString);
  
  for (const name of trackArtistNames) {
    if (blockedArtists.includes(name)) {
      return { approved: false, reason: `El artista ${name} está en la lista negra.` };
    }
  }

  // 2. Blacklist Songs
  if (blacklistSongs && blacklistSongs.length > 0) {
    const blocked = blacklistSongs.some(s => 
      normalizeString(track.name).includes(normalizeString(s))
    );
    if (blocked) {
      return { approved: false, reason: 'Canción en lista negra' };
    }
  }

  // 3. Genres Check (Whitelist & Blacklist)
  if (whitelistGenres.length > 0 || blacklistGenres.length > 0) {
    const artistName = track.artists ? track.artists.split(',')[0] : '';
    const trackGenre = await getTrackGenre(track.name, artistName);
    
    if (!trackGenre) {
      // Si la canción no tiene tags o no la encontramos, requiere revisión manual
      return { approved: null, reason: 'No se encontraron etiquetas de género para esta pista' };
    }

    const normalizedTrackGenre = normalizeString(trackGenre);

    // Si hay lista blanca, el género DEBE estar incluido
    if (whitelistGenres.length > 0) {
      const allowedGenres = whitelistGenres.map(g => normalizeString(g));
      if (!allowedGenres.some(ag => normalizedTrackGenre.includes(ag))) {
        return { approved: false, reason: `El género "${trackGenre}" no está en la lista blanca permitida.` };
      }
    }

    // Si hay lista negra, el género NO DEBE estar incluido
    if (blacklistGenres.length > 0) {
      const blockedGenres = blacklistGenres.map(g => normalizeString(g));
      if (blockedGenres.some(bg => normalizedTrackGenre.includes(bg))) {
        return { approved: false, reason: `El género "${trackGenre}" está prohibido en esta sesión.` };
      }
    }
  }

  // Si pasó todas las pruebas
  return { approved: true, reason: 'Aprobada por Auto DJ' };
}


