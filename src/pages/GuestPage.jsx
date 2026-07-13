import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Moon, Clock, Send, Music2, User, Hash, Loader2, X } from 'lucide-react';
import { useAvailability } from '../hooks/useAvailability';
import { useSettingsStore } from '../store/useSettingsStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { searchTracks, getArtist } from '../lib/spotifyApi';
import { getAccessToken } from '../lib/spotifyAuth';

const COOLDOWN_SECONDS = 5 * 60; // 5 minutes
const MAX_REQUESTS = 3;



export default function GuestPage() {
  const { sessionId } = useParams();
  const { isAvailable } = useAvailability();
  const { mode, blacklistGenres, whitelistArtists, blacklistArtists, allowRepeats } = useSettingsStore();
  const { queue, currentQueueIndex, addPendingRequest, playHistory, pendingRequests } = usePlayerStore();
  const upcomingQueue = queue.slice(currentQueueIndex + 1);

  const [identifier, setIdentifier] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [requestCount, setRequestCount] = useState({});
  const debounceRef = useRef(null);
  const cooldownRef = useRef(null);

  const isCommercial = mode === 'commercial';
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
          const token = getAccessToken();
          if (!token) {
            setResults(getMockResults(query));
            return;
          }
          const data = await searchTracks(query, 6);
          const items = data?.tracks?.items || [];
          setResults(items.map(normalizeApiTrack));
        } catch (err) {
          setResults(getMockResults(query));
        } finally {
          setSearching(false);
        }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

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

  const handleSubmit = () => {
    if (!selected) { toast.error('Selecciona una canción primero'); return; }
    if (isCommercial && !identifier.trim()) {
      toast.error('El número de mesa es obligatorio');
      return;
    }

    // Check song request count
    const count = requestCount[selected.id] || 0;
    if (count >= MAX_REQUESTS) {
      toast.error(`Esta canción ya fue pedida ${MAX_REQUESTS} veces en esta sesión`);
      return;
    }

    // Blacklist genre check
    if (blacklistGenres.length > 0 && selected.genre) {
      const blocked = blacklistGenres.some((g) =>
        selected.genre?.toLowerCase().includes(g.toLowerCase())
      );
      if (blocked) {
        toast.error('Esta canción pertenece a un género bloqueado por el anfitrión');
        return;
      }
    }

    // Artist Whitelist check
    if (whitelistArtists?.length > 0) {
      const allowed = whitelistArtists.some((a) =>
        selected.artists.toLowerCase().includes(a.toLowerCase())
      );
      if (!allowed) {
        toast.error('El artista de esta canción no está permitido en esta sesión');
        return;
      }
    }

    // Artist Blacklist check
    if (blacklistArtists?.length > 0) {
      const blocked = blacklistArtists.some((a) =>
        selected.artists.toLowerCase().includes(a.toLowerCase())
      );
      if (blocked) {
        toast.error('Este artista está bloqueado por el anfitrión');
        return;
      }
    }

    // Allow Repeats check
    if (!allowRepeats) {
      const alreadyInQueue = queue.some(t => t.id === selected.id);
      const alreadyInHistory = playHistory.some(t => t.id === selected.id);
      const alreadyPending = pendingRequests.some(r => r.track.id === selected.id);
      if (alreadyInQueue || alreadyInHistory || alreadyPending) {
        toast.error('Esta canción ya fue pedida o reproducida y no se admiten repeticiones');
        return;
      }
    }

    addPendingRequest({
      track: selected,
      requester: identifier.trim() || 'Anónimo',
    });

    setRequestCount((prev) => ({
      ...prev,
      [selected.id]: (prev[selected.id] || 0) + 1,
    }));

    toast.success(`¡"${selected.name}" enviada al anfitrión!`);
    setSelected(null);
    setQuery('');
    setResults([]);
    setCooldown(COOLDOWN_SECONDS);
  };

  const formatCooldown = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (!isAvailable) {
    return <ClosedScreen />;
  }

  return (
    <div className="min-h-screen bg-bg-root p-4 max-w-lg mx-auto pt-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center mx-auto mb-4 shadow-glow">
          <Music2 size={28} className="text-accent" />
        </div>
        <h1 className="text-2xl font-bold text-gradient">Pide tu canción</h1>
        <p className="text-text-muted mt-1 text-sm">
          {isCommercial ? 'Bar / Restaurante' : 'Modo Fiesta 🎉'}
        </p>
      </div>

      {/* Identifier input */}
      <div className="card p-4 mb-4">
        <label className="block text-sm text-text-muted mb-2">
          {isCommercial ? (
            <span className="flex items-center gap-1.5">
              <Hash size={14} />Mesa (obligatorio)
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <User size={14} />Tu apodo (opcional)
            </span>
          )}
        </label>
        <input
          className="input-field"
          placeholder={isCommercial ? 'Ej: Mesa 7' : 'Ej: DJ Carlos 🎧'}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          disabled={isInCooldown}
        />
      </div>

      {/* Search */}
      <div className="card p-4 mb-4">
        <label className="block text-sm text-text-muted mb-2 flex items-center gap-1.5">
          <Search size={14} />Buscar canción en Spotify
        </label>
        <div className="relative">
          <input
            className="input-field pr-10"
            placeholder="Busca por título, artista o álbum..."
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
      {isInCooldown ? (
        <div className="card p-5 text-center">
          <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-3">
            <Clock size={24} className="text-accent" />
          </div>
          <p className="font-semibold text-text-primary">¡Canción enviada!</p>
          <p className="text-text-muted text-sm mt-1">Podrás pedir otra en</p>
          <p className="text-3xl font-bold text-accent mt-2">{formatCooldown(cooldown)}</p>
        </div>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!selected || (isCommercial && !identifier.trim())}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={16} />
          Enviar petición
        </button>
      )}

      {/* Mini queue */}
      {upcomingQueue.length > 0 && (
        <div className="card p-4 mt-6">
          <h3 className="text-sm font-semibold text-text-muted mb-3 flex items-center gap-2">
            <Music2 size={14} />Próximas en cola
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
    </div>
  );
}

function ClosedScreen() {
  return (
    <div className="min-h-screen bg-bg-root flex flex-col items-center justify-center p-8 text-center">
      <div className="text-8xl mb-6">🌙</div>
      <h1 className="text-3xl font-bold text-text-primary mb-3">Fuera de horario</h1>
      <p className="text-text-muted max-w-xs">
        El anfitrión ha cerrado las peticiones por ahora. ¡Vuelve pronto!
      </p>
      <div className="mt-8 w-20 h-1 rounded-full bg-accent/30 mx-auto" />
    </div>
  );
}

function normalizeApiTrack(t) {
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => a.name).join(', '),
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
