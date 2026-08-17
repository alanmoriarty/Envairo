import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Moon, Clock, Send, Music2, User, Hash, Loader2, X, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sanitizePrompt } from '../utils/security';
import { AdSense } from '../components/ads/AdSense';
import { LanguageSelector } from '../components/ui/LanguageSelector';
import { useTranslation } from '../store/useLanguageStore';
import { InstallAppButton } from '../components/shared/InstallAppButton';

const COOLDOWN_SECONDS = 10 * 60; // 10 minutes
const MAX_REQUESTS = 3;

const filterMusicEmojis = (text) => {
  if (!window.Intl || !Intl.Segmenter) return text;
  const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });
  const allowedEmojis = ['🎸', '🎵', '🎶', '🎤', '🎧', '🎷', '🎺', '🎹', '🎻', '🥁', '📻', '🎙️', '🎚️', '🎛️', '🎼', '💿', '🪩', '🕺', '💃', '👨‍🎤', '👩‍🎤', '🧑‍🎤', '✨', '🔥', '🎉'];

  let result = '';
  for (const { segment } of segmenter.segment(text)) {
    if (/\p{Emoji_Presentation}/u.test(segment)) {
      if (allowedEmojis.some(e => segment.includes(e.replace(/\uFE0F/g, '')))) {
        result += segment;
      }
    } else {
      result += segment;
    }
  }
  return result;
};

const formatArtists = (artists) => {
  if (typeof artists === 'string') return artists;
  if (Array.isArray(artists)) return artists.map(a => a.name || a).join(', ');
  if (typeof artists === 'object' && artists !== null && artists.name) return artists.name;
  return 'Artista Desconocido';
};

