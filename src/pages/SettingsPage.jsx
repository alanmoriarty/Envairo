import React, { useState, useEffect } from 'react';
import { Settings, Clock, Shield, Filter, List, Ban, Info, X, Sparkles, MonitorPlay, Save, Check } from 'lucide-react';
import { Toggle } from '../components/ui/Toggle';
import { TagInput } from '../components/ui/TagInput';
import { ArtistTagInput } from '../components/ui/ArtistTagInput';
import { SongTagInput } from '../components/ui/SongTagInput';
import { InstallAppButton } from '../components/shared/InstallAppButton';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTranslation } from '../store/useLanguageStore';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { isWithinInterval, parse, addDays, isBefore } from 'date-fns';

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
    cooldownEnabled, setCooldownEnabled,
    cooldownMinutes, setCooldownMinutes,
    explicitFilter, setExplicitFilter,
    requestsPerHour, setRequestsPerHour,
    requestsPerGuest, setRequestsPerGuest,
    tableCount, setTableCount,
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

  const COMMON_GENRES = t('settings.common_genres') || [];

  const [showGenreGuide, setShowGenreGuide] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('simple');

  const allKeysForSync = ['enairoPrompt', 'enairoEnabled', 'enairoTestMode', 'whitelistGenres', 'mode', 'eventName', 'blacklistGenres', 'blacklistSongs', 'blacklistArtists', 'allowRepeats', 'repeatCooldown', 'alwaysAvailable', 'startTime', 'endTime', 'cooldownEnabled', 'cooldownMinutes', 'tableCount', 'requestsPerHour', 'requestsPerGuest', 'explicitFilter'];
  const currentSettingsObj = {};
  allKeysForSync.forEach(k => { currentSettingsObj[k] = store[k]; });
  const currentSignature = JSON.stringify(currentSettingsObj);

  // Si no se ha cargado una firma aún (recién abierto sin red), consideramos que no hay cambios
  const hasChanges = lastSavedSignature ? currentSignature !== lastSavedSignature : false;

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

        await supabase.rpc('update_session_state', {
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
            active: currentActive,
            updated_at: new Date().toISOString()
          }
        });
      }
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
        <div className="flex flex-col sm:flex-row gap-2 p-1 bg-white/5 rounded-xl border border-white/10 w-full sm:w-fit">
          <button
            onClick={() => setActiveTab('simple')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'simple' ? 'bg-accent text-white shadow-glow' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
          >
            Configuración Simple
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'custom' ? 'bg-accent text-white shadow-glow' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
          >
            Configuración Personalizada
          </button>
        </div>
      </div>

      {activeTab === 'simple' && (
        <section className="card p-5 space-y-4 animate-fade-in">
          <h2 className="font-bold text-text-primary">General</h2>

          <div className="mb-4">
            <InstallAppButton className="w-full sm:w-auto py-2.5 px-5 rounded-lg text-sm" text="Descarga Nuestra App!" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1.5">Nombre del Evento o Establecimiento (opcional)</label>
            <input
              type="text"
              value={store.eventName}
              onChange={(e) => store.setEventName(filterMusicEmojis(e.target.value))}
              placeholder="Ej: La fiesta de Don Julian"
              maxLength={40}
              className="input-field w-full"
            />
            <p className="text-xs text-text-muted mt-1.5">
              Se mostrará a tus invitados en la página web: "Pide tu canción para..."
            </p>
          </div>
          <div className="border-t border-white/5 pt-4">
            <Toggle
              checked={alwaysAvailable}
              onChange={setAlwaysAvailable}
              label={t('settings.always_available')}
              description={t('settings.always_available_desc')}
            />
          </div>

          <div className="border-t border-white/5 pt-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <MonitorPlay size={16} className="text-text-muted" />
              <h2 className="font-bold text-text-primary">Fondo Visualizador (YouTube)</h2>
            </div>

            <p className="text-xs text-text-muted mb-2">
              Reproduce una lista de YouTube (o video largo) sin audio en el fondo, en lugar de mostrar los videos musicales de las canciones.
            </p>

            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-text-primary cursor-pointer" onClick={() => setVisualizerEnabled(!visualizerEnabled)}>Activar Fondo Visualizador</label>
              <Toggle checked={visualizerEnabled} onChange={setVisualizerEnabled} />
            </div>

            {visualizerEnabled && (
              <div className="pt-2 animate-fade-in">
                <label className="block text-sm font-semibold text-text-primary mb-1.5">Enlace de YouTube (Video o Playlist)</label>
                <input
                  type="text"
                  value={visualizerUrl}
                  onChange={(e) => setVisualizerUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... o &list=..."
                  className="input-field w-full text-sm font-mono placeholder:font-sans"
                />
                <p className="text-[10px] text-text-muted mt-1.5">
                  Si usas un enlace de playlist, pon el enlace que contenga <code>&list=</code>. envAIro la reproducirá en bucle.
                </p>
              </div>
            )}
          </div>
        </section>

      )}

      {activeTab === 'custom' && (
        <div className="space-y-6 animate-fade-in">
          {/* EnvAIro Selector (IA) */}
          <section className="card p-5 space-y-4 border border-accent/20">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Sparkles size={16} className="text-accent shrink-0" />
              <h2 className="font-bold text-text-primary shrink-0">{t('settings.envairo_title')}</h2>
            </div>

            <p className="text-xs text-text-muted mb-2">{t('settings.envairo_desc')}</p>

            <div className="pt-2">
              <label className="block text-sm font-semibold text-text-primary mb-1.5">{t('settings.envairo_prompt_label')}</label>
              <textarea
                value={enairoPrompt}
                onChange={(e) => setEnairoPrompt(e.target.value)}
                placeholder={t('settings.envairo_prompt_placeholder')}
                className="input-field w-full h-24 resize-none"
              />
            </div>

            <div className="pt-2">
              <label className="block text-sm font-semibold text-text-primary mb-1.5">Cantidad de sugerencias a generar</label>
              <p className="text-xs text-text-muted mb-2">Máximo 50 canciones por generación.</p>
              <input
                type="number"
                min="1"
                max="50"
                value={store.enairoTrackCount}
                onChange={(e) => store.setEnairoTrackCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 35)))}
                className="input-field w-full sm:w-24 text-center"
              />
            </div>

            <div className="border-t border-white/5 pt-4">
              <Toggle
                checked={enairoTestMode}
                onChange={setEnairoTestMode}
                label={t('settings.envairo_test_label')}
                description={t('settings.envairo_test_desc')}
              />
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
                    onChange={(e) => setCooldownMinutes(Math.min(120, Math.max(1, parseInt(e.target.value) || 10)))}
                    className="input-field w-24 text-center"
                  />
                </div>
              )}
            </div>

            <div className="border-t border-white/5 pt-4">
              <Toggle
                checked={explicitFilter}
                onChange={setExplicitFilter}
                label={t('settings.explicit_filter_title')}
                description={t('settings.explicit_filter_desc')}
              />
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
                  onChange={(e) => setRequestsPerHour(Math.min(100, Math.max(1, parseInt(e.target.value) || 15)))}
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
                  onChange={(e) => setRequestsPerGuest(Math.min(20, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="input-field w-full sm:w-24 text-center"
                />
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
                  onChange={(e) => setTableCount(Math.min(50, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="input-field w-full sm:w-24 text-center"
                />
              </div>
            </div>
          </section>

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

      {showGenreGuide && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-bg-elevated w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[85vh]">
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
                  <p><strong>Reggaeton:</strong> incluye Urbano latino, Música latina, Latin urban.</p>
                  <p><strong>Trap Latino:</strong> incluye Trap, Urbano latino, Reggaeton.</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">{t('settings.guide_modal_pop')}</h4>
                  <p><strong>Pop:</strong> incluye Pop latino, Latin pop, Indie pop.</p>
                  <p><strong>Rock:</strong> incluye Rock latino, Latin rock, Hard rock, Indie rock, Metal, Punk.</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">{t('settings.guide_modal_electro')}</h4>
                  <p><strong>Electrónica:</strong> incluye Dance, House, Techno, EDM, Trance, Dubstep.</p>
                  <p><strong>Lofi:</strong> incluye Chill, Ambient.</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">{t('settings.guide_modal_tropical')}</h4>
                  <p><strong>Tropical:</strong> incluye Salsa, Bachata, Merengue, Cumbia, Latino.</p>
                  <p><strong>Reggae:</strong> incluye Dancehall, Ska.</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">{t('settings.guide_modal_regional')}</h4>
                  <p><strong>Regional Mexicano:</strong> incluye Banda, Norteño, Mariachi, Corridos, Corridos Tumbados, Ranchera.</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">{t('settings.guide_modal_other')}</h4>
                  <p><strong>Hip-Hop / Rap:</strong> incluye R&B, Trap.</p>
                  <p><strong>Folk:</strong> incluye Acústico, Cantautor, Country.</p>
                  <p><strong>Soundtrack:</strong> incluye Banda sonora, OST, Cine.</p>
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
        </div>
      )}
    </div>
  );
}
