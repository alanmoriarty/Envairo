import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, Clock, Shield, Filter, List, Ban, Info, X, Sparkles, MonitorPlay, Save, Check } from 'lucide-react';
import { Toggle } from '../components/ui/Toggle';
import { TagInput } from '../components/ui/TagInput';
import { ArtistTagInput } from '../components/ui/ArtistTagInput';
import { SongTagInput } from '../components/ui/SongTagInput';
import { InstallAppButton } from '../components/shared/InstallAppButton';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTranslation } from '../store/useLanguageStore';
import { useAuthStore } from '../store/useAuthStore';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { isWithinInterval, parse, addDays, isBefore } from 'date-fns';
import { sanitizeUrl, MAX_URL_LENGTH } from '../utils/security';

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

// Se cargan los géneros comunes desde el useLanguageStore

// Mapeo de géneros relacionados para agregarlos en grupo
const GENRE_ALIASES = {
  // Urbano y Reggaeton
  "reggaeton": ["reggaeton", "urbano", "urbano latino", "música latina", "latin urban", "perreo"],
  "urbano": ["urbano", "urbano latino", "reggaeton", "música latina", "latin urban", "trap latino"],
  "urbano latino": ["urbano latino", "urbano", "reggaeton", "música latina", "latin urban", "trap latino"],
  "trap latino": ["trap latino", "trap", "urbano", "urbano latino", "reggaeton", "música latina"],
  "trap": ["trap", "hip-hop", "rap", "trap latino"],

  // Pop y Rock
  "pop latino": ["pop latino", "pop", "latino", "latin pop"],
  "pop": ["pop", "pop latino", "latin pop", "indie pop"],
  "rock latino": ["rock latino", "rock", "latino", "latin rock", "rock en español"],
  "rock": ["rock", "rock latino", "latin rock", "hard rock", "indie rock", "metal", "punk"],
  "metal": ["metal", "heavy metal", "rock", "hard rock"],
  "punk": ["punk", "rock", "ska", "punk rock"],
  "indie": ["indie", "alternativo", "indie pop", "indie rock", "alternative"],
  "alternativo": ["alternativo", "alternative", "indie", "rock alternativo"],

  // Música Electrónica
  "electrónica": ["electrónica", "dance", "house", "techno", "edm", "electronic", "trance", "dubstep"],
  "dance": ["dance", "electrónica", "edm", "club"],
  "house": ["house", "electrónica", "dance"],
  "techno": ["techno", "electrónica", "dance"],
  "lofi": ["lofi", "ambient", "chill", "instrumental hip-hop"],

  // English aliases to map translated genres to the same groups
  "latin urban": ["urbano latino", "reggaeton", "música latina", "latin urban", "trap latino"],
  "latin trap": ["trap latino", "trap", "urbano latino", "reggaeton", "música latina"],
  "latin pop": ["pop latino", "pop", "latino", "latin pop"],
  "latin rock": ["rock latino", "rock", "latino", "latin rock", "rock en español"],
  "alternative": ["alternativo", "alternative", "indie", "rock alternativo"],
  "electronic": ["electrónica", "electronic", "dance", "house", "techno", "edm", "trance", "dubstep"],
  "regional mexican": ["regional mexicano", "banda", "norteño", "mariachi", "corridos", "corridos tumbados", "ranchera"],
  "mexican music": ["música mexicana", "regional mexicano", "banda", "norteño"],
  "acoustic": ["acústico", "acoustic", "cantautor", "folk", "unplugged"],
  "singer-songwriter": ["cantautor", "acústico", "folk", "singer-songwriter"],
  "classical": ["clásica", "classical", "instrumental"],
  "christian music": ["música cristiana", "christian", "gospel", "worship"],
  "children's music": ["música infantil", "children's music", "kids", "disney"],
  "latin": ["latino", "latin pop", "latin rock", "latin urban"],

  // Hip-Hop, R&B y Soul
  "hip-hop": ["hip-hop", "rap", "hip hop", "r&b", "trap"],
  "rap": ["rap", "hip-hop", "hip hop", "trap"],
  "r&b": ["r&b", "rnb", "soul", "hip-hop", "rhythm and blues"],
  "soul": ["soul", "r&b", "funk", "blues"],

  // Tropical y Caribeño
  "salsa": ["salsa", "tropical", "latino"],
  "bachata": ["bachata", "tropical", "latino"],
  "cumbia": ["cumbia", "tropical", "latino"],
  "merengue": ["merengue", "tropical", "latino"],
  "tropical": ["tropical", "salsa", "bachata", "merengue", "cumbia", "latino"],
  "reggae": ["reggae", "dancehall", "ska"],

  // Regional Mexicano
  "regional mexicano": ["regional mexicano", "banda", "norteño", "mariachi", "corridos", "corridos tumbados", "ranchera", "música mexicana"],
  "banda": ["banda", "regional mexicano", "música mexicana"],
  "norteño": ["norteño", "regional mexicano", "música mexicana"],
  "corridos": ["corridos", "regional mexicano", "música mexicana", "corridos tumbados"],
  "corridos tumbados": ["corridos tumbados", "regional mexicano", "corridos", "música mexicana", "sierreño"],
  "mariachi": ["mariachi", "ranchera", "regional mexicano", "música mexicana"],

  // Otros géneros globales
  "clásica": ["clásica", "classical", "instrumental", "orquesta"],
  "country": ["country", "folk", "americana"],
  "folk": ["folk", "acústico", "cantautor", "country"],
  "jazz": ["jazz", "blues", "smooth jazz"],
  "blues": ["blues", "jazz", "soul"],
  "afrobeats": ["afrobeats", "world", "afro pop"],
  "anime": ["anime", "j-pop", "soundtrack"],
  "soundtrack": ["soundtrack", "banda sonora", "ost", "cine", "películas"]
};

