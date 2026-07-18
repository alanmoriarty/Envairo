import React, { useState } from 'react';
import { Settings, Clock, Shield, Filter, List, Ban, Info, X, Sparkles } from 'lucide-react';
import { Toggle } from '../components/ui/Toggle';
import { TagInput } from '../components/ui/TagInput';
import { ArtistTagInput } from '../components/ui/ArtistTagInput';
import { SongTagInput } from '../components/ui/SongTagInput';
import { useSettingsStore } from '../store/useSettingsStore';

const COMMON_GENRES = [
  "Acústico", "Afrobeats", "Alternativo", "Ambient", "Anime", "Bachata", 
  "Banda", "Blues", "Bolero", "Cantautor", "Clásica", "Corridos", 
  "Corridos Tumbados", "Country", "Cumbia", "Dance", "Dancehall", 
  "Dubstep", "Electrónica", "Folk", "Funk", "Gospel", "Heavy Metal", 
  "Hip-Hop", "House", "Indie", "Indie Pop", "Indie Rock", "J-Pop", 
  "Jazz", "K-Pop", "Latino", "Lofi", "Mariachi", "Merengue", "Metal", 
  "Música Cristiana", "Música Infantil", "Música Mexicana", "Norteño", 
  "Pop", "Pop Latino", "Punk", "R&B", "Ranchera", "Rap", "Reggae", 
  "Reggaeton", "Regional Mexicano", "Rock", "Rock Latino", "Salsa", 
  "Ska", "Soul", "Soundtrack", "Techno", "Trance", "Trap", "Trap Latino", 
  "Tropical", "Urbano latino", "Vallenato"
];