export default function GuestPage() {
  const { sessionId } = useParams();
  const location = useLocation();

  // ── Sistema de acceso por token de invitado (6 horas desde el escaneo) ────────
  //
  // Flujo:
  //  1. El QR del anfitrión contiene ?t={qr_token} (permanente, no expira solo).
  //  2. El primer escaneo canjea el qr_token por un guest_access_token personal (6h).
  //  3. El guest_access_token se guarda en localStorage del dispositivo.
  //  4. Cada petición usa el guest_access_token (el servidor valida las 6h).
  //  5. Si el host regenera el QR, el qr_token cambia y no se pueden obtener
  //     nuevos guest_access_tokens con el QR anterior.
  const [guestToken, setGuestToken] = useState(
    () => localStorage.getItem(`gat_${sessionId}`) || null
  );
  const [qrAccessDenied, setQrAccessDenied] = useState(false);
  const [isExchangingToken, setIsExchangingToken] = useState(false);

  useEffect(() => {
    const urlQrToken = new URLSearchParams(location.search).get('t');
    if (!urlQrToken) return; // Sin token en la URL, nada que canjear

    // Al escanear un QR con ?t= siempre canjeamos un nuevo token de acceso de 6 horas
    // para refrescar la sesión del invitado y no quedar bloqueado por tokens viejos expirados en localStorage
    setIsExchangingToken(true);
    supabase
      .rpc('create_guest_access', {
        p_session_id: sessionId,
        p_qr_token: urlQrToken
      })
      .then(({ data, error }) => {
        if (error || !data) {
          console.warn('QR token no válido:', error?.message);
        } else {
          // Guardar el nuevo token personal en localStorage
          localStorage.setItem(`gat_${sessionId}`, data);
          setGuestToken(data);
          setQrAccessDenied(false); // Desbloquear pantalla si estaba en expirado
        }
      })
      .finally(() => setIsExchangingToken(false));
  }, [sessionId, location.search]);

  // Real-time session config from Supabase
  const [sessionConfig, setSessionConfig] = useState(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
      if (data) {
        setSessionConfig(data);
      } else {
        setSessionConfig({ _notFound: true });
      }
      setIsLoadingConfig(false);
    };
    fetchSession();

    let channel = null;
    let isMounted = true;
    let initTimeout;

    initTimeout = setTimeout(() => {
      if (!isMounted) return;

      channel = supabase.channel(`session-${sessionId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, (payload) => {
          setSessionConfig(prev => ({ ...prev, ...payload.new }));
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
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(initTimeout);
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const queue = Array.isArray(sessionConfig?.queue) ? sessionConfig.queue : [];
  const currentQueueIndex = typeof sessionConfig?.current_queue_index === 'number' ? sessionConfig.current_queue_index : -1;
  const playHistory = Array.isArray(sessionConfig?.play_history) ? sessionConfig.play_history : [];
  const upcomingQueue = queue.slice(currentQueueIndex + 1);
  const { t, lang } = useTranslation();

  const stateData = sessionConfig?.session_state || {};

  const isAvailable = sessionConfig?._notFound ? false : (stateData.active ?? sessionConfig?.active ?? true);
  const isCommercial = (stateData.mode || sessionConfig?.mode) === 'commercial';
  const blacklistGenres = stateData.blacklist_genres || sessionConfig?.blacklist_genres || [];
  const blacklistSongs = stateData.blacklist_songs || sessionConfig?.blacklist_songs || [];
  const blacklistArtists = stateData.blacklist_artists || sessionConfig?.blacklist_artists || [];
  const allowRepeats = stateData.allow_repeats ?? sessionConfig?.allow_repeats ?? true;
  const eventName = stateData.event_name || sessionConfig?.event_name || '';
  const cooldownEnabled = stateData.cooldown_enabled ?? sessionConfig?.cooldown_enabled ?? false;
  const cooldownMinutes = stateData.cooldown_minutes ?? sessionConfig?.cooldown_minutes ?? 10;
  const requestsPerHour = stateData.requests_per_hour ?? sessionConfig?.requests_per_hour ?? 15;
  // Guest version request feature (controlled by host in Settings)
  const guestVersionRequestEnabled = stateData.guest_version_request ?? sessionConfig?.guest_version_request ?? false;

  useEffect(() => {
    if (eventName) {
      document.title = `${eventName} | envAIro`;
    } else {
      document.title = 'envAIro | Pide tu Canción';
    }
  }, [eventName]);

  const [identifier, setIdentifier] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // Prevent double-submit
  const [selected, setSelected] = useState(null);
  const [versionPreference, setVersionPreference] = useState('normal'); // 'normal' | 'lyrics' | 'karaoke'
  const [lastSubmittedTrack, setLastSubmittedTrack] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);              // No-cooldown success
  const [cooldown, setCooldown] = useState(0);
  const [requestCount, setRequestCount] = useState({});
  const [userRequests, setUserRequests] = useState([]);
  const [myPendingRequests, setMyPendingRequests] = useState({});
  const debounceRef = useRef(null);
  const cooldownRef = useRef(null);
  const successTimeoutRef = useRef(null);

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
        const { searchMusicCatalog } = await import('../lib/musicApi');
        const items = await searchMusicCatalog(query, 8, stateData?.explicit_filter || false);
        setResults(items);
      } catch (err) {
        console.error('Error buscando invitado:', err);
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

          const cooldownSeconds = cooldownMinutes * 60;

          if (cooldownEnabled && secondsSinceLast < cooldownSeconds) {
            setCooldown(cooldownSeconds - secondsSinceLast);
          } else if (!cooldownEnabled) {
            setCooldown(0);
          }
        }
      }
    } catch (e) { }
  }, [sessionId, cooldownEnabled, cooldownMinutes]);

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

    // Check individual user max CONCURRENT requests limit (Anti-Spam)
    const maxUserRequests = sessionConfig?.requests_per_guest || 0;
    if (maxUserRequests > 0) {
      // Calculate how many of the user's requested tracks are currently pending or in the upcoming queue
      const myActiveIds = JSON.parse(localStorage.getItem(`my_tracks_${sessionId}`) || '[]');
      const pendingCount = Object.keys(myPendingRequests).length;
      const queueCount = upcomingQueue.filter(track => myActiveIds.includes(track.id)).length;

      if (pendingCount + queueCount >= maxUserRequests) {
        toast.error(`Límite Anti-Spam: Solo puedes tener ${maxUserRequests} canciones en cola al mismo tiempo. Espera a que suene una de tus canciones para pedir otra.`);
        return;
      }
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
        normalizedTrackGenre.includes(normalize(g))
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
        normalizedTrackName.includes(normalize(s))
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
        normalizedTrackArtist.includes(normalize(a.name || a))
      );
      if (blocked) {
        toast.error(t('guest.error_artist'));
        return;
      }
    }

    // (El filtro explícito con DeepSeek ahora se evalúa en el Auto DJ, no en el cliente del invitado)

    // Check if recently played (repeat cooldown logic)
    const repeatCooldown = sessionConfig?.repeat_cooldown ?? -1;
    if (repeatCooldown !== -1) {
      const alreadyInQueue = queue.some(t => t.id === selected.id);
      const alreadyPending = Object.values(myPendingRequests).some(name => name.toLowerCase() === selected.name.toLowerCase());
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
      let finalTrack = selected;
      if (selected.source === 'youtube' && selected.duration_ms === 0) {
        try {
          const { getYouTubeVideoDetails } = await import('../lib/youtubeApi');
          const details = await getYouTubeVideoDetails(selected.id);
          if (details) finalTrack = details;
        } catch (e) { console.error('Failed to get youtube details', e); }
      }

      // Attach guest version preference so the player can use it as forceMode
      if (guestVersionRequestEnabled && versionPreference !== 'normal') {
        finalTrack = { ...finalTrack, version_preference: versionPreference };
      }

      // SECURITY: Use server-side RPC instead of direct insert.
      // The RPC (submit_guest_request) runs with SECURITY DEFINER and validates:
      //   - Session is active
      //   - Global hourly request limit has not been exceeded
      //   - QR token is valid and not older than 6 hours
      // Direct INSERT on the requests table is blocked by RLS (policy removed).
      const { data, error } = await supabase.rpc('submit_guest_request', {
        p_session_id: sessionId,
        p_track: finalTrack,
        p_requester: sanitizePrompt(identifier.trim()) || 'Anónimo',
        p_guest_token: guestToken || null   // token personal del invitado (6h desde escaneo)
      });

      if (error) {
        const msg = error.message || '';
        if (msg.includes('HOURLY_LIMIT_REACHED')) {
          toast.error(t('guest.error_limit', { limit: requestsPerHour }));
        } else if (msg.includes('TOKEN_EXPIRED')) {
          localStorage.removeItem(`gat_${sessionId}`);
          setGuestToken(null);
          setQrAccessDenied(true);
          toast.error('Tu acceso expiró (6 horas). Escanea el código QR de nuevo para continuar.');
        } else if (msg.includes('INVALID_TOKEN')) {
          localStorage.removeItem(`gat_${sessionId}`);
          setGuestToken(null);
          setQrAccessDenied(true);
          toast.error('Tu acceso ya no es válido. Escanea el código QR de nuevo.');
        } else if (msg.includes('SESSION_NOT_FOUND')) {
          toast.error(t('guest.error_send'));
        } else {
          toast.error(t('guest.error_send'));
        }
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

      // Track this song ID for Anti-Spam concurrent limit
      const myActiveIds = JSON.parse(localStorage.getItem(`my_tracks_${sessionId}`) || '[]');
      if (!myActiveIds.includes(selected.id)) {
        myActiveIds.push(selected.id);
        localStorage.setItem(`my_tracks_${sessionId}`, JSON.stringify(myActiveIds));
      }

      // Save submitted track for success card before clearing selection
      setLastSubmittedTrack(selected);
      toast.success(t('guest.sent_success', { name: selected.name }));
      setSelected(null);
      setQuery('');
      setResults([]);
      setVersionPreference('normal'); // Reset version preference for next request

      if (cooldownEnabled) {
        setCooldown(cooldownMinutes * 60);
      } else {
        // No cooldown: show brief success card that auto-dismisses after 3s
        setShowSuccess(true);
        clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = setTimeout(() => {
          setShowSuccess(false);
          setLastSubmittedTrack(null);
        }, 3000);
      }
    };

    // Guard: prevent double-submit if already in progress
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await sendRequest();
    } finally {
      setIsSubmitting(false);
    }
  };


  const formatCooldown = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (isLoadingConfig) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
        <Loader2 size={32} className="text-accent animate-spin" />
      </div>
    );
  }

  if (!isAvailable) {
    return <ClosedScreen />;
  }

  // Pantalla de acceso expirado/inválido (token QR caducado o revocado)
  if (qrAccessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a0f2e 100%)' }}>
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h.01M14 17h.01M17 14h.01M17 17h3" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Acceso expirado</h1>
          <p className="text-white/60 leading-relaxed mb-2">
            Tu acceso a este evento duró <strong className="text-orange-400">6 horas</strong> desde que escaneaste el QR.
          </p>
          <p className="text-white/40 text-sm">
            Escanea el código QR del evento nuevamente para seguir pidiendo canciones.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent p-4 max-w-lg mx-auto pt-8">
      {/* Header */}
      <div className="text-center mb-8 relative">
        {/* Language toggle top-right */}
        <div className="absolute right-0 top-0">
          <LanguageSelector />
        </div>
        <div className="flex justify-center mb-4">
          <img src="/envairo-logo-sin-fondo.svg" alt="envAIro Logo" className="h-24 w-auto drop-shadow-[0_0_10px_rgba(157,78,221,0.3)]" />
        </div>
        <h1 className="text-2xl font-bold text-gradient">
          {eventName
            ? `${t('guest.title')} ${t('guest.for_event') || (lang === 'EN' ? 'for' : 'para')} ${eventName}`
            : t('guest.title')}
        </h1>
        <p className="text-text-muted mt-1 text-sm">
          {isCommercial ? t('guest.subtitle_commercial') : t('guest.subtitle_party')}
        </p>
      </div>

      {/* Top Banner Ad */}
      <AdSense slot={import.meta.env.VITE_ADSENSE_SLOT_TOP} />

      {/* ── NOW PLAYING ── */}
      {sessionConfig?.current_track && (
        <div
          className="flex items-center gap-3 mb-4 px-4 py-3 rounded-2xl animate-fade-in"
          style={{
            background: 'rgba(157,78,221,0.08)',
            border: '1px solid rgba(157,78,221,0.2)'
          }}
        >
          {/* Equalizer animated bars */}
          <div className="flex items-end gap-[3px] h-5 flex-shrink-0" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-[3px] rounded-full origin-bottom"
                style={{
                  height: '100%',
                  background: 'var(--color-accent)',
                  animation: `eq-bar 0.8s ease-in-out infinite ${i * 0.2}s`,
                  transform: 'scaleY(0.3)'
                }}
              />
            ))}
          </div>

          {/* Album art */}
          {sessionConfig.current_track.image ? (
            <img
              src={sessionConfig.current_track.image}
              alt=""
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-bg-elevated flex items-center justify-center flex-shrink-0">
              <Music2 size={14} className="text-text-muted" />
            </div>
          )}

          {/* Track info */}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
              Sonando ahora
            </p>
            <p className="text-sm font-semibold text-text-primary truncate leading-tight">
              {sessionConfig.current_track.name}
            </p>
            <p className="text-xs text-text-muted truncate">
              {formatArtists(sessionConfig.current_track.artists)}
            </p>
          </div>
        </div>
      )}

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
          <div>
            <input
              className="input-field"
              placeholder={isCommercial ? t('guest.placeholder_table') : t('guest.placeholder_nickname')}
              value={identifier}
              maxLength={15}
              onChange={(e) => setIdentifier(filterMusicEmojis(e.target.value).replace(/[<>]/g, ''))}
              disabled={isInCooldown}
            />
            {/* Character counter — only visible when the user has started typing */}
            {identifier.length > 0 && (
              <div className="flex justify-end mt-1">
                <span
                  className="text-[11px] font-medium tabular-nums transition-colors duration-200"
                  style={{
                    color: identifier.length >= 15
                      ? '#f87171'       // red at limit
                      : identifier.length >= 11
                        ? '#fb923c'       // orange approaching limit
                        : 'rgba(157,154,176,0.6)'  // muted default
                  }}
                >
                  {identifier.length}/15
                </span>
              </div>
            )}
          </div>
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
            maxLength={30}
            onChange={(e) => { setQuery(e.target.value.replace(/[<>]/g, '')); setSelected(null); }}
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
                    {formatArtists(track.artists)} · {track.album}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Selected track — prominent card */}
        {selected && (
          <>
            <div
              className="mt-3 rounded-xl p-3 animate-slide-up-sm"
              style={{
                background: 'rgba(157,78,221,0.1)',
                border: '1px solid rgba(157,78,221,0.4)',
              }}
            >
              <div className="flex items-start gap-3">
                {/* Album art — larger than search results */}
                <div className="relative flex-shrink-0">
                  {selected.image ? (
                    <img
                      src={selected.image}
                      alt=""
                      className="w-16 h-16 rounded-xl object-cover shadow-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-bg-elevated flex items-center justify-center">
                      <Music2 size={20} className="text-text-muted" />
                    </div>
                  )}
                  {/* Checkmark badge */}
                  <div
                    className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.4)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                </div>

                {/* Track info */}
                <div className="min-w-0 flex-1 pt-0.5">
                  {/* "Selected" badge */}
                  <span
                    className="inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mb-1"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}
                  >
                    Seleccionada
                  </span>
                  <p className="text-sm font-bold text-text-primary truncate leading-tight">{selected.name}</p>
                  <p className="text-xs text-text-muted truncate">{formatArtists(selected.artists)}</p>
                  {selected.album && (
                    <p className="text-[11px] text-text-subtle truncate mt-0.5">{selected.album}</p>
                  )}
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => { setSelected(null); setQuery(''); }}
                  className="text-text-muted hover:text-white transition-colors mt-0.5 flex-shrink-0"
                  aria-label="Cambiar canción"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            {/* Version preference selector — only shown when host enables this feature */}
            {guestVersionRequestEnabled && (
              <div className="mt-3 animate-slide-up-sm">
                <p className="text-xs text-text-muted mb-2">¿Qué versión prefieres?</p>
                <div className="flex gap-2">
                  {[
                    { value: 'normal', label: 'Normal', emoji: '🎵' },
                    { value: 'lyrics', label: 'Letra', emoji: '📝' },
                    { value: 'karaoke', label: 'Karaoke', emoji: '🎤' },
                  ].map(({ value, label, emoji }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setVersionPreference(value)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95"
                      style={versionPreference === value ? {
                        background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
                        color: '#fff',
                        boxShadow: '0 2px 12px rgba(157,78,221,0.35)',
                      } : {
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.5)',
                      }}
                    >
                      <span>{emoji}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Submit / Cooldown */}
      {(() => {
        const maxUserRequests = sessionConfig?.requests_per_guest || 0;
        if (maxUserRequests <= 0) return null;

        const myActiveIds = JSON.parse(localStorage.getItem(`my_tracks_${sessionId}`) || '[]');
        const pendingCount = Object.keys(myPendingRequests).length;
        const queueCount = upcomingQueue.filter(track => myActiveIds.includes(track.id)).length;

        if (pendingCount + queueCount >= maxUserRequests) {
          return (
            <div className="card p-5 text-center bg-danger/10 border border-danger/30">
              <div className="w-12 h-12 rounded-full bg-danger/20 flex items-center justify-center mx-auto mb-3">
                <X size={24} className="text-danger" />
              </div>
              <p className="font-semibold text-danger">Límite alcanzado</p>
              <p className="text-text-muted text-sm mt-1">Ya tienes el máximo de {maxUserRequests} canciones en espera o en la cola.</p>
            </div>
          );
        }
        return null;
      })()}

      {isInCooldown ? (
        /* ── SUCCESS + COOLDOWN WAITING CARD ── */
        <div className="card p-5 animate-fade-in" style={{ borderColor: 'rgba(34,197,94,0.25)' }}>
          {/* Song info row */}
          {lastSubmittedTrack && (
            <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {lastSubmittedTrack.image ? (
                <img
                  src={lastSubmittedTrack.image}
                  alt=""
                  className="w-14 h-14 rounded-xl object-cover flex-shrink-0 shadow-lg"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-bg-elevated flex items-center justify-center flex-shrink-0">
                  <Music2 size={20} className="text-text-muted" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-text-primary truncate">{lastSubmittedTrack.name}</p>
                <p className="text-xs text-text-muted truncate">{formatArtists(lastSubmittedTrack.artists)}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="w-3.5 h-3.5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span className="text-[10px] text-green-400 font-medium">Petición enviada</span>
                </div>
              </div>
            </div>
          )}
          {/* Cooldown timer */}
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-2">
              <Clock size={20} className="text-accent" />
            </div>
            <p className="text-sm text-text-muted">{t('guest.cooldown_label')}</p>
            <p className="text-3xl font-bold text-accent mt-1">{formatCooldown(cooldown)}</p>
            {/* Progress bar showing time remaining */}
            <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full transition-all duration-1000 linear"
                style={{
                  width: `${(cooldown / (cooldownMinutes * 60)) * 100}%`,
                  background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))'
                }}
              />
            </div>
          </div>
        </div>
      ) : showSuccess && lastSubmittedTrack ? (
        /* ── BRIEF SUCCESS CARD (no cooldown) ── */
        <div className="card p-5 text-center animate-fade-in" style={{ borderColor: 'rgba(34,197,94,0.25)' }}>
          <div className="relative mx-auto w-16 h-16 mb-4">
            {lastSubmittedTrack.image ? (
              <img src={lastSubmittedTrack.image} alt="" className="w-16 h-16 rounded-xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-bg-elevated flex items-center justify-center">
                <Music2 size={24} className="text-text-muted" />
              </div>
            )}
            {/* Green checkmark badge */}
            <div className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <p className="font-bold text-text-primary">{lastSubmittedTrack.name}</p>
          <p className="text-xs text-text-muted mt-0.5 mb-3">{formatArtists(lastSubmittedTrack.artists)}</p>
          <p className="text-sm text-green-400 font-medium">¡Petición enviada con éxito!</p>
        </div>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !selected || (isCommercial && !identifier.trim())}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Enviando...</span>
            </>
          ) : (
            <>
              <Send size={16} />
              {t('guest.submit')}
            </>
          )}
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
                  <p className="text-xs text-text-muted truncate">{formatArtists(track.artists)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botón de Instalar App (Oculto temporalmente) */}
      {/* <div className="mt-6">
        <InstallAppButton
          variant="custom"
          text={lang === 'es' ? 'Descarga Nuestra App' : 'Download Our App'}
          className="w-full py-4 px-6 rounded-xl text-white font-semibold shadow-glow transition-all duration-200 bg-white/5 hover:bg-white/10 border border-white/10"
        />
      </div> */}

      {/* Bottom Banner Ad */}
      <div className="mt-8">
        <AdSense slot={import.meta.env.VITE_ADSENSE_SLOT_BOTTOM} />
      </div>
    </div>
  );
}

function ClosedScreen() {
  const { t, lang } = useTranslation();
  return (
    <div className="min-h-screen bg-bg-root flex flex-col items-center justify-center p-8 text-center">
      <div className="text-8xl mb-6">🌙</div>
      <h1 className="text-3xl font-bold text-text-primary mb-3">{t('guest.closed_title')}</h1>
      <p className="text-text-muted max-w-xs mb-8">
        {t('guest.closed_sub')}
      </p>

      {/* <Link 
        to="/" 
        className="btn-primary py-3 px-8 rounded-xl font-bold shadow-glow text-lg mb-8"
      >
        {lang === 'es' ? '¡Conviértete en anfitrión!' : 'Become a host!'}
      </Link> */}

      <div className="w-20 h-1 rounded-full bg-accent/30 mx-auto mb-6" />
      <div>
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
