import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ListMusic, Play, Loader2 } from 'lucide-react';
import { getUserPlaylists, getPlaylistTracks } from '../../lib/spotifyApi';
import { useSpotifySDK } from '../../hooks/useSpotifySDK';
import { usePlayerStore } from '../../store/usePlayerStore';

export function PlaylistsPanel() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const { controls } = useSpotifySDK();
  const sdkReady = usePlayerStore((s) => s.sdkReady);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const shiftQueue = usePlayerStore((s) => s.shiftQueue);

  useEffect(() => {
    async function fetchPlaylists() {
      try {
        const [res, user] = await Promise.all([
          getUserPlaylists(50),
          import('../../lib/spotifyApi').then(m => m.getCurrentUser())
        ]);
        
        if (res && res.items && user && user.id) {
          // Filtrar para mostrar SOLO las playlists creadas por el propio usuario logueado
          const myPlaylists = res.items.filter(pl => pl.owner.id === user.id);
          setPlaylists(myPlaylists);
        }
      } catch (err) {
        console.error('Error fetching playlists:', err);
        setError('No se pudieron cargar tus playlists.');
      } finally {
        setLoading(false);
      }
    }
    fetchPlaylists();
  }, []);

  const handleSelectPlaylist = async (playlist) => {
    if (!sdkReady) {
      toast.error('El reproductor aún no está conectado.');
      return;
    }
    if (importing) return;

    setImporting(true);
    const toastId = toast.loading(`Importando "${playlist.name}" a la cola...`);

    try {
      // 1. Obtener las canciones de la playlist (hasta 50 por ahora)
      const res = await getPlaylistTracks(playlist.id);
      
      // 2. Mapearlas al formato que usa nuestro store
      const normalizedTracks = (res.items || [])
        .map(wrapper => wrapper.item || wrapper.track || wrapper) // Spotify puede usar 'item' o 'track'
        .filter(t => t && t.uri && t.type !== 'episode') // Asegurar que sea una pista válida
        .map(t => {
          return {
            id: t.id,
            uri: t.uri,
            name: t.name,
            artists: t.artists ? t.artists.map((a) => a.name).join(', ') : 'Unknown Artist',
            artistIds: t.artists ? t.artists.map((a) => a.id).filter(Boolean) : [],
            album: t.album ? t.album.name : 'Unknown Album',
            image: t.album?.images?.[0]?.url,
            duration_ms: t.duration_ms,
            requestedBy: 'Playlist',
          };
        });

      if (normalizedTracks.length === 0) {
        toast.error('La playlist está vacía o sus canciones no se pueden reproducir.', { id: toastId });
        setImporting(false);
        return;
      }

      // 3. Reemplazar la cola activa con estas canciones
      setQueue(normalizedTracks);

      // 4. Iniciar la reproducción con la primera canción
      const firstTrack = shiftQueue();
      if (firstTrack) {
        await controls.play([firstTrack.uri]);
        toast.success(`¡"${playlist.name}" lista! Reproduciendo...`, { id: toastId });
      }

    } catch (err) {
      console.error(err);
      if (err.message === 'Forbidden' || err.message.includes('403')) {
        toast.error(`Modo de Desarrollo: Spotify bloquea el acceso a playlists de otros usuarios.`, { id: toastId });
      } else {
        toast.error(`Error al importar "${playlist.name}"`, { id: toastId });
      }
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-5 py-16 flex flex-col items-center justify-center">
        <Loader2 size={32} className="text-accent animate-spin mb-4" />
        <p className="text-text-muted">Cargando tus playlists...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-5 py-16 flex flex-col items-center justify-center">
        <ListMusic size={32} className="text-danger mb-4" />
        <p className="text-danger">{error}</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="font-bold text-text-primary flex items-center gap-2">
          <ListMusic size={16} className="text-accent" />
          Tus Playlists
          <span className="badge bg-bg-elevated text-text-muted">{playlists.length}</span>
        </h2>
      </div>

      <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar max-h-96">
        {playlists.length === 0 ? (
          <div className="text-center py-8">
            <ListMusic size={32} className="text-text-subtle mx-auto mb-3" />
            <p className="text-text-muted text-sm">No tienes playlists en tu cuenta</p>
          </div>
        ) : (
          playlists.map((pl) => (
            <div
              key={pl.id}
              className={`group p-3 rounded-xl bg-bg-elevated border border-white/5 hover:border-accent/30 transition-all flex items-center gap-3 cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={() => handleSelectPlaylist(pl)}
            >
              {pl.images && pl.images.length > 0 ? (
                <img
                  src={pl.images[0].url}
                  alt={pl.name}
                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0 shadow-md"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-bg-card flex items-center justify-center flex-shrink-0">
                  <ListMusic size={16} className="text-text-muted" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary truncate">{pl.name}</p>
              </div>

              <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:scale-110 shadow-glow-sm">
                <Play size={14} className="ml-0.5" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
