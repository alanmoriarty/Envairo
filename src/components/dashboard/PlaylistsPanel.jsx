import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ListMusic, Play, Loader2, Link as LinkIcon } from 'lucide-react';
import { getUserPlaylists, getPlaylistTracks, getPlaylist } from '../../lib/spotifyApi';
import { useSpotifySDK } from '../../hooks/useSpotifySDK';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useSettingsStore } from '../../store/useSettingsStore';

export function PlaylistsPanel() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [playlistLink, setPlaylistLink] = useState('');
  const { controls } = useSpotifySDK();
  const sdkReady = usePlayerStore((s) => s.sdkReady);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const shiftQueue = usePlayerStore((s) => s.shiftQueue);
  const sessionId = useSettingsStore(s => s.sessionId);

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
          const myPlaylists = res.items.filter(pl => pl.owner.id === user.id);
          
          setPlaylists(prev => {
            const prevSnaps = prev.map(p => p.snapshot_id).join(',');
            const newSnaps = myPlaylists.map(p => p.snapshot_id).join(',');
            return prevSnaps === newSnaps ? prev : myPlaylists;
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

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectPlaylist = async (playlist) => {
    const isAdminMode = useSettingsStore.getState().isAdminMode;
    if (!isAdminMode && !sdkReady) {
      toast.error('Reproductor no listo. Espera un momento.');
      return;
    }

    setImporting(true);
    const toastId = toast.loading(`Importando "${playlist.name}"...`);

    try {
      const res = await getPlaylistTracks(playlist.id, 100);
      const items = res?.items || [];
      
      const tracksToQueue = items
        .filter(item => item.track && !item.track.is_local)
        .map(item => ({
          id: item.track.id,
          uri: item.track.uri,
          name: item.track.name,
          artists: item.track.artists.map((a) => a.name).join(', '),
          image: item.track.album.images[0]?.url,
          duration_ms: item.track.duration_ms,
          requestedBy: 'Host (Playlist)',
          queueId: crypto.randomUUID()
        }));

      if (tracksToQueue.length === 0) {
        toast.error('La playlist está vacía o solo contiene archivos locales.', { id: toastId });
        setImporting(false);
        return;
      }

      const currentState = usePlayerStore.getState();
      const currentQueue = currentState.queue;
      const isQueueEmpty = currentQueue.length === 0;

      usePlayerStore.setState({ queue: [...currentQueue, ...tracksToQueue] });

      if (isAdminMode) {
        import('../../lib/supabase').then(m => m.supabase.rpc('update_session_state', { 
          p_session_id: sessionId, 
          p_secret: useSettingsStore.getState().hostSecret, 
          p_updates: { 
            queue: [...currentQueue, ...tracksToQueue],
            current_queue_index: currentState.currentQueueIndex
          } 
        }).then());
      }

      if (isQueueEmpty) {
        const firstTrack = shiftQueue();
        if (firstTrack) {
          if (isAdminMode) {
            import('../../lib/supabase').then(m => m.supabase.rpc('update_session_state', { 
              p_session_id: sessionId, 
              p_secret: useSettingsStore.getState().hostSecret, 
              p_updates: { playback_command: { action: 'play_specific', queueId: firstTrack.queueId, ts: Date.now() } } 
            }).then());
          } else {
            await controls.play([firstTrack.uri]);
          }
          toast.success(`¡"${playlist.name}" añadida! Reproduciendo...`, { id: toastId });
        }
      } else {
        toast.success(`¡Se añadieron ${tracksToQueue.length} canciones al final de la cola!`, { id: toastId });
      }

    } catch (err) {
      console.error('Error importando playlist:', err);
      if (err.message === 'Forbidden' || err.message.includes('403')) {
        toast.error('Modo Desarrollo: Spotify bloquea importar playlists de otros usuarios.', { id: toastId });
      } else {
        toast.error('Ocurrió un error al importar la playlist', { id: toastId });
      }
    } finally {
      setImporting(false);
    }
  };

  const handleLinkImport = async (e) => {
    e.preventDefault();
    if (!playlistLink) return;
    
    const match = playlistLink.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!match) {
      toast.error('Por favor, ingresa un link válido de playlist de Spotify.');
      return;
    }
    
    const playlistId = match[1];
    setImporting(true);
    const toastId = toast.loading('Obteniendo información de la playlist...');
    
    try {
      const playlistData = await getPlaylist(playlistId);
      if (!playlistData) throw new Error('No se encontró la playlist');
      
      toast.dismiss(toastId);
      await handleSelectPlaylist(playlistData);
      setPlaylistLink('');
    } catch (err) {
      console.error('Error al importar por link:', err);
      if (err.message === 'Forbidden' || err.message.includes('403')) {
        toast.error('Modo Desarrollo: Spotify bloquea acceder a playlists de otros usuarios.', { id: toastId });
      } else {
        toast.error('No se pudo encontrar la playlist. Asegúrate de que sea pública.', { id: toastId });
      }
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
      <div className="mb-6">
        <h2 className="font-bold text-text-primary flex items-center gap-2 mb-3">
          <ListMusic size={16} className="text-accent" />
          Importar Playlist por Link
        </h2>
        <form onSubmit={handleLinkImport} className="flex gap-2">
          <div className="relative flex-1">
            <LinkIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Pega un link de Spotify..."
              value={playlistLink}
              onChange={(e) => setPlaylistLink(e.target.value)}
              className="input-field w-full pl-9 py-2 text-sm"
            />
          </div>
          <button 
            type="submit" 
            disabled={!playlistLink || importing} 
            className="btn-primary px-4 py-2 text-sm"
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : 'Importar'}
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="font-bold text-text-primary flex items-center gap-2">
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
