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
    let isMounted = true;

    async function fetchPlaylists(showLoading = true) {
      if (showLoading) setLoading(true);
      try {
        const [res, user] = await Promise.all([
          getUserPlaylists(50),
          import('../../lib/spotifyApi').then(m => m.getCurrentUser())
        ]);
        
        if (!isMounted) return;

        if (res && res.items && user && user.id) {
          // Filtrar para mostrar SOLO las playlists creadas por el propio usuario logueado
          const myPlaylists = res.items.filter(pl => pl.owner.id === user.id);
          
          setPlaylists(prev => {
            // Comparar de forma simple para evitar re-renders innecesarios
            const prevIds = prev.map(p => p.id).join(',');
            const newIds = myPlaylists.map(p => p.id).join(',');
            return prevIds === newIds ? prev : myPlaylists;
          });
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Error fetching playlists:', err);
        if (showLoading) setError('No se pudieron cargar tus playlists.');
      } finally {
        if (isMounted && showLoading) setLoading(false);
      }
    }

    fetchPlaylists(true);

    const intervalId = setInterval(() => {
      fetchPlaylists(false);
    }, 10000); // Consultar cada 10 segundos para "tiempo real"

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
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
      // 1. Obtener las canciones de la playlist (hasta 150 por ahora)
      let allItems = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore && allItems.length < 150) {
        const res = await getPlaylistTracks(playlist.id, 100, offset);
        if (res && res.items && res.items.length > 0) {
          allItems = [...allItems, ...res.items];
          offset += 100;
          if (res.items.length < 100) {
            hasMore = false; // No hay más páginas
          }
        } else {
          hasMore = false;
        }
      }

      // Limitar exactamente a 150
      allItems = allItems.slice(0, 150);

      // 2. Mapearlas al formato que usa nuestro store
      const normalizedTracks = allItems
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

      // 3. Añadir a la cola activa en lugar de reemplazar
      const currentQueue = usePlayerStore.getState().queue;
      const isQueueEmpty = currentQueue.length === 0;
      
      const newTracksWithIds = normalizedTracks.map((t, i) => ({ 
        ...t, 
        queueId: `${t.id}-${Date.now()}-${i}` 
      }));
      
      usePlayerStore.setState({ queue: [...currentQueue, ...newTracksWithIds] });

      // 4. Iniciar la reproducción solo si la cola estaba vacía
      if (isQueueEmpty) {
        const firstTrack = shiftQueue();
        if (firstTrack) {
          await controls.play([firstTrack.uri]);
          toast.success(`¡"${playlist.name}" añadida! Reproduciendo...`, { id: toastId });
        }
      } else {
        toast.success(`¡"${playlist.name}" añadida al final de la cola!`, { id: toastId });
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
