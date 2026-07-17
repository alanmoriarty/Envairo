import { getArtists, getRecommendations } from './spotifyApi';

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

/**
 * Evalúa si una canción cumple con las reglas del Auto DJ
 */
export async function evaluateTrack(track, settings) {
  const { 
    blacklistGenres = [], 
    whitelistArtists = [], 
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

  // 2. Whitelist Artists (Si hay whitelist, SOLO se permiten esos artistas)
  if (whitelistArtists.length > 0) {
    const allowedArtists = whitelistArtists.map(a => normalizeString(a.name || a));
    let isAllowed = false;
    for (const name of trackArtistNames) {
      if (allowedArtists.includes(name)) {
        isAllowed = true;
        break;
      }
    }
    if (!isAllowed) {
      return { approved: false, reason: `Ninguno de los artistas está en la lista blanca permitida.` };
    }
  }

  // 3. Blacklist Genres
  if (blacklistGenres.length > 0 && track.artistIds && track.artistIds.length > 0) {
    const blockedGenres = blacklistGenres.map(g => normalizeString(g));
    const mainArtistId = track.artistIds[0];
    const artistGenres = await getArtistGenres(mainArtistId);
    
    for (const genre of artistGenres) {
      // Búsqueda parcial: si el género del artista es "latin pop" y bloqueamos "pop", se bloquea
      if (blockedGenres.some(bg => genre.includes(bg))) {
        return { approved: false, reason: `El género "${genre}" está prohibido en esta sesión.` };
      }
    }
  }

  // Si pasó todas las pruebas
  return { approved: true, reason: 'Aprobada por Auto DJ' };
}

/**
 * Obtiene recomendaciones para llenar la cola, filtrando según las reglas
 */
export async function getAutoQueueRecommendations(history, settings) {
  // Tomar hasta 5 semillas del historial reciente
  const seedTracks = history.slice(0, 5).map(t => t.id).filter(Boolean);
  if (seedTracks.length === 0) return null;

  try {
    const data = await getRecommendations(seedTracks, 20); // Pedimos 20 para tener opciones tras filtrar
    if (!data || !data.tracks) return null;

    for (const apiTrack of data.tracks) {
      const normalizedTrack = {
        id: apiTrack.id,
        uri: apiTrack.uri,
        name: apiTrack.name,
        artists: apiTrack.artists.map((a) => a.name).join(', '),
        artistIds: apiTrack.artists.map((a) => a.id),
        album: apiTrack.album.name,
        image: apiTrack.album.images?.[0]?.url,
        duration_ms: apiTrack.duration_ms,
      };

      const result = await evaluateTrack(normalizedTrack, settings);
      if (result.approved) {
        return normalizedTrack;
      }
    }
    
    // Si ninguna de las 20 pasó el filtro, devolver null
    return null;
  } catch (err) {
    console.error('Error fetching recommendations for Auto DJ', err);
    return null;
  }
}
