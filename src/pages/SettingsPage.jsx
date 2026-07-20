import React, { useState, useEffect } from 'react';
import { Settings, Clock, Shield, Filter, List, Ban, Info, X, Sparkles, MonitorPlay, Save } from 'lucide-react';
import { Toggle } from '../components/ui/Toggle';
import { TagInput } from '../components/ui/TagInput';
import { ArtistTagInput } from '../components/ui/ArtistTagInput';
import { SongTagInput } from '../components/ui/SongTagInput';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTranslation } from '../store/useLanguageStore';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

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
    enairoLastRunAt, enairoStartedAt,
    visualizerEnabled, setVisualizerEnabled,
    visualizerUrl, setVisualizerUrl
  } = useSettingsStore();
  const { t } = useTranslation();
  
  const COMMON_GENRES = t('settings.common_genres') || [];

  const [showGenreGuide, setShowGenreGuide] = useState(false);
  const [enairoTimeLeft, setEnairoTimeLeft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const saveSettingsToCloud = async () => {
    setIsSaving(true);
    try {
      const state = useSettingsStore.getState();
      const { sessionId, hostSecret } = state;
      
      const allKeys = ['enairoPrompt', 'enairoEnabled', 'enairoTestMode', 'whitelistGenres', 'mode', 'blacklistGenres', 'blacklistSongs', 'blacklistArtists', 'allowRepeats', 'cooldownEnabled', 'cooldownMinutes', 'tableCount', 'requestsPerHour', 'requestsPerGuest', 'explicitFilter'];
      const settingsObj = {};
      allKeys.forEach(k => { settingsObj[k] = state[k]; });
      
      await supabase.auth.updateUser({
        data: { host_settings: JSON.stringify(settingsObj) }
      });

      if (sessionId && hostSecret) {
        await supabase.rpc('update_session_state', {
          p_session_id: sessionId,
          p_secret: hostSecret,
          p_updates: {
            mode: state.mode,
            blacklist_genres: state.blacklistGenres,
            blacklist_songs: state.blacklistSongs,
            blacklist_artists: state.blacklistArtists,
            allow_repeats: state.allowRepeats,
            cooldown_enabled: state.cooldownEnabled,
            cooldown_minutes: state.cooldownMinutes,
            table_count: state.tableCount,
            requests_per_hour: state.requestsPerHour,
            requests_per_guest: state.requestsPerGuest,
            updated_at: new Date().toISOString()
          }
        });
      }
      toast.success(t('settings.save_success') || 'Cambios guardados exitosamente');
    } catch (e) {
      console.error(e);
      toast.error(t('settings.save_error') || 'Error al guardar los cambios');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!enairoEnabled) {
      setEnairoTimeLeft('');
      return;
    }
    
    const interval = setInterval(() => {
      const now = Date.now();
      const runCooldown = enairoTestMode ? 30000 : 7200000; // 2 horas
      const nextRun = enairoLastRunAt ? enairoLastRunAt + runCooldown : now;
      const activeUntil = enairoStartedAt ? enairoStartedAt + 14400000 : now; // 4 horas
      
      let text = '';
      if (now < nextRun) {
        const diff = nextRun - now;
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        text += `Próxima selección en: ${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
      } else {
        text += `Próxima selección: Lista (esperando cola)`;
      }
      
      text += ' • ';
      
      if (now < activeUntil) {
        const diff = activeUntil - now;
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        text += `Se apagará en: ${h}h ${m}m`;
      } else {
        text += `Apagado inminente`;
      }
      
      setEnairoTimeLeft(text);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [enairoEnabled, enairoLastRunAt, enairoStartedAt, enairoTestMode]);

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
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Settings size={22} className="text-accent" /> {t('settings.title')}
        </h1>
        <p className="text-text-muted text-sm mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* EnvAIro Selector (IA) */}
      <section className="card p-5 space-y-4 border border-accent/20">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} className="text-accent" />
          <h2 className="font-bold text-text-primary">{t('settings.envairo_title')}</h2>
          {enairoEnabled && enairoTimeLeft && (
            <span className="ml-auto text-xs font-semibold bg-accent/20 text-accent px-2 py-1 rounded-md animate-fade-in">
              {enairoTimeLeft}
            </span>
          )}
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

        <div className="border-t border-white/5 pt-4">
          <Toggle
            checked={enairoTestMode}
            onChange={setEnairoTestMode}
            label={t('settings.envairo_test_label')}
            description={t('settings.envairo_test_desc')}
          />
        </div>
      </section>

      {/* Visualizer Settings */}
      <section className="card p-5 space-y-4">
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
              Si usas un enlace de playlist, pon el enlace que contenga <code>&list=</code>. EnvAIro la reproducirá en bucle.
            </p>
          </div>
        )}
      </section>

      {/* Availability */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={16} className="text-accent" />
          <h2 className="font-bold text-text-primary">{t('settings.availability_title')}</h2>
        </div>

        <Toggle
          checked={alwaysAvailable}
          onChange={setAlwaysAvailable}
          label={t('settings.always_available')}
          description={t('settings.always_available_desc')}
        />

        {!alwaysAvailable && (
          <div className="grid grid-cols-2 gap-4 pt-2 animate-slide-up">
            <div>
              <label className="block text-sm text-text-muted mb-1.5">{t('settings.start_time')}</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="input-field"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1.5">{t('settings.end_time')}</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="input-field"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <p className="col-span-2 text-xs text-text-subtle bg-bg-elevated rounded-lg px-3 py-2">
              {t('settings.time_config', { start: `<span class="text-accent font-semibold">${startTime}</span>`, end: `<span class="text-accent font-semibold">${endTime}</span>` }).split('<span').map((part, i) => {
                if (i === 0) return part;
                const match = part.match(/class="([^"]+)">([^<]+)<\/span>(.*)/);
                if (match) return <React.Fragment key={i}><span className={match[1]}>{match[2]}</span>{match[3]}</React.Fragment>;
                return part;
              })}
              {endTime < startTime && t('settings.time_cross')}
            </p>
          </div>
        )}
      </section>

      {/* General filters */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={16} className="text-accent" />
          <h2 className="font-bold text-text-primary">{t('settings.filters_title')}</h2>
        </div>

        <div className="flex items-center justify-between p-1">
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
            <div className="mt-3 flex items-center justify-between gap-3 animate-slide-up pl-12">
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
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <List size={14} className="text-success" />
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
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Ban size={14} className="text-danger" />
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
          <div className="flex items-center justify-between mb-2">
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
          <div className="flex items-center justify-between mb-2">
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

      {/* Sticky Save Footer */}
      <div className="sticky bottom-0 -mx-4 lg:-mx-8 px-4 lg:px-8 py-4 bg-bg-base/90 backdrop-blur-xl border-t border-white/10 z-40 mt-8 flex justify-end shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <button
          onClick={saveSettingsToCloud}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-white font-bold text-sm hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(var(--color-accent),0.3)] disabled:opacity-50 disabled:hover:scale-100"
        >
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save size={18} />
          )}
          {t('settings.save_btn') || 'Confirmar Cambios'}
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
