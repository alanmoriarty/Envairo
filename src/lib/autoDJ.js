import { getArtists, getArtistTopTracks } from './spotifyApi';

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
 * Obtiene recomendaciones para llenar la cola basándose en un artista reciente
 */
export async function getAutoQueueRecommendations(history, settings) {
  if (history.length === 0) return null;

  // Tomar un artista al azar de las últimas 5 canciones
  const recentTracks = history.slice(0, 5);
  const randomTrack = recentTracks[Math.floor(Math.random() * recentTracks.length)];
  const artistId = randomTrack.artistIds?.[0];
  
  if (!artistId) return null;

  try {
    // Usamos el endpoint de top-tracks ya que recommendations fue deprecado por Spotify
    const data = await getArtistTopTracks(artistId);
    if (!data || !data.tracks) return null;

    // Desordenar las top tracks para dar variedad
    const shuffledTracks = data.tracks.sort(() => 0.5 - Math.random());

    for (const apiTrack of shuffledTracks) {
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

      // Si no permitimos repetidas, verificamos que no esté en el historial reciente
      if (!settings.allowRepeats) {
        if (history.slice(0, 30).some(t => t.id === normalizedTrack.id)) continue;
      }

      const result = await evaluateTrack(normalizedTrack, settings);
      if (result.approved) {
        return normalizedTrack;
      }
    }
    
    return null;
  } catch (err) {
    console.error('Error fetching auto DJ track', err);
    return null;
  }
}
