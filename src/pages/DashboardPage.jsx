import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2, XCircle, GripVertical, Trash2,
  Users, Store, Sparkles, Music2, Clock, ListMusic
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useSpotifySDK } from '../hooks/useSpotifySDK';
import { QRCard } from '../components/qr/QRCard';
import { Toggle } from '../components/ui/Toggle';
import { PlaylistsPanel } from '../components/dashboard/PlaylistsPanel';

function SortableQueueItem({ track, onRemove, onPlay, isPlaying, isPlayed }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.queueId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isPlayed ? 0.6 : 1,
  };

  const formatDuration = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-3 p-3 rounded-xl bg-bg-elevated border transition-all group cursor-grab active:cursor-grabbing ${
        isPlaying ? 'border-accent shadow-glow-sm' : 'border-white/5 hover:border-accent/20'
      }`}
    >
      <div className="text-text-subtle p-1">
        <GripVertical size={16} />
      </div>

      {track.image ? (
        <img src={track.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" draggable={false} />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-bg-card flex items-center justify-center flex-shrink-0">
          <Music2 size={14} className="text-text-muted" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary truncate">{track.name}</p>
        <p className="text-xs text-text-muted truncate">
          {track.artists}
          {track.requestedBy && (
            <span className="ml-2 text-accent">• {track.requestedBy}</span>
          )}
        </p>
      </div>

      <span className="text-xs text-text-subtle hidden md:block">
        {formatDuration(track.duration_ms || 0)}
      </span>

      <div 
        className="flex gap-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onPlay(track)}
          className="p-1.5 rounded-lg hover:bg-accent/20 hover:text-accent text-text-muted transition-all"
          title="Reproducir ahora"
        >
          <Music2 size={14} />
        </button>
        <button
          onClick={() => onRemove(track.queueId)}
          className="p-1.5 rounded-lg hover:bg-danger/20 hover:text-danger text-text-muted transition-all"
          title="Eliminar"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [showRequests, setShowRequests] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(true);

  const {
    queue, currentQueueIndex, pendingRequests,
    reorderQueue, removeFromQueue, approveRequest, rejectRequest,
    currentTrack, sdkReady,
  } = usePlayerStore();
  const { mode, setMode, autoDJ, setAutoDJ } = useSettingsStore();
  const { controls } = useSpotifySDK();

  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = queue.findIndex((t) => t.queueId === active.id);
    const newIdx = queue.findIndex((t) => t.queueId === over.id);
    reorderQueue(oldIdx, newIdx);
  };

  const handleApprove = async (reqId, trackName) => {
    approveRequest(reqId);
    toast.success(`"${trackName}" añadida a la playlist`);
    
    // Auto-play if nothing is currently playing
    const state = usePlayerStore.getState();
    if (!state.currentTrack && state.queue.length > 0 && sdkReady) {
      const nextTrack = usePlayerStore.getState().shiftQueue();
      if (nextTrack) {
        await controls.play([nextTrack.uri]);
        toast.success(`Reproduciendo automáticamente "${nextTrack.name}"`);
      }
    }
  };

  const handleReject = (reqId, trackName) => {
    rejectRequest(reqId);
    toast.error(`"${trackName}" rechazada`);
  };

  const handlePlayNow = async (track) => {
    if (sdkReady && track.uri) {
      usePlayerStore.getState().playTrackFromQueue(track.queueId);
      await controls.play([track.uri]);
      toast.success(`Reproduciendo "${track.name}"`);
    }
  };

  const handleRemoveQueue = (queueId) => {
    removeFromQueue(queueId);
    toast('Canción eliminada de la cola');
  };

  return (
    <div className="p-6 space-y-6 flex flex-col h-[calc(100vh-2rem)]">
      {/* Header toggles */}
      <div className="flex flex-wrap items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-text-muted text-sm mt-0.5">
            {sdkReady ? (
              <span className="text-success">● SDK conectado</span>
            ) : (
              <span className="text-warning">● Esperando reproductor...</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Mode toggle */}
          <div className="card px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setMode('party')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'party' ? 'bg-accent text-white shadow-glow-sm' : 'text-text-muted hover:text-white'
              }`}
            >
              <Users size={14} /> Fiesta
            </button>
            <div className="w-px h-4 bg-white/10" />
            <button
              onClick={() => setMode('commercial')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'commercial' ? 'bg-accent text-white shadow-glow-sm' : 'text-text-muted hover:text-white'
              }`}
            >
              <Store size={14} /> Comercial
            </button>
          </div>

          {/* Panel toggles */}
          <div className="card px-4 py-3 flex items-center gap-3 hidden xl:flex">
            <span className="text-sm font-medium text-text-primary">Peticiones</span>
            <Toggle checked={showRequests} onChange={setShowRequests} />
            <div className="w-px h-4 bg-white/10" />
            <span className="text-sm font-medium text-text-primary">QR</span>
            <Toggle checked={showQR} onChange={setShowQR} />
            <div className="w-px h-4 bg-white/10" />
            <span className="text-sm font-medium text-text-primary flex items-center gap-1"><ListMusic size={14} className="text-accent" /> Playlists</span>
            <Toggle checked={showPlaylists} onChange={setShowPlaylists} />
          </div>

          {/* Auto-DJ */}
          <div className="card px-4 py-3 flex items-center gap-3">
            <Sparkles size={16} className={autoDJ ? 'text-accent' : 'text-text-muted'} />
            <span className="text-sm font-medium text-text-primary">Auto-DJ</span>
            <Toggle checked={autoDJ} onChange={setAutoDJ} />
          </div>
        </div>
      </div>

      {/* Now playing */}
      {currentTrack && (
        <div className="card p-4 flex items-center gap-4 border border-accent/20 bg-accent/5 flex-shrink-0">
          {currentTrack.image && (
            <img src={currentTrack.image} alt="" className="w-12 h-12 rounded-xl object-cover" />
          )}
          <div>
            <p className="text-xs text-accent font-semibold uppercase tracking-wider">Reproduciendo ahora</p>
            <p className="font-bold text-text-primary">{currentTrack.name}</p>
            <p className="text-sm text-text-muted">{currentTrack.artists}</p>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className={`flex-1 grid grid-cols-1 gap-6 ${(!showRequests && !showQR && !showPlaylists) ? 'xl:grid-cols-1' : 'xl:grid-cols-3'} min-h-0`}>
        {/* Left Column: Modules */}
        {(showRequests || showQR || showPlaylists) && (
          <div className="xl:col-span-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
            
            {showRequests && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-text-primary flex items-center gap-2">
                    <Clock size={16} className="text-accent" />
                    Peticiones
                    {pendingRequests.length > 0 && (
                      <span className="badge bg-accent text-white">{pendingRequests.length}</span>
                    )}
                  </h2>
                </div>

                {pendingRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <Music2 size={32} className="text-text-subtle mx-auto mb-3" />
                    <p className="text-text-muted text-sm">Sin peticiones pendientes</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                    {pendingRequests.map((req) => (
                      <div key={req.reqId} className="p-3 bg-bg-elevated rounded-xl border border-white/5">
                        <div className="flex items-center gap-3 mb-3">
                          {req.track.image && (
                            <img src={req.track.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-text-primary truncate">{req.track.name}</p>
                            <p className="text-xs text-text-muted truncate">
                              {req.track.artists} · pedido por <span className="text-accent">{req.requester}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(req.reqId, req.track.name)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-success/15 hover:bg-success/25 text-success text-sm font-semibold transition-all"
                          >
                            <CheckCircle2 size={14} /> Aprobar
                          </button>
                          <button
                            onClick={() => handleReject(req.reqId, req.track.name)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-danger/15 hover:bg-danger/25 text-danger text-sm font-semibold transition-all"
                          >
                            <XCircle size={14} /> Rechazar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showPlaylists && <PlaylistsPanel />}

            {/* QR Card */}
            {showQR && <QRCard />}
          </div>
        )}

        {/* Playlist Queue with DnD */}
        <div className={`flex flex-col min-h-0 h-full ${(!showRequests && !showQR && !showPlaylists) ? "xl:col-span-1" : "xl:col-span-2"}`}>
          <div className="card p-5 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="font-bold text-text-primary flex items-center gap-2">
                <Music2 size={16} className="text-accent" />
                Playlist Activa
                <span className="badge bg-bg-elevated text-text-muted">{queue.length}</span>
                {queue.length > 0 && (
                  <button
                    onClick={() => usePlayerStore.getState().clearQueue()}
                    className="text-xs px-2 py-1 bg-bg-card border border-white/5 hover:bg-danger/20 hover:text-danger rounded-md transition-all text-text-muted"
                  >
                    Vaciar
                  </button>
                )}
              </h2>
              <p className="text-xs text-text-muted">Arrastra para reordenar</p>
            </div>

            {queue.length === 0 ? (
              <div className="text-center py-16 m-auto">
                <Music2 size={40} className="text-text-subtle mx-auto mb-4" />
                <p className="text-text-muted">La cola está vacía</p>
                {autoDJ && (
                  <p className="text-text-subtle text-sm mt-2">Auto-DJ añadirá canciones automáticamente</p>
                )}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={queue.map((t) => t.queueId)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {queue.map((track, index) => (
                      <SortableQueueItem
                        key={track.queueId}
                        track={track}
                        onRemove={handleRemoveQueue}
                        onPlay={handlePlayNow}
                        isPlaying={index === currentQueueIndex}
                        isPlayed={index < currentQueueIndex}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
