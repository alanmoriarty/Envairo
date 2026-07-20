import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Moon, Clock, Send, Music2, User, Hash, Loader2, X } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { supabase } from '../lib/supabase';
import { AdSense } from '../components/ads/AdSense';
import { LanguageSelector } from '../components/ui/LanguageSelector';
import { useTranslation } from '../store/useLanguageStore';

const COOLDOWN_SECONDS = 10 * 60; // 10 minutes
const MAX_REQUESTS = 3;

export default function GuestPage() {
  const { sessionId } = useParams();
  
  // Real-time session config from Supabase
  const [sessionConfig, setSessionConfig] = useState(null);

  useEffect(() => {
    const fetchSession = async () => {
      const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
      if (data) setSessionConfig(data);
    };
    fetchSession();

    const channel = supabase.channel(`session-${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, (payload) => {
        setSessionConfig(payload.new);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests', filter: `session_id=eq.${sessionId}` }, (payload) => {
        if (payload.new.status === 'approved') {
          setMyPendingRequests(prev => {
            if (prev[payload.new.id]) {
              toast.success(`¡Tu petición "${prev[payload.new.id]}" fue aprobada y añadida a la cola!`);
              const newPending = { ...prev };
              delete newPending[payload.new.id];
              return newPending;
            }
            return prev;
          });
        }
      })
      .subscribe();
      
    return () => supabase.removeChannel(channel);
  }, [sessionId]);

  const { queue, currentQueueIndex, playHistory, pendingRequests } = usePlayerStore();
  const upcomingQueue = queue.slice(currentQueueIndex + 1);
  const { t, lang } = useTranslation();

  const isAvailable = sessionConfig?.active ?? true;
  const isCommercial = sessionConfig?.mode === 'commercial';
  const blacklistGenres = sessionConfig?.blacklist_genres || [];
  const blacklistSongs = sessionConfig?.blacklist_songs || [];
  const blacklistArtists = sessionConfig?.blacklist_artists || [];
  const allowRepeats = sessionConfig?.allow_repeats ?? true;

  const [identifier, setIdentifier] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [requestCount, setRequestCount] = useState({});
  const [userRequests, setUserRequests] = useState([]);
  const [myPendingRequests, setMyPendingRequests] = useState({});
  const debounceRef = useRef(null);
  const cooldownRef = useRef(null);

  const isInCooldown = cooldown > 0;

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
        try {
          if (sessionConfig?.playback_engine === 'youtube') {
            const { searchYouTubeVideos } = await import('../lib/youtubeApi');
            const results = await searchYouTubeVideos(query, 6);
            setResults(results.map(normalizeApiTrack));
          } else {
            const { data, error } = await supabase.functions.invoke('search-spotify', {
              body: { query, limit: 6 }
            });
            if (error) throw error;
            const items = data?.tracks?.items || [];
            setResults(items.map(normalizeApiTrack));
          }
        } catch (err) {
          setResults([]);
        } finally {
          setSearching(false);
        }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Restore cooldown from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`user_reqs_${sessionId}`);
      if (stored) {
        const reqs = JSON.parse(stored);
        setUserRequests(reqs);
        if (reqs.length > 0) {
          const lastReq = reqs[reqs.length - 1];
          const secondsSinceLast = Math.floor((Date.now() - lastReq) / 1000);
          
          const cooldownEnabled = sessionConfig?.cooldown_enabled ?? true;
          const cooldownMinutes = sessionConfig?.cooldown_minutes ?? 10;
          const cooldownSeconds = cooldownMinutes * 60;
          
          if (cooldownEnabled && secondsSinceLast < cooldownSeconds) {
            setCooldown(cooldownSeconds - secondsSinceLast);
          } else if (!cooldownEnabled) {
            setCooldown(0);
          }
        }
      }
    } catch (e) {}
  }, [sessionId, sessionConfig?.cooldown_enabled, sessionConfig?.cooldown_minutes]);

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(cooldownRef.current);
  }, [cooldown > 0]);

  const handleSubmit = async () => {
    if (!selected) { toast.error('Selecciona una canción primero'); return; }
    if (isCommercial && !identifier.trim()) {
      toast.error('El número de mesa es obligatorio');
      return;
    }

    // Check individual user max requests limit
    const maxUserRequests = sessionConfig?.requests_per_guest || 0;
    if (maxUserRequests > 0 && userRequests.length >= maxUserRequests) {
      toast.error(`Has alcanzado el límite de ${maxUserRequests} peticiones por sesión`);
      return;
    }

    // Check song request count (same song)
    const count = requestCount[selected.id] || 0;
    if (count >= MAX_REQUESTS) {
      toast.error(t('guest.error_max', { max: MAX_REQUESTS }));
      return;
    }



    const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';

    // Blacklist genre check
    if (blacklistGenres.length > 0 && selected.genre) {
      const normalizedTrackGenre = normalize(selected.genre);
      const blocked = blacklistGenres.some((g) =>
        normalizedTrackGenre.includes(normalize(g)) || normalize(g).includes(normalizedTrackGenre)
      );
      if (blocked) {
        toast.error(t('guest.error_genre'));
        return;
      }
    }

    // Song Blacklist check
    if (blacklistSongs?.length > 0) {
      const normalizedTrackName = normalize(selected.name);
      const blocked = blacklistSongs.some((s) =>
        normalizedTrackName.includes(normalize(s)) || normalize(s).includes(normalizedTrackName)
      );
      if (blocked) {
        toast.error(t('guest.error_song'));
        return;
      }
    }

    // Artist Blacklist check
    if (blacklistArtists?.length > 0) {
      const normalizedTrackArtist = normalize(selected.artists);
      const blocked = blacklistArtists.some((a) =>
        normalizedTrackArtist.includes(normalize(a)) || normalize(a).includes(normalizedTrackArtist)
      );
      if (blocked) {
        toast.error(t('guest.error_artist'));
        return;
      }
    }

    // Check if recently played (repeat cooldown logic)
    const repeatCooldown = sessionConfig?.repeat_cooldown ?? -1;
    if (repeatCooldown !== -1) {
      const alreadyInQueue = queue.some(t => t.id === selected.id);
      const alreadyPending = pendingRequests.some(r => r.track.id === selected.id);
      if (alreadyInQueue || alreadyPending) {
        toast.error(t('guest.error_queue'));
        return;
      }

      const historyTrack = playHistory.find(h => h.id === selected.id);
      if (historyTrack && historyTrack.playedAt) {
        const playedTime = new Date(historyTrack.playedAt).getTime();
        const now = Date.now();
        const diffMinutes = (now - playedTime) / (1000 * 60);

        if (repeatCooldown === 0 || diffMinutes < repeatCooldown) {
          if (repeatCooldown === 0) {
            toast.error(t('guest.error_repeated'));
          } else {
            const remaining = Math.ceil(repeatCooldown - diffMinutes);
            toast.error(t('guest.error_cooldown', { min: remaining }));
          }
          return;
        }
      }
    }

    const sendRequest = async () => {
      // Check global requests per hour limit against Supabase
      const limit = sessionConfig?.requests_per_hour ?? 15;
      const oneHourAgoTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const { count: globalCount, error: countError } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .gte('created_at', oneHourAgoTime);

      if (!countError && globalCount >= limit) {
        toast.error(t('guest.error_limit', { limit }));
        return;
      }

      let finalTrack = selected;
      if (selected.source === 'youtube' && selected.duration_ms === 0) {
        try {
          const { getYouTubeVideoDetails } = await import('../lib/youtubeApi');
          const details = await getYouTubeVideoDetails(selected.id);
          if (details) finalTrack = details;
        } catch (e) { console.error('Failed to get youtube details', e); }
      }

      const { data, error } = await supabase.from('requests').insert({
        session_id: sessionId,
        track: finalTrack,
        requester: identifier.trim() || 'Anónimo',
        status: 'pending'
      }).select().single();

      if (error) {
        toast.error(t('guest.error_send'));
        return;
      }

      setRequestCount((prev) => ({
        ...prev,
        [selected.id]: (prev[selected.id] || 0) + 1,
      }));

      setMyPendingRequests((prev) => ({
        ...prev,
        [data.id]: selected.name
      }));

      const newReqs = [...userRequests, Date.now()];
      setUserRequests(newReqs);
      localStorage.setItem(`user_reqs_${sessionId}`, JSON.stringify(newReqs));

      toast.success(t('guest.sent_success', { name: selected.name }));
      setSelected(null);
      setQuery('');
      setResults([]);
      
      const cooldownEnabled = sessionConfig?.cooldown_enabled ?? true;
      const cooldownMinutes = sessionConfig?.cooldown_minutes ?? 10;
      if (cooldownEnabled) {
        setCooldown(cooldownMinutes * 60);
      }
    };

    await sendRequest();
  };


  const formatCooldown = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (!isAvailable) {
    return <ClosedScreen />;
  }

  return (
    <div className="min-h-screen bg-bg-root p-4 max-w-lg mx-auto pt-8">
      {/* Header */}
      <div className="text-center mb-8 relative">
        {/* Language toggle top-right */}
        <div className="absolute right-0 top-0">
          <LanguageSelector />
        </div>
        <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center mx-auto mb-4 shadow-glow">
          <Music2 size={28} className="text-accent" />
        </div>
        <h1 className="text-2xl font-bold text-gradient">{t('guest.title')}</h1>
        <p className="text-text-muted mt-1 text-sm">
          {isCommercial ? t('guest.subtitle_commercial') : t('guest.subtitle_party')}
        </p>
      </div>

      {/* Top Banner Ad */}
      <AdSense slot={import.meta.env.VITE_ADSENSE_SLOT_TOP} />

      {/* Identifier input */}
      <div className="card p-4 mb-4">
        <label className="block text-sm text-text-muted mb-2">
          {isCommercial ? (
            <span className="flex items-center gap-1.5">
              <Hash size={14} />{t('guest.label_table')}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <User size={14} />{t('guest.label_nickname')}
            </span>
          )}
        </label>
        
        {isCommercial && (sessionConfig?.table_count || 0) > 0 ? (
          <select
            className="input-field appearance-none bg-bg-elevated"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={isInCooldown}
          >
            <option value="">{t('guest.select_table')}</option>
            <option value="Sin especificar">{t('guest.no_table')}</option>
            {Array.from({ length: sessionConfig?.table_count || 0 }, (_, i) => (
              <option key={i} value={`Mesa ${i + 1}`}>Mesa {i + 1}</option>
            ))}
          </select>
        ) : (
          <input
            className="input-field"
            placeholder={isCommercial ? t('guest.placeholder_table') : t('guest.placeholder_nickname')}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={isInCooldown}
          />
        )}
      </div>

      {/* Search */}
      <div className="card p-4 mb-4">
        <label className="block text-sm text-text-muted mb-2 flex items-center gap-1.5">
          <Search size={14} />{t('guest.search_label', { engine: sessionConfig?.playback_engine === 'youtube' ? 'YouTube' : 'Spotify' })}
        </label>
        <div className="relative">
          <input
            className="input-field pr-10"
            placeholder={t('guest.search_placeholder')}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            disabled={isInCooldown}
          />
          {searching && (
            <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted animate-spin" />
          )}
          {query && !searching && (
            <button
              onClick={() => { setQuery(''); setResults([]); setSelected(null); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && !selected && (
          <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
            {results.map((track) => (
              <button
                key={track.id}
                onClick={() => { setSelected(track); setResults([]); setQuery(track.name); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-bg-elevated transition-all text-left group"
              >
                {track.image ? (
                  <img src={track.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-bg-elevated flex items-center justify-center flex-shrink-0">
                    <Music2 size={16} className="text-text-muted" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate group-hover:text-accent transition-colors">
                    {track.name}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {track.artists} · {track.album}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Selected track */}
        {selected && (
          <div className="mt-3 flex items-center gap-3 p-3 bg-accent/10 border border-accent/30 rounded-xl">
            {selected.image && (
              <img src={selected.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-accent truncate">{selected.name}</p>
              <p className="text-xs text-text-muted truncate">{selected.artists}</p>
            </div>
            <button onClick={() => { setSelected(null); setQuery(''); }} className="text-text-muted hover:text-white">
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Submit / Cooldown */}
      {sessionConfig?.requests_per_guest > 0 && userRequests.length >= sessionConfig.requests_per_guest ? (
        <div className="card p-5 text-center bg-danger/10 border border-danger/30">
          <div className="w-12 h-12 rounded-full bg-danger/20 flex items-center justify-center mx-auto mb-3">
            <X size={24} className="text-danger" />
          </div>
          <p className="font-semibold text-danger">Límite alcanzado</p>
          <p className="text-text-muted text-sm mt-1">Ya has pedido el máximo de {sessionConfig.requests_per_guest} canciones permitidas para esta sesión.</p>
        </div>
      ) : isInCooldown ? (
        <div className="card p-5 text-center">
          <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-3">
            <Clock size={24} className="text-accent" />
          </div>
          <p className="font-semibold text-text-primary">{lang === 'es' ? '¡Canción enviada!' : 'Song sent!'}</p>
          <p className="text-text-muted text-sm mt-1">{t('guest.cooldown_label')}</p>
          <p className="text-3xl font-bold text-accent mt-2">{formatCooldown(cooldown)}</p>
        </div>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!selected || (isCommercial && !identifier.trim())}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={16} />
          {t('guest.submit')}
        </button>
      )}

      {/* Mini queue */}
      {upcomingQueue.length > 0 && (
        <div className="card p-4 mt-6">
          <h3 className="text-sm font-semibold text-text-muted mb-3 flex items-center gap-2">
            <Music2 size={14} />{t('guest.queue_title')}
          </h3>
          <div className="space-y-2">
            {upcomingQueue.slice(0, 3).map((track, i) => (
              <div key={track.queueId} className="flex items-center gap-3">
                <span className="text-xs text-text-subtle w-4 text-center">{i + 1}</span>
                {track.image && (
                  <img src={track.image} alt="" className="w-8 h-8 rounded-lg object-cover" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">{track.name}</p>
                  <p className="text-xs text-text-muted truncate">{track.artists}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Banner Ad */}
      <div className="mt-8">
        <AdSense slot={import.meta.env.VITE_ADSENSE_SLOT_BOTTOM} />
      </div>
    </div>
  );
}

function ClosedScreen() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-bg-root flex flex-col items-center justify-center p-8 text-center">
      <div className="text-8xl mb-6">🌙</div>
      <h1 className="text-3xl font-bold text-text-primary mb-3">{t('guest.closed_title')}</h1>
      <p className="text-text-muted max-w-xs">
        {t('guest.closed_sub')}
      </p>
      <div className="mt-8 w-20 h-1 rounded-full bg-accent/30 mx-auto" />
      <div className="mt-6">
        <LanguageSelector />
      </div>
    </div>
  );
}

function normalizeApiTrack(t) {
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => a.name).join(', '),
    artistIds: t.artists.map((a) => a.id),
    album: t.album.name,
    image: t.album.images?.[0]?.url,
    duration_ms: t.duration_ms,
    explicit: t.explicit,
    genre: t.album.genres?.[0] || '',
  };
}

function getMockResults(query) {
  return [
    { id: 'm1', uri: 'spotify:track:m1', name: `${query} (resultado simulado)`, artists: 'Artista Demo', album: 'Álbum Demo', image: null, duration_ms: 180000 },
  ];
}