// Mapeo de géneros relacionados para agregarlos en grupo
const GENRE_ALIASES = {
  // Urbano y Reggaeton
  "reggaeton": ["reggaeton", "urbano latino", "música latina", "latin urban", "perreo"],
  "urbano latino": ["urbano latino", "reggaeton", "música latina", "latin urban", "trap latino"],
  "trap latino": ["trap latino", "trap", "urbano latino", "reggaeton", "música latina"],
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
  "lofi": ["lofi", "lo-fi", "chill", "ambient", "electrónica"],
  
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
  } = useSettingsStore();

  const [showGenreGuide, setShowGenreGuide] = useState(false);

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
          <Settings size={22} className="text-accent" /> Configuración
        </h1>
        <p className="text-text-muted text-sm mt-1">Personaliza las reglas de tu sesión</p>
      </div>

      {/* EnvAIro Selector (IA) */}
      <section className="card p-5 space-y-4 border border-accent/20">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} className="text-accent" />
          <h2 className="font-bold text-text-primary">EnvAIro Selector (Configuración IA)</h2>
        </div>
        
        <p className="text-xs text-text-muted mb-2">EnvAIro Selector se activa desde el Dashboard. Aquí puedes darle instrucciones sobre cómo debe comportarse. Ej: "Es una boda elegante, mantén la música romántica pero bailable, evita cosas vulgares."</p>

        <div className="pt-2">
          <label className="block text-sm font-semibold text-text-primary mb-1.5">Contexto Especial / Vibra (Opcional)</label>
          <textarea
            value={enairoPrompt}
            onChange={(e) => setEnairoPrompt(e.target.value)}
            placeholder="Escribe las instrucciones para la IA..."
            className="input-field w-full h-24 resize-none"
          />
        </div>

        <div className="border-t border-white/5 pt-4">
          <Toggle
            checked={enairoTestMode}
            onChange={setEnairoTestMode}
            label="Modo Pruebas (Sin restricciones)"
            description="⚠️ Ignora el límite de 1 hora y el límite de canciones en cola. ¡Úsalo solo para probar porque gastarás tu cuota diaria rápidamente!"
          />
        </div>
      </section>

      {/* Availability */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={16} className="text-accent" />
          <h2 className="font-bold text-text-primary">Horario de Disponibilidad</h2>
        </div>

        <Toggle
          checked={alwaysAvailable}
          onChange={setAlwaysAvailable}
          label="Siempre disponible"
          description="Los invitados pueden pedir canciones en cualquier momento"
        />

        {!alwaysAvailable && (
          <div className="grid grid-cols-2 gap-4 pt-2 animate-slide-up">
            <div>
              <label className="block text-sm text-text-muted mb-1.5">Hora de inicio</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="input-field"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1.5">Hora de cierre</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="input-field"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <p className="col-span-2 text-xs text-text-subtle bg-bg-elevated rounded-lg px-3 py-2">
              Horario configurado: <span className="text-accent font-semibold">{startTime}</span> a <span className="text-accent font-semibold">{endTime}</span>
              {endTime < startTime && ' (cruza medianoche)'}
            </p>
          </div>
        )}
      </section>

      {/* General filters */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={16} className="text-accent" />
          <h2 className="font-bold text-text-primary">Filtros Generales</h2>
        </div>

        <div className="flex items-center justify-between p-1">
          <div>
            <p className="font-semibold text-text-primary text-sm">Filtro de Repeticiones</p>
            <p className="text-xs text-text-muted mt-0.5">Tiempo antes de poder pedir una canción ya sonada</p>
          </div>
          <select
            value={repeatCooldown}
            onChange={(e) => setRepeatCooldown(Number(e.target.value))}
            className="bg-bg-base border border-white/10 rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="-1">Permitir siempre</option>
            <option value="30">Bloquear 30 min</option>
            <option value="60">Bloquear 1 hora</option>
            <option value="120">Bloquear 2 horas</option>
            <option value="0">Bloquear toda la sesión</option>
          </select>
        </div>

        <div className="border-t border-white/5 pt-4">
          <Toggle
            checked={cooldownEnabled}
            onChange={setCooldownEnabled}
            label="Tiempo de espera"
            description="Requerir que los invitados esperen antes de poder pedir otra canción"
          />
          {cooldownEnabled && (
            <div className="mt-3 flex items-center justify-between gap-3 animate-slide-up pl-12">
              <div>
                <label className="text-sm font-medium text-text-primary">Minutos de espera</label>
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
            label="Filtro de contenido explícito"
            description="Bloquear automáticamente canciones marcadas como explícitas (E) en Spotify"
          />
        </div>

        <div className="border-t border-white/5 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <label className="text-sm font-semibold text-text-primary">Peticiones por hora (Global)</label>
              <p className="text-xs text-text-muted mt-0.5">Límite total de canciones que todos los invitados sumados pueden pedir en una hora</p>
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
              <label className="text-sm font-semibold text-text-primary">Límite de peticiones por invitado</label>
              <p className="text-xs text-text-muted mt-0.5">Cantidad máxima de canciones que puede pedir una misma persona (0 = Sin límite)</p>
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
              <label className="text-sm font-semibold text-text-primary">Cantidad de Mesas</label>
              <p className="text-xs text-text-muted mt-0.5">Si usas el Modo Comercial, los clientes podrán seleccionar su mesa (0 para desactivar)</p>
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
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-accent" />
            <h2 className="font-bold text-text-primary">Filtros Avanzados de Género</h2>
          </div>
          <button
            onClick={() => setShowGenreGuide(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          >
            <Info size={14} /> Guía de agrupación
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <List size={14} className="text-success" />
              <label className="text-sm font-semibold text-success">Lista Blanca de Géneros</label>
            </div>
            {whitelistGenres.length > 0 && (
              <button onClick={clearWhitelistGenres} className="text-xs text-text-muted hover:text-danger transition-colors">Vaciar</button>
            )}
          </div>
          <p className="text-xs text-text-muted mb-2">Solo se permitirán canciones de estos géneros (deja vacío para no filtrar)</p>
          <TagInput
            tags={whitelistGenres}
            onAdd={handleAddWhitelistGenre}
            onRemove={removeWhitelistGenre}
            placeholder="Ej: pop, reggaeton, rock..."
            suggestions={COMMON_GENRES}
          />
        </div>

        <div className="border-t border-white/5 pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Ban size={14} className="text-danger" />
              <label className="text-sm font-semibold text-danger">Lista Negra de Géneros</label>
            </div>
            {blacklistGenres.length > 0 && (
              <button onClick={clearBlacklistGenres} className="text-xs text-text-muted hover:text-danger transition-colors">Vaciar</button>
            )}
          </div>
          <p className="text-xs text-text-muted mb-2">Las canciones de estos géneros serán bloqueadas automáticamente</p>
          <TagInput
            tags={blacklistGenres}
            onAdd={handleAddBlacklistGenre}
            onRemove={removeBlacklistGenre}
            placeholder="Ej: trap, metal, reggaeton..."
            suggestions={COMMON_GENRES}
          />
        </div>
      </section>
      {/* Artist filters */}
      <section className="card p-5 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Filter size={16} className="text-accent" />
          <h2 className="font-bold text-text-primary">Filtros Avanzados de Artistas</h2>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Ban size={14} className="text-danger" />
              <label className="text-sm font-semibold text-danger">Lista Negra de Canciones</label>
            </div>
            {blacklistSongs.length > 0 && (
              <button onClick={clearBlacklistSongs} className="text-xs text-text-muted hover:text-danger transition-colors">Vaciar</button>
            )}
          </div>
          <p className="text-xs text-text-muted mb-2">Las canciones con estos nombres serán bloqueadas automáticamente</p>
          <SongTagInput
            tags={blacklistSongs}
            onAdd={addBlacklistSong}
            onRemove={removeBlacklistSong}
            placeholder="Ej: Despacito, Tusa, Baby..."
          />
        </div>

        <div className="border-t border-white/5 pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Ban size={14} className="text-danger" />
              <label className="text-sm font-semibold text-danger">Lista Negra de Artistas</label>
            </div>
            {blacklistArtists.length > 0 && (
              <button onClick={clearBlacklistArtists} className="text-xs text-text-muted hover:text-danger transition-colors">Vaciar</button>
            )}
          </div>
          <p className="text-xs text-text-muted mb-2">Las canciones de estos artistas serán bloqueadas automáticamente</p>
          <ArtistTagInput
            tags={blacklistArtists}
            onAdd={addBlacklistArtist}
            onRemove={removeBlacklistArtist}
            placeholder="Ej: Anuel AA, Yeri Mua..."
          />
        </div>
      </section>
      {showGenreGuide && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-bg-elevated w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-bg-elevated z-10">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <Info size={18} className="text-accent" />
                Guía de Familias de Género
              </h3>
              <button onClick={() => setShowGenreGuide(false)} className="text-text-muted hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar text-sm text-text-muted space-y-4">
              <p>
                Al seleccionar un género en los filtros, el Auto-DJ añadirá automáticamente sus variantes y subgéneros asociados para evitar que Apple Music rechace canciones por diferencias en el nombre.
              </p>
              
              <div className="space-y-3">
                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">Urbano y Reggaeton</h4>
                  <p><strong>Reggaeton:</strong> incluye Urbano latino, Música latina, Latin urban.</p>
                  <p><strong>Trap Latino:</strong> incluye Trap, Urbano latino, Reggaeton.</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">Pop y Rock</h4>
                  <p><strong>Pop:</strong> incluye Pop latino, Latin pop, Indie pop.</p>
                  <p><strong>Rock:</strong> incluye Rock latino, Latin rock, Hard rock, Indie rock, Metal, Punk.</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">Música Electrónica</h4>
                  <p><strong>Electrónica:</strong> incluye Dance, House, Techno, EDM, Trance, Dubstep.</p>
                  <p><strong>Lofi:</strong> incluye Chill, Ambient.</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">Tropical y Caribeño</h4>
                  <p><strong>Tropical:</strong> incluye Salsa, Bachata, Merengue, Cumbia, Latino.</p>
                  <p><strong>Reggae:</strong> incluye Dancehall, Ska.</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">Regional Mexicano</h4>
                  <p><strong>Regional Mexicano:</strong> incluye Banda, Norteño, Mariachi, Corridos, Corridos Tumbados, Ranchera.</p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                  <h4 className="font-semibold text-white mb-2">Otros</h4>
                  <p><strong>Hip-Hop / Rap:</strong> incluye R&B, Trap.</p>
                  <p><strong>Folk:</strong> incluye Acústico, Cantautor, Country.</p>
                  <p><strong>Soundtrack:</strong> incluye Banda sonora, OST, Cine.</p>
                </div>
              </div>

              <div className="bg-accent/10 text-accent p-3 rounded-xl border border-accent/20 mt-4">
                <strong>Tip:</strong> Si el sistema añade varios géneros hermanos y hay alguno que en específico NO deseas, simplemente haz clic en la <strong>X</strong> de su etiqueta para removerlo individualmente.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
