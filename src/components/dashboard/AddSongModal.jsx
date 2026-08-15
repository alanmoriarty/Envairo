import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, X, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from '../../store/useLanguageStore';

function normalizeApiTrack(t) {
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: t.artists?.map((a) => a.name).join(', ') || 'Artista Desconocido',
    image: t.album?.images?.[0]?.url || t.image || '',
    duration_ms: t.duration_ms,
  };
}

export function AddSongModal({ onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);
  const { t } = useTranslation();

  const { queue, currentQueueIndex, setQueue, shiftQueue } = usePlayerStore();
  const isAdminMode = useSettingsStore(s => s.isAdminMode);
  const sessionId = useSettingsStore(s => s.sessionId);
  const hostSecret = useSettingsStore(s => s.hostSecret);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const engine = usePlayerStore.getState().playbackEngine;
        if (engine === 'youtube') {
          const { searchYouTubeVideos } = await import('../../lib/youtubeApi');
          const ytResults = await searchYouTubeVideos(query, 12);
          if (ytResults && ytResults.length > 0) {
            setResults(ytResults.map(r => ({
              id: r.id,
              uri: r.uri,
              name: r.name,
              artists: r.artists,
              image: r.album?.images?.[0]?.url || r.image || '',
              duration_ms: r.duration_ms || 0,
              source: 'youtube'
            })));
            return;
          }
        }

        // Spotify Engine o fallback
        const { data, error } = await supabase.functions.invoke('search-spotify', {
          body: { query, limit: 12, filterExplicit: useSettingsStore.getState().explicitFilter }
        });
        if (error) throw error;
        const items = data?.tracks?.items || [];
        setResults(items.map(normalizeApiTrack));
      } catch (err) {
        console.error('Error buscando:', err);
        // Fallback a YouTube si la función de Spotify falla
        try {
          const { searchYouTubeVideos } = await import('../../lib/youtubeApi');
          const ytResults = await searchYouTubeVideos(query, 12);
          if (ytResults && ytResults.length > 0) {
            setResults(ytResults.map(r => ({
              id: r.id,
              uri: r.uri,
              name: r.name,
              artists: r.artists,
              image: r.album?.images?.[0]?.url || r.image || '',
              duration_ms: r.duration_ms || 0,
              source: 'youtube'
            })));
          }
        } catch (e) {}
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleAddTrack = async (track) => {
    let finalTrack = track;
    if (track.source === 'youtube' && track.duration_ms === 0) {
      const { getYouTubeVideoDetails } = await import('../../lib/youtubeApi');
      const details = await getYouTubeVideoDetails(track.id);
      if (details) finalTrack = details;
    }

    const isQueueEmpty = queue.length === 0;
    const newTrack = {
      ...finalTrack,
      queueId: crypto.randomUUID(),
      requestedBy: 'Host'
    };

    // (El filtro explícito con DeepSeek ahora se evalúa en el Auto DJ, no en el cliente local)

    // Use the built-in addToQueue function which handles auto-play, queue index, and preloading automatically
    usePlayerStore.getState().addToQueue(newTrack);

    if (isAdminMode) {
      import('../../lib/supabase').then(m => m.supabase.rpc('sync_host_config', { 
        p_session_id: sessionId, 
        p_secret: hostSecret, 
        p_updates: { 
          queue: usePlayerStore.getState().queue,
          current_queue_index: usePlayerStore.getState().currentQueueIndex
        } 
      }).then());
    }

    toast.success(t('dashboard.toast_added', { name: track.name }));
    
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-bg-base/95 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-slide-up">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <h3 className="font-bold text-lg text-text-primary">{t('dashboard.add_song_title')}</h3>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-text-muted hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Buscador */}
        <div className="p-4 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('dashboard.add_song_search')}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              autoFocus
            />
          </div>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {searching ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-accent animate-spin mb-4" />
              <p className="text-text-muted text-sm">{t('dashboard.add_song_searching')}</p>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-2">
              {results.map((track) => (
                <div 
                  key={track.id}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 group transition-colors cursor-pointer"
                  onClick={() => handleAddTrack(track)}
                >
                  <img src={track.image} alt={track.name} className="w-12 h-12 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-text-primary truncate">{track.name}</p>
                    <p className="text-sm text-text-muted truncate">{track.artists}</p>
                  </div>
                  <button className="p-2 rounded-full bg-accent/10 text-accent opacity-0 group-hover:opacity-100 transition-all hover:bg-accent hover:text-white">
                    <Plus size={18} />
                  </button>
                </div>
              ))}
            </div>
          ) : query.length >= 2 ? (
            <div className="text-center py-8">
              <p className="text-text-muted">{t('common.no_results')}</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <Search className="w-12 h-12 text-white/10 mx-auto mb-3" />
              <p className="text-text-muted text-sm">{t('dashboard.add_song_empty')}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
