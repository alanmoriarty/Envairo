import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2, XCircle, GripVertical, Trash2,
  Users, Store, Sparkles, Music2, Clock, ListMusic, QrCode, ClipboardList
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  MouseSensor,
  TouchSensor,
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
import { useAuthStore } from '../store/useAuthStore';
import { useSpotifySDK } from '../hooks/useSpotifySDK';
import { QRCard } from '../components/qr/QRCard';
import { Toggle } from '../components/ui/Toggle';
import { PlaylistsPanel } from '../components/dashboard/PlaylistsPanel';
import { supabase } from '../lib/supabase';
import { useEnairoSelector } from '../hooks/useEnairoSelector';

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
        <img src={track.image || 'https://ui-avatars.com/api/?name=Music&background=222&color=fff'} 
             onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=Music&background=222&color=fff' }}
             alt="" 
             className="w-10 h-10 rounded-lg object-cover flex-shrink-0" 
             draggable={false} />
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
        className="flex gap-1 flex-shrink-0"
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
  const { 
    mode, setMode, autoDJ, setAutoDJ,
    enairoEnabled, setEnairoEnabled,
    showRequests, setShowRequests,
    showQR, setShowQR,
    showPlaylists, setShowPlaylists
  } = useSettingsStore();

  const {
    queue, currentQueueIndex, pendingRequests,
    reorderQueue, removeFromQueue, approveRequest, rejectRequest,
    currentTrack, sdkReady,
  } = usePlayerStore();
  const { controls } = useSpotifySDK();
  
  const { isThinking: enairoIsThinking } = useEnairoSelector();

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // Requiere mover el mouse 8px para iniciar el drag, previniendo clicks accidentales
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // En móvil, requiere presionar por 250ms antes de arrastrar
        tolerance: 5, // Permite 5px de movimiento durante la espera sin cancelar
      },
    })
  );

  React.useEffect(() => {
    const authStore = useAuthStore.getState();
    const sessionId = authStore.user?.id || useSettingsStore.getState().sessionId;
    const { mode, blacklistGenres, blacklistSongs, blacklistArtists, allowRepeats, requestsPerHour, requestsPerGuest, cooldownEnabled, cooldownMinutes, tableCount } = useSettingsStore.getState();
    const { queue, currentQueueIndex, volume, activeDeviceId } = usePlayerStore.getState();
    
    const syncSession = async () => {
      const { data } = await supabase.from('sessions').select('id').eq('id', sessionId).single();
      if (data) {
        await supabase.from('sessions').update({
          active: true,
          mode,
          blacklist_genres: blacklistGenres,
          blacklist_songs: blacklistSongs,
          blacklist_artists: blacklistArtists,
          allow_repeats: allowRepeats,
          cooldown_enabled: cooldownEnabled,
          cooldown_minutes: cooldownMinutes,
          table_count: tableCount,
          requests_per_hour: requestsPerHour,
          requests_per_guest: requestsPerGuest,
          updated_at: new Date().toISOString()
        }).eq('id', sessionId);
      } else {
        await supabase.from('sessions').insert({
          id: sessionId,
          active: true,
          mode,
          blacklist_genres: blacklistGenres,
          blacklist_songs: blacklistSongs,
          blacklist_artists: blacklistArtists,
          allow_repeats: allowRepeats,
          cooldown_enabled: cooldownEnabled,
          cooldown_minutes: cooldownMinutes,
          table_count: tableCount,
          requests_per_hour: requestsPerHour,
          requests_per_guest: requestsPerGuest,
          queue: queue || [],
          current_queue_index: currentQueueIndex ?? -1,
          volume: volume ?? 70,
          active_device_id: activeDeviceId,
          updated_at: new Date().toISOString()
        });
      }
    };
    syncSession();

    // Listen for new requests
    const channel = supabase
      .channel(`requests-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests', filter: `session_id=eq.${sessionId}` }, async (payload) => {
        const newReq = payload.new;
        const store = usePlayerStore.getState();
        const settings = useSettingsStore.getState();

        store.addPendingRequest({
          reqId: newReq.id,
          track: newReq.track,
          requester: newReq.requester,
          timestamp: newReq.created_at
        });

        if (settings.autoDJ) {
          try {
            const { evaluateTrack } = await import('../lib/autoDJ');
            const result = await evaluateTrack(newReq.track, settings);
            
            if (result.approved === true) {
              store.approveRequest(newReq.id);
              toast.success(`Auto DJ aprobó la petición de ${newReq.requester}`);
              await supabase.from('requests').update({ status: 'approved' }).eq('id', newReq.id);
            } else if (result.approved === false) {
              store.rejectRequest(newReq.id);
              toast.error(`Auto DJ rechazó la petición de ${newReq.requester} (${result.reason})`);
              await supabase.from('requests').update({ status: 'rejected' }).eq('id', newReq.id);
            } else {
              // Manual review needed
              toast.info(`Auto DJ requiere revisión manual para la petición de ${newReq.requester} (${result.reason || 'Sin etiquetas claras'})`);
            }
          } catch (err) {
            console.error('Error evaluating track in Auto DJ', err);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.from('sessions').update({ active: false }).eq('id', sessionId);
    };
  }, []);

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = queue.findIndex((t) => t.queueId === active.id);
    const newIdx = queue.findIndex((t) => t.queueId === over.id);
    reorderQueue(oldIdx, newIdx);
  };

  const handleApprove = async (reqId, trackName) => {
    approveRequest(reqId);
    toast.success(`"${trackName}" añadida a la playlist`);
    await supabase.from('requests').update({ status: 'approved' }).eq('id', reqId);
    
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

  const handleReject = async (reqId, trackName) => {
    rejectRequest(reqId);
    toast.error(`"${trackName}" rechazada`);
    await supabase.from('requests').update({ status: 'rejected' }).eq('id', reqId);
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
    <div className="p-4 sm:p-6 space-y-6 flex flex-col flex-1 min-h-0">
      {/* Header toggles */}
      <div className="flex flex-wrap items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-text-muted text-sm mt-0.5 flex items-center gap-3">
            <span>
              {sdkReady ? (
                <span className="text-success">● SDK conectado</span>
              ) : (
                <span className="text-warning">● Esperando reproductor...</span>
              )}
            </span>
            {enairoIsThinking && (
              <span className="text-accent flex items-center gap-1 animate-pulse">
                <Sparkles size={14} /> EnvAIro pensando...
              </span>
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
          <div className="card px-4 py-3 flex flex-wrap items-center gap-y-4 gap-x-3 lg:gap-4">
            <div className="flex items-center gap-2">
              <span className="w-24 sm:w-auto text-sm font-medium text-text-primary flex items-center gap-1"><ClipboardList size={14} className="text-accent" /> Peticiones</span>
              <Toggle checked={showRequests} onChange={setShowRequests} />
            </div>
            <div className="hidden sm:block w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="w-24 sm:w-auto text-sm font-medium text-text-primary flex items-center gap-1"><QrCode size={14} className="text-accent" /> QR</span>
              <Toggle checked={showQR} onChange={setShowQR} />
            </div>
            <div className="hidden sm:block w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="w-24 sm:w-auto text-sm font-medium text-text-primary flex items-center gap-1"><ListMusic size={14} className="text-accent" /> Playlists</span>
              <Toggle checked={showPlaylists} onChange={setShowPlaylists} />
            </div>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className={`flex-1 grid grid-cols-1 gap-6 ${(!showRequests && !showQR && !showPlaylists) ? 'lg:grid-cols-1' : 'lg:grid-cols-3'} min-h-0`}>
        {/* Left Column: Modules */}
        {(showRequests || showQR || showPlaylists) && (
          <div className="lg:col-span-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar min-h-0">
            
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
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className={autoDJ ? 'text-accent' : 'text-text-muted'} />
                    <span className="text-xs font-medium text-text-muted">Auto-DJ</span>
                    <Toggle checked={autoDJ} onChange={setAutoDJ} />
                  </div>
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
                            <img src={req.track.image || 'https://ui-avatars.com/api/?name=Music&background=222&color=fff'} 
                                 onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=Music&background=222&color=fff' }}
                                 alt="" 
                                 className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
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
        <div className={`flex flex-col min-h-0 h-[400px] lg:h-full ${(!showRequests && !showQR && !showPlaylists) ? "lg:col-span-1" : "lg:col-span-2"}`}>
          <div className="card p-5 flex flex-col h-full overflow-hidden min-h-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
              <div className="flex flex-wrap items-center justify-between w-full">
                <div className="flex items-center gap-2 mb-1 sm:mb-0">
                  <h2 className="font-bold text-text-primary flex items-center gap-2">
                    <Music2 size={16} className="text-accent" />
                    Playlist Activa
                  </h2>
                  <span className="badge bg-bg-elevated text-text-muted">{queue.length}</span>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-black/20 px-2 py-1 rounded-lg border border-white/5">
                    <Sparkles size={14} className={enairoEnabled ? 'text-accent' : 'text-text-muted'} />
                    <span className="text-xs font-medium text-text-muted" title="EnvAIro Selector (Inteligencia Artificial)">EnvAIro</span>
                    <Toggle checked={enairoEnabled} onChange={setEnairoEnabled} />
                  </div>
                  
                  {queue.length > 0 && (
                    <button
                      onClick={() => usePlayerStore.getState().clearQueue()}
                      className="text-xs px-2 py-1 bg-bg-card border border-white/5 hover:bg-danger/20 hover:text-danger rounded-md transition-all text-text-muted"
                    >
                      Vaciar
                    </button>
                  )}
                </div>
              </div>
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
