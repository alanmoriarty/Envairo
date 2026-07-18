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

/**
 * Evalúa si una canción cumple con las reglas del Auto DJ
 */
export async function evaluateTrack(track, settings) {
  const { 
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

export async function getAutoQueueRecommendations(history, settings) {
  if (history.length === 0) return null;

  // Tomar un track al azar de los últimos 5 para usar como "semilla"
  const recentTracks = history.slice(0, 5);
  const randomTrack = recentTracks[Math.floor(Math.random() * recentTracks.length)];
  const artistName = randomTrack.artists ? randomTrack.artists.split(',')[0].trim() : null;
  const artistId = randomTrack.artistIds && randomTrack.artistIds.length > 0 ? randomTrack.artistIds[0] : null;
  
  if (!artistName) return null;

  try {
    let searchResults = null;
    let usedGenre = false;

    // Intentar obtener géneros del artista para buscar canciones SIMILARES de ese mismo género
    if (artistId) {
      const genres = await getArtistGenres(artistId);
      if (genres && genres.length > 0) {
        // Elegir un género al azar de los que tiene el artista
        const randomGenre = genres[Math.floor(Math.random() * genres.length)];
        // Búsqueda en Spotify por género exacto
        searchResults = await searchTracks(`genre:"${randomGenre}"`, 50);
        usedGenre = true;
      }
    }

    // Fallback: Si no tiene géneros o la búsqueda por género falló/no devolvió nada, 
    // buscamos por nombre de artista o algo más genérico.
    if (!searchResults || !searchResults.tracks || !searchResults.tracks.items || searchResults.tracks.items.length === 0) {
      searchResults = await searchTracks(`artist:"${artistName}"`, 50);
      usedGenre = false;
    }

    if (!searchResults || !searchResults.tracks || !searchResults.tracks.items) return null;

    // Desordenar los resultados para dar variedad
    const shuffledTracks = searchResults.tracks.items.sort(() => 0.5 - Math.random());

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

      // Si buscamos por género, evitar devolver al MISMO artista para aumentar la variedad musical!
      if (usedGenre && normalizedTrack.artistIds.includes(artistId)) {
        // Con una probabilidad del 80%, evitamos al artista semilla para forzar que suenen OTROS artistas del mismo género
        if (Math.random() < 0.8) continue;
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
