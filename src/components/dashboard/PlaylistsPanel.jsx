import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ListMusic, Play, Loader2, Link as LinkIcon } from 'lucide-react';
import { getUserPlaylists, getPlaylistTracks, getPlaylist } from '../../lib/spotifyApi';
import { getUserYouTubePlaylists, getYouTubePlaylistItems } from '../../lib/youtubeApi';
import { useSpotifySDK } from '../../hooks/useSpotifySDK';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from '../../store/useLanguageStore';

// Función auxiliar para formatear la fecha como "Hoy", "Ayer", o "DD/MM/YYYY"
function formatDateLabel(dateString) {
  if (!dateString) return 'Desconocido';
  
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function PlaylistsPanel() {
  const { t } = useTranslation();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [playlistLink, setPlaylistLink] = useState('');
  
  const { controls } = useSpotifySDK();
  const sdkReady = usePlayerStore((s) => s.sdkReady);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const shiftQueue = usePlayerStore((s) => s.shiftQueue);
  const playHistory = usePlayerStore((s) => s.playHistory || []);
  const sessionId = useSettingsStore(s => s.sessionId);

  // Agrupar historial por días
  const historyByDay = React.useMemo(() => {
    const groups = {};
    playHistory.forEach(track => {
      const label = formatDateLabel(track.playedAt);
      if (!groups[label]) groups[label] = [];
      // Evitar duplicados exactos en el mismo día
      if (!groups[label].some(t => t.id === track.id)) {
        groups[label].push(track);
      }
    });
    return Object.entries(groups).map(([label, tracks]) => ({
      id: `history-${label}`,
      name: `Historial: ${label}`,
      isHistory: true,
      tracks,
      images: tracks.length > 0 && tracks[0].image ? [{ url: tracks[0].image }] : []
    }));
  }, [playHistory]);

  useEffect(() => {
    let isMounted = true;

    async function fetchPlaylists(showLoading = true) {
      if (showLoading) setLoading(true);
      try {
        const engine = usePlayerStore.getState().playbackEngine;
        if (engine === 'youtube') {
          const res = await getUserYouTubePlaylists(50);
          if (!isMounted) return;
          if (res && res.items) {
             const myPlaylists = res.items.map(pl => ({
               id: pl.id,
               name: pl.snippet.title,
               snapshot_id: pl.etag,
               owner: { id: 'youtube' },
               images: [{ url: pl.snippet.thumbnails?.medium?.url || pl.snippet.thumbnails?.default?.url }]
             }));
             setPlaylists(prev => {
                const prevSnaps = prev.map(p => p.snapshot_id).join(',');
                const newSnaps = myPlaylists.map(p => p.snapshot_id).join(',');
                return prevSnaps === newSnaps ? prev : myPlaylists;
             });
          }
        } else {
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
      toast.error(t('dashboard.toast_player_not_ready'));
      return;
    }

    setImporting(true);
    const toastId = toast.loading(t('dashboard.toast_pl_importing', { name: playlist.name }));

    try {
      let items = [];
      const engine = usePlayerStore.getState().playbackEngine;
      if (playlist.isHistory) {
        // La playlist del historial ya tiene las pistas cargadas
        items = playlist.tracks.map(t => ({ track: { ...t, is_local: false, album: { images: [{ url: t.image }] }, artists: [{ name: t.artists }] } }));
      } else if (engine === 'youtube') {
        const res = await getYouTubePlaylistItems(playlist.id, 100);
        items = res?.items || [];
      } else {
        const res = await getPlaylistTracks(playlist.id, 100);
        items = res?.items || [];
      }
      
      const tracksToQueue = items
        .filter(item => item.track && !item.track.is_local)
        .map(item => ({
          id: item.track.id,
          uri: item.track.uri,
          name: item.track.name,
          artists: item.track.artists.map((a) => a.name).join(', '),
          image: item.track.album.images[0]?.url,
          duration_ms: item.track.duration_ms,
          requestedBy: playlist.isHistory ? 'Host (Historial)' : 'Host (Playlist)',
          queueId: crypto.randomUUID()
        }));

      if (tracksToQueue.length === 0) {
        toast.error(t('dashboard.toast_pl_empty'), { id: toastId });
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
          toast.success(t('dashboard.toast_pl_added', { name: playlist.name }), { id: toastId });
        }
      } else {
        toast.success(t('dashboard.toast_pl_added_multiple', { count: tracksToQueue.length }), { id: toastId });
      }

    } catch (err) {
      console.error('Error importando playlist:', err);
      if (err.message === 'Forbidden' || err.message.includes('403')) {
        toast.error(t('dashboard.toast_pl_dev_error'), { id: toastId });
      } else {
        toast.error(t('dashboard.toast_pl_error'), { id: toastId });
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
      toast.error(t('dashboard.toast_pl_link_error'));
      return;
    }
    
    const playlistId = match[1];
    setImporting(true);
    const toastId = toast.loading(t('dashboard.toast_pl_fetching'));
    
    try {
      const playlistData = await getPlaylist(playlistId);
      if (!playlistData) throw new Error('No se encontró la playlist');
      
      toast.dismiss(toastId);
      await handleSelectPlaylist(playlistData);
      setPlaylistLink('');
    } catch (err) {
      console.error('Error al importar por link:', err);
      if (err.message === 'Forbidden' || err.message.includes('403')) {
        toast.error(t('dashboard.toast_pl_dev_error'), { id: toastId });
      } else {
        toast.error(t('dashboard.toast_pl_error'), { id: toastId });
      }
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-5 py-16 flex flex-col items-center justify-center">
        <Loader2 size={32} className="text-accent animate-spin mb-4" />
        <p className="text-text-muted">{t('dashboard.playlists_loading')}</p>
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
          {t('dashboard.playlists_import')}
        </h2>
        <form onSubmit={handleLinkImport} className="flex gap-2">
          <div className="relative flex-1">
            <LinkIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="https://open.spotify.com/playlist/..."
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
            {importing ? <Loader2 size={16} className="animate-spin" /> : t('dashboard.playlists_import_btn')}
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="font-bold text-text-primary flex items-center gap-2">
          {t('dashboard.playlists_history')}
          <span className="badge bg-bg-elevated text-text-muted">{historyByDay.length}</span>
        </h2>
      </div>

      <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar max-h-48 mb-6">
        {historyByDay.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-text-muted text-sm">{t('dashboard.playlists_history_empty')}</p>
          </div>
        ) : (
          historyByDay.map((pl) => (
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
                <p className="text-xs text-text-muted truncate mt-0.5">
                  {pl.tracks.length} {t('dashboard.playlists_songs')}
                </p>
              </div>

              <button 
                className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent opacity-0 group-hover:opacity-100 transition-all hover:bg-accent hover:text-white shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectPlaylist(pl);
                }}
              >
                <Play size={14} fill="currentColor" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="font-bold text-text-primary flex items-center gap-2">
          {t('dashboard.playlists_title')}
          <span className="badge bg-bg-elevated text-text-muted">{playlists.length}</span>
        </h2>
      </div>

      <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar max-h-96">
        {playlists.length === 0 ? (
          <div className="text-center py-8">
            <ListMusic size={32} className="text-text-subtle mx-auto mb-3" />
            <p className="text-text-muted text-sm">{t('dashboard.playlists_empty')}</p>
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
                <p className="text-xs text-text-muted truncate mt-0.5">
                  {pl.tracks?.total || 0} {t('dashboard.playlists_songs')}
                </p>
              </div>

              <button 
                className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent opacity-0 group-hover:opacity-100 transition-all hover:bg-accent hover:text-white shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectPlaylist(pl);
                }}
              >
                <Play size={14} fill="currentColor" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
