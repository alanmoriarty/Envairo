import React from 'react';
import { Settings, Clock, Shield, Filter, List, Ban } from 'lucide-react';
import { Toggle } from '../components/ui/Toggle';
import { TagInput } from '../components/ui/TagInput';
import { ArtistTagInput } from '../components/ui/ArtistTagInput';
import { SongTagInput } from '../components/ui/SongTagInput';
import { useSettingsStore } from '../store/useSettingsStore';

const COMMON_GENRES = [
  "Alternativo", "Anime", "Blues", "Clásica", "Country", "Dance", 
  "Electrónica", "Hip-Hop", "Rap", "Jazz", "K-Pop", "Latino", 
  "Pop", "Pop Latino", "R&B", "Soul", "Reggae", "Rock", 
  "Rock Latino", "Reggaeton", "Regional Mexicano", "Salsa", 
  "Tropical", "Urbano latino", "Banda", "Cumbia", "Merengue", 
  "Bachata", "Vallenato", "Indie"
];

export default function SettingsPage() {
  const {
    alwaysAvailable, setAlwaysAvailable,
    startTime, setStartTime,
    endTime, setEndTime,
    allowRepeats, setAllowRepeats,
    cooldownEnabled, setCooldownEnabled,
    cooldownMinutes, setCooldownMinutes,
    explicitFilter, setExplicitFilter,
    requestsPerHour, setRequestsPerHour,
    requestsPerGuest, setRequestsPerGuest,
    tableCount, setTableCount,
    whitelistGenres, addWhitelistGenre, removeWhitelistGenre,
    blacklistGenres, addBlacklistGenre, removeBlacklistGenre,
    blacklistSongs, addBlacklistSong, removeBlacklistSong,
    blacklistArtists, addBlacklistArtist, removeBlacklistArtist,
  } = useSettingsStore();

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Settings size={22} className="text-accent" /> Configuración
        </h1>
        <p className="text-text-muted text-sm mt-1">Personaliza las reglas de tu sesión</p>
      </div>

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

        <Toggle
          checked={allowRepeats}
          onChange={setAllowRepeats}
          label="Permitir repeticiones"
          description="Los invitados pueden pedir canciones que ya estuvieron en cola"
        />

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
      <section className="card p-5 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Filter size={16} className="text-accent" />
          <h2 className="font-bold text-text-primary">Filtros Avanzados de Género</h2>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <List size={14} className="text-success" />
            <label className="text-sm font-semibold text-success">Lista Blanca de Géneros</label>
          </div>
          <p className="text-xs text-text-muted mb-2">Solo se permitirán canciones de estos géneros (deja vacío para no filtrar)</p>
          <TagInput
            tags={whitelistGenres}
            onAdd={addWhitelistGenre}
            onRemove={removeWhitelistGenre}
            placeholder="Ej: pop, reggaeton, rock..."
            suggestions={COMMON_GENRES}
          />
        </div>

        <div className="border-t border-white/5 pt-4">
          <div className="flex items-center gap-2 mb-2">
            <Ban size={14} className="text-danger" />
            <label className="text-sm font-semibold text-danger">Lista Negra de Géneros</label>
          </div>
          <p className="text-xs text-text-muted mb-2">Las canciones de estos géneros serán bloqueadas automáticamente</p>
          <TagInput
            tags={blacklistGenres}
            onAdd={addBlacklistGenre}
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
          <div className="flex items-center gap-2 mb-2">
            <Ban size={14} className="text-danger" />
            <label className="text-sm font-semibold text-danger">Lista Negra de Canciones</label>
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
          <div className="flex items-center gap-2 mb-2">
            <Ban size={14} className="text-danger" />
            <label className="text-sm font-semibold text-danger">Lista Negra de Artistas</label>
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
    </div>
  );
}