export default function SettingsPage() {
  const {
    alwaysAvailable, setAlwaysAvailable,
    startTime, setStartTime,
    endTime, setEndTime,
    repeatCooldown, setRepeatCooldown,
    artistRepeatCooldown, setArtistRepeatCooldown,
    cooldownEnabled, setCooldownEnabled,
    cooldownMinutes, setCooldownMinutes,
    explicitFilter, setExplicitFilter,
    requestsPerHour, setRequestsPerHour,
    requestsPerGuest, setRequestsPerGuest,
    guestSessionExpiryHours, setGuestSessionExpiryHours,
    tableCount, setTableCount,
    guestVersionRequest, setGuestVersionRequest,
    whitelistGenres, addWhitelistGenre, removeWhitelistGenre, clearWhitelistGenres,
    blacklistGenres, addBlacklistGenre, removeBlacklistGenre, clearBlacklistGenres,
    blacklistSongs, addBlacklistSong, removeBlacklistSong, clearBlacklistSongs,
    blacklistArtists, addBlacklistArtist, removeBlacklistArtist, clearBlacklistArtists,
    enairoEnabled, setEnairoEnabled,
    enairoPrompt, setEnairoPrompt,
    enairoTestMode, setEnairoTestMode,
    enairoLastRunAt,
    visualizerEnabled, setVisualizerEnabled,
    visualizerUrl, setVisualizerUrl,
    lastSavedSignature, setLastSavedSignature
  } = useSettingsStore();
  const store = useSettingsStore();
  const { t } = useTranslation();

  const user = useAuthStore(s => s.user);
  const userEmail = user?.email?.toLowerCase() || '';
  const ALLOWED_EMAILS = [
    'aliriopina04@gmail.com',
    'aliriopina05@gmail.com',
    'javiercardonaaudiovisual@gmail.com',
    'verotorrenegra@gmail.com'
  ];
  const canSeeTestMode = ALLOWED_EMAILS.includes(userEmail);

  const COMMON_GENRES = t('settings.common_genres') || [];

  const [showGenreGuide, setShowGenreGuide] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('simple');

  const ALL_KEYS_FOR_SYNC = [
    'eventName', 'mode', 'alwaysAvailable', 'startTime', 'endTime',
    'requestsPerHour', 'requestsPerGuest', 'guestSessionExpiryHours', 'tableCount', 'partyRequestOffset',
    'allowRepeats', 'repeatCooldown', 'artistRepeatCooldown', 'cooldownEnabled', 'cooldownMinutes',
    'explicitFilter', 'guestVersionRequest', 'visualizerEnabled', 'visualizerUrl',
    'djTransitionsEnabled', 'djTransitionMode', 'djTransitionDuration',
    'whitelistGenres', 'blacklistGenres', 'blacklistSongs', 'blacklistArtists'
  ];

  const getSettingsSignature = (stateObj) => {
    const obj = {};
    ALL_KEYS_FOR_SYNC.forEach(k => {
      obj[k] = stateObj[k] !== undefined ? stateObj[k] : null;
    });
    return JSON.stringify(obj);
  };

  const [initialSignature, setInitialSignature] = useState(() => getSettingsSignature(useSettingsStore.getState()));
  const currentSignature = getSettingsSignature(store);

  // Solo se activa si el usuario realmente modificó algún campo respecto a la carga inicial o último guardado
  const hasChanges = currentSignature !== initialSignature;

  const saveSettingsToCloud = async () => {
    if (!hasChanges) return;
    setIsSaving(true);
    try {
      const state = useSettingsStore.getState();
      const { sessionId, hostSecret } = state;

      await supabase.auth.updateUser({
        data: { host_settings: currentSignature }
      });

      if (sessionId && hostSecret) {
        // Calcular disponibilidad
        let currentActive = state.alwaysAvailable;

        await supabase.rpc('sync_host_config', {
          p_session_id: sessionId,
          p_secret: hostSecret,
          p_updates: {
            mode: state.mode,
            event_name: state.eventName,
            blacklist_genres: state.blacklistGenres,
            blacklist_songs: state.blacklistSongs,
            blacklist_artists: state.blacklistArtists,
            allow_repeats: state.allowRepeats,
            repeat_cooldown: state.repeatCooldown,
            cooldown_enabled: state.cooldownEnabled,
            cooldown_minutes: state.cooldownMinutes,
            table_count: state.tableCount,
            requests_per_hour: state.requestsPerHour,
            requests_per_guest: state.requestsPerGuest,
            guest_version_request: state.guestVersionRequest,
            active: currentActive,
            updated_at: new Date().toISOString()
          }
        });
      }
      setInitialSignature(currentSignature);
      setLastSavedSignature(currentSignature);
      toast.success(t('settings.save_success') || 'Cambios guardados exitosamente');
    } catch (e) {
      console.error(e);
      toast.error(t('settings.save_error') || 'Error al guardar los cambios');
    } finally {
      setIsSaving(false);
    }
  };


  const handleAddWhitelistGenre = (genre) => {
    const aliases = GENRE_ALIASES[genre.toLowerCase()];
    if (aliases) {
      aliases.forEach(g => addWhitelistGenre(g));
    } else {
      addWhitelistGenre(genre);
    }
  };

  const handleAddBlacklistGenre = (genre) => {
    const aliases = GENRE_ALIASES[genre.toLowerCase()];
    if (aliases) {
      aliases.forEach(g => addBlacklistGenre(g));
    } else {
      addBlacklistGenre(genre);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Settings size={22} className="text-accent" /> {t('settings.title')}
        </h1>
        <p className="text-text-muted text-sm mt-1 mb-4">{t('settings.subtitle')}</p>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-white/5 rounded-xl border border-white/10 w-full sm:max-w-md">
          <button
            onClick={() => setActiveTab('simple')}
            className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-all text-center ${activeTab === 'simple' ? 'bg-accent text-white shadow-glow' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
          >
            {t('settings.tab_simple')}
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-all text-center ${activeTab === 'custom' ? 'bg-accent text-white shadow-glow' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
          >
            {t('settings.tab_custom')}
          </button>
        </div>
      </div>

      {activeTab === 'simple' && (
        <div className="space-y-6 animate-fade-in">
          <section className="card p-5 space-y-4 animate-fade-in">
            <h2 className="font-bold text-text-primary">{t('settings.general_visual')}</h2>

            <div className="mb-4">
              <InstallAppButton className="w-full sm:w-auto py-2.5 px-5 rounded-lg text-sm" text={t('settings.download_app')} />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-primary mb-1.5">{t('settings.event_name_label')}</label>
              <input
                type="text"
                value={store.eventName}
                onChange={(e) => store.setEventName(filterMusicEmojis(e.target.value))}
                placeholder={t('settings.event_name_placeholder')}
                maxLength={40}
                className="input-field w-full"
              />
              <p className="text-xs text-text-muted mt-1.5">
                {t('settings.event_name_desc')}
              </p>
            </div>
            <div className="border-t border-white/5 pt-4 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <MonitorPlay size={16} className="text-text-muted" />
                <h2 className="font-bold text-text-primary">{t('settings.visualizer_title')}</h2>
              </div>

              <p className="text-xs text-text-muted mb-2">
                {t('settings.visualizer_desc')}
              </p>

              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-text-primary cursor-pointer" onClick={() => setVisualizerEnabled(!visualizerEnabled)}>{t('settings.visualizer_toggle')}</label>
                <Toggle checked={visualizerEnabled} onChange={setVisualizerEnabled} />
              </div>

              {visualizerEnabled && (
                <div className="pt-2 animate-fade-in space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="block text-sm font-semibold text-text-primary">{t('settings.visualizer_url_label')}</label>
                    <span className={`text-xs font-mono ${visualizerUrl.length >= MAX_URL_LENGTH ? 'text-danger font-bold' : 'text-text-muted'}`}>
                      {visualizerUrl.length} / {MAX_URL_LENGTH}
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={MAX_URL_LENGTH}
                    value={visualizerUrl}
                    onChange={(e) => setVisualizerUrl(sanitizeUrl(e.target.value))}
                    placeholder={t('settings.visualizer_url_placeholder')}
                    className="input-field w-full text-sm font-mono placeholder:font-sans"
                  />
                  <p className="text-[10px] text-text-muted mt-1.5">
                    {t('settings.visualizer_url_desc')}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* General filters */}
          <section className="card p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={16} className="text-accent" />
              <h2 className="font-bold text-text-primary">{t('settings.filters_title')}</h2>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1">
              <div>
                <p className="font-semibold text-text-primary text-sm">{t('settings.repeat_filter')}</p>
                <p className="text-xs text-text-muted mt-0.5">{t('settings.repeat_filter_desc')}</p>
              </div>
              <select
                value={repeatCooldown}
                onChange={(e) => setRepeatCooldown(Number(e.target.value))}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="-1" className="bg-bg-root text-white">{t('settings.repeat_always')}</option>
                <option value="30" className="bg-bg-root text-white">{t('settings.repeat_30')}</option>
                <option value="60" className="bg-bg-root text-white">{t('settings.repeat_60')}</option>
                <option value="120" className="bg-bg-root text-white">{t('settings.repeat_120')}</option>
                <option value="0" className="bg-bg-root text-white">{t('settings.repeat_session')}</option>
              </select>
            </div>

            <div className="border-t border-white/5 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1">
                <div>
                  <p className="font-semibold text-text-primary text-sm">{t('settings.artist_repeat_filter')}</p>
                  <p className="text-xs text-text-muted mt-0.5">{t('settings.artist_repeat_desc')}</p>
                </div>
                <select
                  value={artistRepeatCooldown ?? -1}
                  onChange={(e) => setArtistRepeatCooldown(Number(e.target.value))}
                  className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="-1" className="bg-bg-root text-white">{t('settings.artist_repeat_always')}</option>
                  <option value="15" className="bg-bg-root text-white">{t('settings.artist_repeat_15')}</option>
                  <option value="30" className="bg-bg-root text-white">{t('settings.artist_repeat_30')}</option>
                  <option value="45" className="bg-bg-root text-white">{t('settings.artist_repeat_45')}</option>
                  <option value="60" className="bg-bg-root text-white">{t('settings.artist_repeat_60')}</option>
                  <option value="120" className="bg-bg-root text-white">{t('settings.artist_repeat_120')}</option>
                  <option value="0" className="bg-bg-root text-white">{t('settings.artist_repeat_session')}</option>
                </select>
              </div>
            </div>

            <div className="border-t border-white/5 pt-4">
              <Toggle
                checked={cooldownEnabled}
                onChange={setCooldownEnabled}
                label={t('settings.cooldown_title')}
                description={t('settings.cooldown_desc')}
              />
              {cooldownEnabled && (
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-slide-up sm:pl-12 pl-2">
                  <div>
                    <label className="text-sm font-medium text-text-primary">{t('settings.cooldown_minutes')}</label>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={cooldownMinutes}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') { setCooldownMinutes(''); return; }
                      const n = parseInt(v, 10);
                      if (!isNaN(n)) setCooldownMinutes(Math.min(120, Math.max(1, n)));
                    }}
                    onBlur={() => { if (cooldownMinutes === '') setCooldownMinutes(10); }}
                    className="input-field w-24 text-center"
                  />
                </div>
              )}
            </div>

            <div className="border-t border-white/5 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="text-sm font-semibold text-text-primary">{t('settings.req_per_hour_title')}</label>
                  <p className="text-xs text-text-muted mt-0.5">{t('settings.req_per_hour_desc')}</p>
                </div>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={requestsPerHour}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') { setRequestsPerHour(''); return; }
                    const n = parseInt(v, 10);
                    if (!isNaN(n)) setRequestsPerHour(Math.min(100, Math.max(1, n)));
                  }}
                  onBlur={() => { if (requestsPerHour === '') setRequestsPerHour(15); }}
                  className="input-field w-full sm:w-24 text-center"
                />
              </div>
            </div>

            <div className="border-t border-white/5 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="text-sm font-semibold text-text-primary">{t('settings.req_per_guest_title')}</label>
                  <p className="text-xs text-text-muted mt-0.5">{t('settings.req_per_guest_desc')}</p>
                </div>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={requestsPerGuest}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') { setRequestsPerGuest(''); return; }
                    const n = parseInt(v, 10);
                    if (!isNaN(n)) setRequestsPerGuest(Math.min(20, Math.max(0, n)));
                  }}
                  onBlur={() => { if (requestsPerGuest === '') setRequestsPerGuest(0); }}
                  className="input-field w-full sm:w-24 text-center"
                />
              </div>
            </div>

            <div className="border-t border-white/5 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="text-sm font-semibold text-text-primary">{t('settings.guest_expiry_title')}</label>
                  <p className="text-xs text-text-muted mt-0.5">{t('settings.guest_expiry_desc')}</p>
                </div>
                <select
                  value={guestSessionExpiryHours || 6}
                  onChange={(e) => setGuestSessionExpiryHours(Number(e.target.value))}
                  className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value={2} className="bg-bg-root text-white">{t('settings.expiry_2h')}</option>
                  <option value={4} className="bg-bg-root text-white">{t('settings.expiry_4h')}</option>
                  <option value={6} className="bg-bg-root text-white">{t('settings.expiry_6h')}</option>
                  <option value={8} className="bg-bg-root text-white">{t('settings.expiry_8h')}</option>
                  <option value={12} className="bg-bg-root text-white">{t('settings.expiry_12h')}</option>
                  <option value={24} className="bg-bg-root text-white">{t('settings.expiry_24h')}</option>
                </select>
              </div>
            </div>

            <div className="border-t border-white/5 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="text-sm font-semibold text-text-primary">{t('settings.table_count_title')}</label>
                  <p className="text-xs text-text-muted mt-0.5">{t('settings.table_count_desc')}</p>
                </div>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={tableCount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') { setTableCount(''); return; }
                    const n = parseInt(v, 10);
                    if (!isNaN(n)) setTableCount(Math.min(50, Math.max(0, n)));
                  }}
                  onBlur={() => { if (tableCount === '') setTableCount(0); }}
                  className="input-field w-full sm:w-24 text-center"
                />
              </div>
            </div>

            <div className="border-t border-white/5 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                    <span>🎤</span> {t('settings.guest_version_title')}
                  </label>
                  <p className="text-xs text-text-muted mt-0.5">
                    {t('settings.guest_version_desc')}
                  </p>
                </div>
                <Toggle
                  checked={guestVersionRequest}
                  onChange={setGuestVersionRequest}
                />
              </div>
            </div>

            {/* DJ Transitions System */}
            <div className="border-t border-white/5 pt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                    <span>🎧</span> {t('settings.dj_transitions_title')}
                  </label>
                  <p className="text-xs text-text-muted mt-0.5">
                    {t('settings.dj_transitions_desc')}
                  </p>
                </div>
                <Toggle
                  checked={store.djTransitionsEnabled}
                  onChange={store.setDjTransitionsEnabled}
                />
              </div>

              {store.djTransitionsEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 animate-fade-in">
                  <div>
                    <label className="block text-xs font-semibold text-text-primary mb-1">{t('settings.dj_transition_effect')}</label>
                    <select
                      value={store.djTransitionMode}
                      onChange={(e) => store.setDjTransitionMode(e.target.value)}
                      className="input-field w-full text-xs"
                    >
                      <option value="random">{t('settings.dj_transition_random')}</option>
                      <option value="fade">{t('settings.dj_transition_fade')}</option>
                      <option value="cut">{t('settings.dj_transition_cut')}</option>
                      <option value="brake">{t('settings.dj_transition_brake')}</option>
                      <option value="echo">{t('settings.dj_transition_echo')}</option>
                      <option value="start">{t('settings.dj_transition_start')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-primary mb-1">{t('settings.dj_anticipation')}</label>
                    <select
                      value={store.djTransitionDuration}
                      onChange={(e) => store.setDjTransitionDuration(parseInt(e.target.value, 10))}
                      className="input-field w-full text-xs"
                    >
                      <option value="3">{t('settings.dj_sec_3')}</option>
                      <option value="5">{t('settings.dj_sec_5')}</option>
                      <option value="7">{t('settings.dj_sec_7')}</option>
                      <option value="10">{t('settings.dj_sec_10')}</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

      )}

      {activeTab === 'custom' && (
        <div className="space-y-6 animate-fade-in">
          {/* EnvAIro Selector (IA) section removed and moved to Dashboard modal */}
          {/* Removed General Filters from here */}

          {/* Genre filters */}
          <section className="card p-5 space-y-4 relative z-20">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-accent" />
                <h2 className="font-bold text-text-primary">{t('settings.adv_genre_title')}</h2>
              </div>
              <button
                onClick={() => setShowGenreGuide(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              >
                <Info size={14} /> {t('settings.guide_btn')}
              </button>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-2">
                  <List size={14} className="text-success shrink-0" />
                  <label className="text-sm font-semibold text-success">{t('settings.whitelist_genre_title')}</label>
                </div>
                {whitelistGenres.length > 0 && (
                  <button onClick={clearWhitelistGenres} className="text-xs text-text-muted hover:text-danger transition-colors">{t('settings.empty_btn')}</button>
                )}
              </div>
              <p className="text-xs text-text-muted mb-2">{t('settings.whitelist_genre_desc')}</p>
              <TagInput
                tags={whitelistGenres}
                onAdd={handleAddWhitelistGenre}
                onRemove={removeWhitelistGenre}
                placeholder={t('settings.whitelist_placeholder')}
                suggestions={COMMON_GENRES}
              />
            </div>

            <div className="border-t border-white/5 pt-4">
              <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-2">
                  <Ban size={14} className="text-danger shrink-0" />
                  <label className="text-sm font-semibold text-danger">{t('settings.blacklist_genre_title')}</label>
                </div>
                {blacklistGenres.length > 0 && (
                  <button onClick={clearBlacklistGenres} className="text-xs text-text-muted hover:text-danger transition-colors">{t('settings.empty_btn')}</button>
                )}
              </div>
              <p className="text-xs text-text-muted mb-2">{t('settings.blacklist_genre_desc')}</p>
              <TagInput
                tags={blacklistGenres}
                onAdd={handleAddBlacklistGenre}
                onRemove={removeBlacklistGenre}
                placeholder={t('settings.blacklist_genre_placeholder')}
                suggestions={COMMON_GENRES}
              />
            </div>
          </section>
          {/* Artist filters */}
          <section className="card p-5 space-y-5 relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <Filter size={16} className="text-accent" />
              <h2 className="font-bold text-text-primary">{t('settings.adv_artist_title')}</h2>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-2">
                  <Ban size={14} className="text-danger" />
                  <label className="text-sm font-semibold text-danger">{t('settings.blacklist_song_title')}</label>
                </div>
                {blacklistSongs.length > 0 && (
                  <button onClick={clearBlacklistSongs} className="text-xs text-text-muted hover:text-danger transition-colors">{t('settings.empty_btn')}</button>
                )}
              </div>
              <p className="text-xs text-text-muted mb-2">{t('settings.blacklist_song_desc')}</p>
              <SongTagInput
                tags={blacklistSongs}
                onAdd={addBlacklistSong}
                onRemove={removeBlacklistSong}
                placeholder={t('settings.blacklist_song_placeholder')}
              />
            </div>

            <div className="border-t border-white/5 pt-4">
              <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-2">
                  <Ban size={14} className="text-danger" />
                  <label className="text-sm font-semibold text-danger">{t('settings.blacklist_artist_title')}</label>
                </div>
                {blacklistArtists.length > 0 && (
                  <button onClick={clearBlacklistArtists} className="text-xs text-text-muted hover:text-danger transition-colors">{t('settings.empty_btn')}</button>
                )}
              </div>
              <p className="text-xs text-text-muted mb-2">{t('settings.blacklist_artist_desc')}</p>
              <ArtistTagInput
                tags={blacklistArtists}
                onAdd={addBlacklistArtist}
                onRemove={removeBlacklistArtist}
                placeholder={t('settings.blacklist_artist_placeholder')}
              />
            </div>
          </section>
        </div>
      )}

      {/* Sticky Save Footer */}
      <div className={`sticky bottom-4 z-40 mt-8 flex justify-end pointer-events-none transition-all duration-300 ${hasChanges ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <button
          onClick={saveSettingsToCloud}
          disabled={isSaving || !hasChanges}
          className="pointer-events-auto flex items-center justify-center w-14 h-14 rounded-full bg-accent text-white hover:scale-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(var(--color-accent),0.4)] disabled:opacity-50 disabled:hover:scale-100"
          title={t('settings.save_btn') || 'Confirmar Cambios'}
        >
          {isSaving ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Check size={28} strokeWidth={3} />
          )}
        </button>
      </div>

      {showGenreGuide && createPortal(
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-modal-backdrop">
          <div className="bg-bg-elevated w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-modal-content flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-bg-elevated z-10">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <Info size={18} className="text-accent" />
                {t('settings.guide_modal_title')}
              </h3>
              <button onClick={() => setShowGenreGuide(false)} className="text-text-muted hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar text-sm text-text-muted space-y-4">
              <p>
                {t('settings.guide_modal_intro')}
              </p>

              <div className="space-y-3">
                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">{t('settings.guide_modal_urbano')}</h4>
                  <p><strong>Reggaeton:</strong> {t('settings.guide_modal_reggaeton_desc')}</p>
                  <p><strong>Trap Latino:</strong> {t('settings.guide_modal_trap_desc')}</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">{t('settings.guide_modal_pop')}</h4>
                  <p><strong>Pop:</strong> {t('settings.guide_modal_pop_desc')}</p>
                  <p><strong>Rock:</strong> {t('settings.guide_modal_rock_desc')}</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">{t('settings.guide_modal_electro')}</h4>
                  <p><strong>Electrónica:</strong> {t('settings.guide_modal_electro_desc')}</p>
                  <p><strong>Lofi:</strong> {t('settings.guide_modal_lofi_desc')}</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">{t('settings.guide_modal_tropical')}</h4>
                  <p><strong>Tropical:</strong> {t('settings.guide_modal_tropical_desc')}</p>
                  <p><strong>Reggae:</strong> {t('settings.guide_modal_reggae_desc')}</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">{t('settings.guide_modal_regional')}</h4>
                  <p><strong>Regional Mexicano:</strong> {t('settings.guide_modal_regional_desc')}</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">{t('settings.guide_modal_other')}</h4>
                  <p><strong>Hip-Hop / Rap:</strong> {t('settings.guide_modal_hiphop_desc')}</p>
                  <p><strong>Folk:</strong> {t('settings.guide_modal_folk_desc')}</p>
                  <p><strong>Soundtrack:</strong> {t('settings.guide_modal_soundtrack_desc')}</p>
                </div>
              </div>

              <div className="bg-accent/10 text-accent p-3 rounded-xl border border-accent/20 mt-4">
                {t('settings.guide_modal_tip').split(/(\bTip:|\bX\b)/).map((part, i) => {
                  if (part === 'Tip:' || part === 'X') return <strong key={i}>{part}</strong>;
                  return part;
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
