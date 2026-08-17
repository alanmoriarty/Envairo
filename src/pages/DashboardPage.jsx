import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2, XCircle, GripVertical, Trash2, X,
  Users, Store, Sparkles, Music2, Clock, ListMusic, QrCode, ClipboardList,
  SkipBack, Pause, Play, SkipForward, Plus, Maximize2, Palette, Mic2, Type, RotateCcw, Monitor,
  Volume2, VolumeX
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
import { sanitizePrompt, MAX_PROMPT_LENGTH } from '../utils/security';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { sendRemotePlaybackCommand, sendRemoteQueueUpdate } from '../lib/remoteSyncChannel';

import { QRCard } from '../components/qr/QRCard';
import { Toggle } from '../components/ui/Toggle';
import { PlaylistsPanel } from '../components/dashboard/PlaylistsPanel';
import { AddSongModal } from '../components/dashboard/AddSongModal';
import { CastToTvModal } from '../components/dashboard/CastToTvModal';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../store/useLanguageStore';
import { useEnairoSelector } from '../hooks/useEnairoSelector';
import { isAllowedEmail } from '../utils/constants';

const formatArtists = (artists) => {
  if (typeof artists === 'string') return artists;
  if (Array.isArray(artists)) return artists.map(a => a.name || a).join(', ');
  if (typeof artists === 'object' && artists !== null && artists.name) return artists.name;
  return 'Artista Desconocido';
};

const SortableQueueItem = React.memo(function SortableQueueItem({ track, onRemove, onPlay, isPlaying, isPlayed }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.queueId,
  });

  const { isAdminMode } = useSettingsStore();

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
      className={`flex items-center gap-3 p-3 rounded-xl bg-bg-elevated border transition-all group cursor-grab active:cursor-grabbing ${isPlaying ? 'border-accent shadow-glow-sm' : 'border-white/5 hover:border-accent/20'
        }`}
      {...attributes}
      {...listeners}
    >
      <div className="text-text-subtle p-1 hidden sm:block">
        <GripVertical size={16} />
      </div>

      {track.image ? (
        <img src={track.image || 'https://ui-avatars.com/api/?name=Music&background=222&color=fff'}
          onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=Music&background=222&color=fff' }}
          alt=""
          loading="lazy"
          decoding="async"
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
          {formatArtists(track.artists)}
          {track.requestedBy && (
            <span className="ml-2 text-accent">• {t('dashboard.requested_by')} {track.requestedBy}</span>
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
          className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent/20"
        >
          <Play size={14} />
        </button>
        <button
          onClick={() => onRemove(track.queueId)}
          className="p-1.5 rounded-lg hover:bg-danger/20 hover:text-danger text-text-muted transition-all"
          title={t('common.cancel')}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
});

export default function DashboardPage() {
  // Granular selectors: each hook only re-renders when ITS specific slice changes.
  // Without this, every setProgress() call (1/sec) re-renders the entire Dashboard.
  const mode = useSettingsStore(s => s.mode);
  const setMode = useSettingsStore(s => s.setMode);
  const autoDJ = useSettingsStore(s => s.autoDJ);
  const setAutoDJ = useSettingsStore(s => s.setAutoDJ);
  const enairoUsageCount = useSettingsStore(s => s.enairoUsageCount);
  const enairoCooldownUntil = useSettingsStore(s => s.enairoCooldownUntil);
  const showRequests = useSettingsStore(s => s.showRequests);
  const setShowRequests = useSettingsStore(s => s.setShowRequests);
  const showPlaylists = useSettingsStore(s => s.showPlaylists);
  const setShowPlaylists = useSettingsStore(s => s.setShowPlaylists);
  const visualizerEnabled = useSettingsStore(s => s.visualizerEnabled);
  const karaokeEnabled = useSettingsStore(s => s.karaokeEnabled);
  const setKaraokeEnabled = useSettingsStore(s => s.setKaraokeEnabled);
  const lyricsEnabled = useSettingsStore(s => s.lyricsEnabled);
  const setLyricsEnabled = useSettingsStore(s => s.setLyricsEnabled);
  const isAdminMode = useSettingsStore(s => s.isAdminMode);
  const sessionId = useSettingsStore(s => s.sessionId);
  const hostSecret = useSettingsStore(s => s.hostSecret);

  const queue = usePlayerStore(s => s.queue);
  const currentQueueIndex = usePlayerStore(s => s.currentQueueIndex);
  const pendingRequests = usePlayerStore(s => s.pendingRequests);
  const reorderQueue = usePlayerStore(s => s.reorderQueue);
  const removeFromQueue = usePlayerStore(s => s.removeFromQueue);
  const approveRequest = usePlayerStore(s => s.approveRequest);
  const rejectRequest = usePlayerStore(s => s.rejectRequest);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const sdkReady = usePlayerStore(s => s.sdkReady);
  const playbackEngine = usePlayerStore(s => s.playbackEngine);
  const volume = usePlayerStore(s => s.volume);
  const setVolume = usePlayerStore(s => s.setVolume);

  const { isThinking, triggerEnairo } = useEnairoSelector();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoteVolume, setShowRemoteVolume] = useState(false);
  const remoteVolumeRef = React.useRef(null);
  const [isCastModalOpen, setIsCastModalOpen] = useState(false);
  const [isEnairoModalOpen, setIsEnairoModalOpen] = useState(false);
  const [isAutoDjModalOpen, setIsAutoDjModalOpen] = useState(false);
  const [localTime, setLocalTime] = useState(Date.now());
  const { t } = useTranslation();

  const {
    alwaysAvailable, setAlwaysAvailable,
    enairoPrompt, setEnairoPrompt,
    autoDjPrompt, setAutoDjPrompt,
    enairoTrackCount, setEnairoTrackCount,
    enairoTestMode, setEnairoTestMode,
    enairoAutoIntervalEnabled, setEnairoAutoIntervalEnabled,
    explicitFilter, setExplicitFilter,
    partyRequestOffset, setPartyRequestOffset
  } = useSettingsStore();

  const { user } = useAuthStore.getState();
  const canSeeTestMode = isAllowedEmail(user?.email);

  useEffect(() => {
    const timer = setInterval(() => setLocalTime(Date.now()), 60000); // update every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (remoteVolumeRef.current && !remoteVolumeRef.current.contains(e.target)) {
        setShowRemoteVolume(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

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

  // Guard to skip karaoke/lyrics effect on initial mount
  const karaokeEffectMounted = React.useRef(false);

  // Global Spacebar listener for Play/Pause
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Prevent if user is typing
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.code === 'Space') {
        e.preventDefault();
        const state = usePlayerStore.getState();
        if (state.youtubePlayer && typeof state.youtubePlayer.getPlayerState === 'function') {
          const playerState = state.youtubePlayer.getPlayerState();
          if (playerState === 1) { // 1 = Playing
            state.youtubePlayer.pauseVideo();
            usePlayerStore.setState({ isPlaying: false });
          } else {
            state.youtubePlayer.playVideo();
            usePlayerStore.setState({ isPlaying: true });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // El listener de karaoke/lyrics ha sido movido globalmente a useQueueSync.js

  // Listener y sync movidos globalmente a useQueueSync.js

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = queue.findIndex((t) => t.queueId === active.id);
    const newIdx = queue.findIndex((t) => t.queueId === over.id);
    reorderQueue(oldIdx, newIdx);

    if (isAdminMode) {
      const updatedQueue = usePlayerStore.getState().queue;
      const updatedIndex = usePlayerStore.getState().currentQueueIndex;
      sendRemoteQueueUpdate(updatedQueue, updatedIndex);
    }
  };

  const handleApprove = async (reqId, trackName) => {
    approveRequest(reqId);
    toast.success(t('dashboard.toast_added', { name: trackName }));
    const secret = useSettingsStore.getState().hostSecret;
    await supabase.rpc('manage_request', { p_request_id: reqId, p_session_id: sessionId, p_secret: secret, p_new_status: 'approved' });

    if (isAdminMode) {
      const updatedQueue = usePlayerStore.getState().queue;
      const updatedIndex = usePlayerStore.getState().currentQueueIndex;
      sendRemoteQueueUpdate(updatedQueue, updatedIndex);
    }

    // Auto-play if nothing is currently playing (only on Host)
    const state = usePlayerStore.getState();
    if (!isAdminMode && !state.currentTrack && state.queue.length > 0 && sdkReady) {
      const nextTrack = usePlayerStore.getState().shiftQueue();
      if (nextTrack) {
        usePlayerStore.getState().playEngineTrack(nextTrack);
        toast.success(t('dashboard.toast_playing_auto', { name: nextTrack.name }));
      }
    }
  };

  const handleReject = async (reqId, trackName) => {
    rejectRequest(reqId);
    toast.error(t('dashboard.toast_rejected'));
    const secret = useSettingsStore.getState().hostSecret;
    await supabase.rpc('manage_request', { p_request_id: reqId, p_session_id: sessionId, p_secret: secret, p_new_status: 'rejected' });
  };

  const handlePlayNow = async (track) => {
    const store = usePlayerStore.getState();
    if (!store.checkSkipSpam()) return;
    if (!store.canSwitchTrack()) {
      toast.info('Espera un momento antes de volver a cambiar de canción.', { icon: '⏳' });
      return;
    }
    store.recordTrackSwitch();

    const isAdminMode = useSettingsStore.getState().isAdminMode;
    if ((sdkReady || isAdminMode) && track.uri) {
      if (isAdminMode) {
        store.playTrackFromQueue(track.queueId);
        sendRemotePlaybackCommand('play_specific', { queueId: track.queueId });
      } else {
        store.playTrackFromQueue(track.queueId);
        store.playEngineTrack(track);
      }
      toast.success(t('dashboard.toast_playing', { name: track.name }));
    }
  };

  const handleRemoveQueue = (queueId) => {
    removeFromQueue(queueId);
    toast.success(t('dashboard.toast_removed'));

    if (isAdminMode) {
      const updatedQueue = usePlayerStore.getState().queue;
      const updatedIndex = usePlayerStore.getState().currentQueueIndex;
      sendRemoteQueueUpdate(updatedQueue, updatedIndex);
    }
  };

  const volumeDebounce = React.useRef(null);
  const previousVolume = React.useRef(volume || 100);

  const handleRemoteVolumeChange = (e) => {
    const vol = parseInt(e.target.value, 10);
    if (vol > 0) previousVolume.current = vol;
    setVolume(vol); // Actualiza la UI local del remote para fluidez

    clearTimeout(volumeDebounce.current);
    volumeDebounce.current = setTimeout(() => {
      sendRemotePlaybackCommand('set_volume', { value: vol });
    }, 150);
  };

  const toggleRemoteMute = () => {
    if (volume > 0) {
      previousVolume.current = volume;
      handleRemoteVolumeChange({ target: { value: 0 } });
    } else {
      handleRemoteVolumeChange({ target: { value: previousVolume.current || 100 } });
    }
  };

  return (
    <div className={`absolute inset-0 p-3.5 sm:p-6 space-y-4 sm:space-y-6 flex flex-col lg:overflow-hidden overflow-y-auto custom-scrollbar ${isAdminMode ? 'pb-32 sm:pb-36 lg:pb-28' : 'pb-24 sm:pb-28 lg:pb-6'}`}>
      {/* Header toggles */}
      <div className="flex flex-wrap items-center justify-between gap-4 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">{t('dashboard.title')}</h1>
            {(playbackEngine === 'youtube' || visualizerEnabled) && (
              <button
                disabled={!currentTrack}
                onClick={() => {
                  const targetId = visualizerEnabled ? 'visualizer-wrapper' : 'youtube-wrapper';
                  const wrapper = document.getElementById(targetId);
                  if (wrapper) {
                    if (!document.fullscreenElement) {
                      wrapper.requestFullscreen().catch(() => { });
                    } else {
                      document.exitFullscreen();
                    }
                  }
                }}
                className="p-1.5 text-text-muted hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/5 disabled:hover:text-text-muted"
                title={t('dashboard.fullscreen_video')}
              >
                <Maximize2 size={18} />
              </button>
            )}
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsCastModalOpen(true); console.log("Abriendo Modal Cast"); }}
              className="p-1.5 text-text-muted hover:text-accent bg-white/5 hover:bg-accent/20 rounded-lg transition-colors"
              title={t('dashboard.cast_tv')}
            >
              <Monitor size={18} />
            </button>
          </div>
          <p className="text-text-muted text-sm mt-0.5 flex items-center gap-3">
            <span>
              {isAdminMode ? (
                <span className="text-success">● {t('dashboard.connected_host')}</span>
              ) : sdkReady ? (
                <span className="text-success">● {t('dashboard.sdk_connected')}</span>
              ) : (
                <span className="text-warning">● {t('dashboard.waiting_player')}</span>
              )}
            </span>
            {isThinking && (
              <span className="text-accent flex items-center gap-1 animate-pulse">
                <Sparkles size={14} /> {t('dashboard.envairo_thinking')}
              </span>
            )}
          </p>
        </div>

        {/* Controls Bar: Horizontal Scrollable Segmented Pills */}
        <div className="w-full sm:w-auto overflow-x-auto no-scrollbar pb-1 -mx-1 px-1 flex items-center gap-2.5 flex-nowrap sm:flex-wrap">
          {/* Grupo 1: Modo (Fiesta / Comercial) */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 shrink-0 shadow-sm">
            <button
              onClick={() => setMode('party')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === 'party' ? 'bg-accent text-white shadow-glow-sm' : 'text-text-muted hover:text-white'
                }`}
            >
              <Users size={14} />
              <span>{t('dashboard.mode_party')}</span>
            </button>
            <div className="w-px h-4 bg-white/10 mx-0.5" />
            <button
              onClick={() => setMode('commercial')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === 'commercial' ? 'bg-accent text-white shadow-glow-sm' : 'text-text-muted hover:text-white'
                }`}
            >
              <Store size={14} />
              <span>{t('dashboard.mode_commercial')}</span>
            </button>
          </div>

          {/* Grupo 2: Paneles (Peticiones / Playlists) */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 shrink-0 shadow-sm">
            <button
              onClick={() => setShowRequests(!showRequests)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showRequests ? 'bg-accent text-white shadow-glow-sm' : 'text-text-muted hover:text-white'
                }`}
              title={t('dashboard.toggle_requests')}
            >
              <ClipboardList size={14} />
              <span>{t('dashboard.toggle_requests')}</span>
            </button>

            {(() => {
              const engine = usePlayerStore.getState().playbackEngine;
              if (engine === 'spotify' || engine === 'youtube') {
                return (
                  <>
                    <div className="w-px h-4 bg-white/10 mx-0.5" />
                    <button
                      onClick={() => setShowPlaylists(!showPlaylists)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showPlaylists ? 'bg-accent text-white shadow-glow-sm' : 'text-text-muted hover:text-white'
                        }`}
                      title={t('dashboard.toggle_playlists')}
                    >
                      <ListMusic size={14} />
                      <span>{t('dashboard.toggle_playlists')}</span>
                    </button>
                  </>
                );
              }
              return null;
            })()}
          </div>

          {/* Grupo 3: Karaoke / Lyrics (Motor YouTube) */}
          {playbackEngine === 'youtube' && (
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 shrink-0 shadow-sm">
              <button
                onClick={() => {
                  const store = usePlayerStore.getState();
                  if (!store.canSwitchMode()) {
                    toast.info('Espera un momento antes de volver a cambiar de modo.', { icon: '⏳' });
                    return;
                  }
                  store.recordModeSwitch();

                  const newValue = !karaokeEnabled;
                  setKaraokeEnabled(newValue);
                  if (isAdminMode) {
                    sendRemotePlaybackCommand('toggle_karaoke', { value: newValue });
                  } else {
                    const currentTrack = store.currentTrack;
                    const progress = store.progress;
                    if (currentTrack) {
                      const newMode = newValue ? 'karaoke' : lyricsEnabled ? 'lyrics' : 'normal';
                      store.playEngineTrack(currentTrack, progress, newMode);
                    }
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${karaokeEnabled ? 'bg-pink-500 text-white shadow-glow-sm' : 'text-text-muted hover:text-white'
                  }`}
                title="Karaoke"
              >
                <Mic2 size={14} />
                <span>Karaoke</span>
              </button>

              <div className="w-px h-4 bg-white/10 mx-0.5" />

              <button
                onClick={() => {
                  const store = usePlayerStore.getState();
                  if (!store.canSwitchMode()) {
                    toast.info('Espera un momento antes de volver a cambiar de modo.', { icon: '⏳' });
                    return;
                  }
                  store.recordModeSwitch();

                  const newValue = !lyricsEnabled;
                  setLyricsEnabled(newValue);
                  if (isAdminMode) {
                    sendRemotePlaybackCommand('toggle_lyrics', { value: newValue });
                  } else {
                    const currentTrack = store.currentTrack;
                    const progress = store.progress;
                    if (currentTrack) {
                      const newMode = newValue ? 'lyrics' : karaokeEnabled ? 'karaoke' : 'normal';
                      store.playEngineTrack(currentTrack, progress, newMode);
                    }
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${lyricsEnabled ? 'bg-sky-500 text-white shadow-glow-sm' : 'text-text-muted hover:text-white'
                  }`}
                title="Lyrics"
              >
                <Type size={14} />
                <span>Lyrics</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Remote Playback Controls (Mobile/Fixed Bottom) */}
      {isAdminMode && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 z-50 shrink-0 glass border-t border-white/10 p-3 flex items-center justify-center gap-6 shadow-glow-sm">
          <span className="text-xs font-semibold text-accent uppercase tracking-wider absolute left-4 hidden sm:block">{t('nav.remote')}</span>
          <button
            onClick={() => {
              sendRemotePlaybackCommand('restart');
            }}
            className="p-3 rounded-full hover:bg-white/10 text-text-primary transition-colors hidden sm:block"
            title={t('dashboard.restart_song')}
          >
            <RotateCcw size={24} />
          </button>

          <button
            onClick={() => {
              const store = usePlayerStore.getState();
              if (!store.canSwitchTrack()) {
                toast.info('Espera un momento antes de volver a cambiar de canción.', { icon: '⏳' });
                return;
              }
              store.recordTrackSwitch();
              const track = store.prevQueue();
              if (track) {
                sendRemotePlaybackCommand('play_specific', { queueId: track.queueId });
              }
            }}
            className="p-3 rounded-full hover:bg-white/10 text-text-primary transition-colors"
          >
            <SkipBack size={24} />
          </button>

          {isPlaying ? (
            <button
              onClick={() => {
                usePlayerStore.getState().setIsPlaying(false);
                sendRemotePlaybackCommand('pause');
              }}
              className="p-4 rounded-full bg-accent hover:bg-accent-hover text-white transition-colors shadow-glow-sm"
            >
              <Pause size={28} />
            </button>
          ) : (
            <button
              onClick={() => {
                usePlayerStore.getState().setIsPlaying(true);
                sendRemotePlaybackCommand('play');
              }}
              className="p-4 rounded-full bg-accent hover:bg-accent-hover text-white transition-colors shadow-glow-sm"
            >
              <Play size={28} />
            </button>
          )}

          <button
            onClick={() => {
              const store = usePlayerStore.getState();
              if (!store.checkSkipSpam()) return;
              if (!store.canSwitchTrack()) {
                toast.info('Espera un momento antes de volver a cambiar de canción.', { icon: '⏳' });
                return;
              }
              store.recordTrackSwitch();
              const track = store.shiftQueue();
              if (track) {
                sendRemotePlaybackCommand('play_specific', { queueId: track.queueId });
              }
            }}
            className="p-3 rounded-full hover:bg-white/10 text-text-primary transition-colors"
          >
            <SkipForward size={24} />
          </button>

          {/* Remote Volume Control */}
          <div ref={remoteVolumeRef} className="relative group flex items-center ml-2">
            <button
              onClick={() => setShowRemoteVolume(prev => !prev)}
              className={`p-3 rounded-full hover:bg-white/10 transition-colors ${showRemoteVolume ? 'bg-white/15 text-accent' : 'text-text-primary'}`}
              title="Volumen"
            >
              {volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
            </button>
            <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 ${showRemoteVolume ? 'flex' : 'hidden'} flex-col items-center justify-center bg-bg-elevated rounded-xl border border-white/10 shadow-xl h-32 w-12 z-50 py-4`}>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={handleRemoteVolumeChange}
                className="w-24 h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full cursor-pointer -rotate-90 origin-center"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className={`flex-1 flex flex-col lg:grid ${(!showRequests && !showPlaylists) ? 'lg:grid-cols-1' : 'lg:grid-cols-3'} gap-4 sm:gap-6 min-h-0`}>
        {/* Left Column: Modules */}
        {(showRequests || showPlaylists) && (
          <div className="lg:col-span-1 space-y-4 lg:overflow-y-auto pr-2 custom-scrollbar lg:min-h-0">

            {showRequests && (
              <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h2 className="font-bold text-text-primary flex items-center gap-2">
                    <Clock size={16} className="text-accent" />
                    {t('dashboard.requests_title')}
                    {pendingRequests.length > 0 && (
                      <span className="badge bg-accent text-white">{pendingRequests.length}</span>
                    )}
                  </h2>
                  <div className="flex items-center gap-4">
                    {/* Aceptar Peticiones Button */}
                    <button
                      onClick={async () => {
                        const newVal = !alwaysAvailable;
                        setAlwaysAvailable(newVal);

                        // Force immediate sync to user_metadata to avoid race condition on refresh
                        const currentState = useSettingsStore.getState();
                        const settingsObj = {};
                        const allKeys = ['djName', 'djAvatar', 'enairoPrompt', 'enairoEnabled', 'enairoTestMode', 'whitelistGenres', 'mode', 'eventName', 'blacklistGenres', 'blacklistSongs', 'blacklistArtists', 'allowRepeats', 'repeatCooldown', 'alwaysAvailable', 'startTime', 'endTime', 'cooldownEnabled', 'cooldownMinutes', 'tableCount', 'requestsPerHour', 'requestsPerGuest', 'explicitFilter', 'partyRequestOffset'];
                        allKeys.forEach(k => { settingsObj[k] = currentState[k]; });
                        settingsObj.alwaysAvailable = newVal; // Ensure the new value is explicitly set

                        supabase.auth.updateUser({
                          data: { host_settings: JSON.stringify(settingsObj) }
                        }).catch(console.error);

                        // Sync to sessions table for guests and remotes
                        const sessionId = currentState.sessionId;
                        const hostSecret = currentState.hostSecret;
                        if (sessionId && hostSecret) {
                          await supabase.rpc('sync_host_config', {
                            p_session_id: sessionId,
                            p_secret: hostSecret,
                            p_updates: { active: newVal, updated_at: new Date().toISOString() }
                          });
                        }
                      }}
                      className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${alwaysAvailable
                        ? 'bg-success/20 text-success border border-success/50 shadow-glow-sm'
                        : 'bg-danger/20 text-danger border border-danger/50 shadow-glow-sm'
                        }`}
                      title={alwaysAvailable ? 'Cerrar Peticiones' : 'Abrir Peticiones'}
                    >
                      {alwaysAvailable ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      <span className="text-[11px] sm:text-xs">
                        {alwaysAvailable ? t('dashboard.open_requests') : t('dashboard.closed_requests')}
                      </span>
                    </button>

                    <div className="w-px h-4 bg-white/10" />

                    {/* envAIro Filter Button */}
                    <button
                      onClick={() => {
                        if (autoDJ) {
                          setAutoDJ(false);
                        } else {
                          setIsAutoDjModalOpen(true);
                        }
                      }}
                      className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${autoDJ
                        ? 'bg-accent/20 text-accent border border-accent/50 shadow-glow-sm'
                        : 'bg-white/5 text-text-muted hover:bg-white/10 hover:text-text-primary border border-white/5'
                        }`}
                      title="envAIro Filter"
                    >
                      <Sparkles size={14} className={autoDJ ? 'text-accent' : 'text-text-muted'} />
                      <span className="text-[11px] sm:text-xs">envAIro Filter</span>
                    </button>
                  </div>
                </div>

                {pendingRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <Music2 size={32} className="text-text-subtle mx-auto mb-3" />
                    <p className="text-text-muted text-sm">{t('dashboard.requests_empty')}</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-52 sm:max-h-64 lg:max-h-full overflow-y-auto pr-2 custom-scrollbar">
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
                              {req.track.artists} · {t('dashboard.requested_by')} <span className="text-accent">{req.requester}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(req.reqId, req.track.name)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-success/15 hover:bg-success/25 text-success text-sm font-semibold transition-all"
                          >
                            <CheckCircle2 size={14} /> {t('dashboard.approve')}
                          </button>
                          <button
                            onClick={() => handleReject(req.reqId, req.track.name)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-danger/15 hover:bg-danger/25 text-danger text-sm font-semibold transition-all"
                          >
                            <XCircle size={14} /> {t('dashboard.reject')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showPlaylists && <PlaylistsPanel />}
          </div>
        )}

        {/* Playlist Queue with DnD */}
        <div className={`flex flex-col flex-1 min-h-[380px] lg:h-full lg:min-h-0 ${(!showRequests && !showPlaylists) ? "lg:col-span-1" : "lg:col-span-2"}`}>
          <div className="card p-4 sm:p-5 flex flex-col flex-1 h-full overflow-hidden min-h-[380px] lg:min-h-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
              <div className="flex flex-wrap items-center justify-between w-full">
                <div className="flex items-center gap-2 mb-1 sm:mb-0">
                  <h2 className="font-bold text-text-primary flex items-center gap-2">
                    <Music2 size={16} className="text-accent" />
                    {t('dashboard.queue_title')}
                  </h2>
                  <span className="badge bg-bg-elevated text-text-muted">{queue.length}</span>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="ml-1 p-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent hover:text-white transition-colors"
                    title={t('dashboard.add_song')}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">
                    <Sparkles size={14} className={enairoCooldownUntil > localTime || enairoUsageCount >= 3 ? 'text-text-muted' : (isThinking ? 'text-accent animate-pulse' : 'text-accent')} />

                    {(!enairoTestMode && enairoUsageCount >= 3) ? (
                      <span className="text-xs font-medium text-text-muted" title={t('dashboard.daily_limit_reached')}>{t('dashboard.daily_limit')}</span>
                    ) : (!enairoTestMode && enairoCooldownUntil > localTime) ? (
                      <span className="text-xs font-medium text-text-muted">
                        {t('dashboard.available_in', { min: Math.ceil((enairoCooldownUntil - localTime) / 60000) })}
                      </span>
                    ) : (
                      <button
                        onClick={() => setIsEnairoModalOpen(true)}
                        disabled={isThinking}
                        className="text-xs font-medium text-text-primary hover:text-accent transition-colors disabled:opacity-50"
                      >
                        {isThinking ? t('dashboard.generating') : 'envAIro Selector'}
                      </button>
                    )}
                  </div>

                  {queue.length > 0 && (
                    <button
                      onClick={() => usePlayerStore.getState().clearQueue()}
                      className="text-xs px-2 py-1 bg-bg-card border border-white/5 hover:bg-danger/20 hover:text-danger rounded-md transition-all text-text-muted"
                    >
                      {t('dashboard.empty_queue_btn')}
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-text-muted">{t('dashboard.drag_reorder')}</p>
            </div>

            {queue.length === 0 ? (
              <div className="text-center py-16 m-auto">
                <Music2 size={40} className="text-text-subtle mx-auto mb-4" />
                <p className="text-text-muted">{t('dashboard.queue_empty')}</p>
                {autoDJ ? (
                  <p className="text-text-subtle text-sm mt-2">envAIro Filter {t('dashboard.queue_empty_sub')}</p>
                ) : (
                  <p className="text-text-subtle text-sm mt-2">{t('dashboard.queue_empty_sub')}</p>
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
                  <div className={`space-y-2 flex-1 overflow-y-auto pr-1.5 custom-scrollbar min-h-[280px] lg:min-h-0 ${isAdminMode ? 'pb-28 sm:pb-32 lg:pb-24' : 'pb-12 lg:pb-2'}`}>
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

      {showAddModal && <AddSongModal onClose={() => setShowAddModal(false)} />}
      <CastToTvModal isOpen={isCastModalOpen} onClose={() => setIsCastModalOpen(false)} />

      {/* EnvAIro Selector Confirmation Modal */}
      {isEnairoModalOpen && (
        <div
          className="fixed inset-0 z-[20000] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in"
          onClick={() => setIsEnairoModalOpen(false)}
        >
          <div
            className="bg-bg-elevated w-full max-w-md sm:max-w-lg rounded-2xl sm:rounded-3xl border border-white/15 shadow-2xl overflow-hidden animate-slide-up relative flex flex-col max-h-[82dvh] sm:max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Close button and safe padding */}
            <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 pr-2 min-w-0">
                <div className="p-2 sm:p-3 bg-accent/20 border border-accent/30 rounded-xl sm:rounded-2xl shrink-0">
                  <Sparkles size={20} className="text-accent animate-pulse" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-xl font-bold text-white leading-tight truncate">
                    {t('dashboard.envairo_config_title')}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-text-muted mt-0.5 leading-tight sm:leading-relaxed line-clamp-2">
                    {t('dashboard.envairo_config_desc')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEnairoModalOpen(false)}
                className="p-1.5 sm:p-2 rounded-full bg-white/5 hover:bg-white/10 text-text-muted hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="p-3.5 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0 space-y-3 sm:space-y-4 text-left">
              <div className="bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-1.5 sm:space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-accent">
                    {t('settings.envairo_prompt_label')}
                  </label>
                  <span className={`text-[11px] sm:text-xs font-mono ${enairoPrompt.length >= MAX_PROMPT_LENGTH ? 'text-danger font-bold' : 'text-text-muted'}`}>
                    {enairoPrompt.length} / {MAX_PROMPT_LENGTH}
                  </span>
                </div>
                <textarea
                  maxLength={MAX_PROMPT_LENGTH}
                  value={enairoPrompt}
                  onChange={(e) => setEnairoPrompt(sanitizePrompt(e.target.value))}
                  placeholder={t('settings.envairo_prompt_placeholder')}
                  className="input-field w-full h-20 sm:h-24 resize-none text-xs sm:text-sm leading-relaxed"
                />
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-1.5 sm:space-y-2">
                <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-accent">
                  {t('dashboard.envairo_track_count_label')}
                </label>
                <p className="text-[11px] sm:text-xs text-text-muted">{t('dashboard.envairo_track_count_sub')}</p>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={enairoTrackCount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') { setEnairoTrackCount(''); return; }
                    const n = parseInt(v, 10);
                    if (!isNaN(n)) setEnairoTrackCount(Math.min(50, Math.max(1, n)));
                  }}
                  onBlur={() => { if (enairoTrackCount === '') setEnairoTrackCount(35); }}
                  className="input-field w-full text-center font-bold text-sm sm:text-base py-1.5 sm:py-2"
                />
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2.5 sm:space-y-3">
                <Toggle
                  checked={enairoAutoIntervalEnabled}
                  onChange={setEnairoAutoIntervalEnabled}
                  label={t('dashboard.envairo_auto_label')}
                  description={t('dashboard.envairo_auto_desc')}
                />

                <div className="bg-accent/10 border border-accent/20 rounded-xl p-2.5 sm:p-3 text-xs text-text-muted flex items-start gap-2.5">
                  <Clock size={16} className="text-accent flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white text-xs sm:text-sm">{t('dashboard.envairo_auto_limit_title')}</p>
                    <p className="mt-0.5 text-text-muted text-[11px] sm:text-xs leading-relaxed">
                      {t('dashboard.envairo_auto_limit_desc')}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between text-[11px]">
                      <span className="font-mono text-accent font-semibold">{t('dashboard.envairo_auto_today')}</span>
                      <span className="font-mono font-bold text-white bg-accent/20 px-2 py-0.5 rounded-md">
                        {enairoUsageCount || 0} / 3
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {canSeeTestMode && (
                <div className="bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                  <Toggle
                    checked={enairoTestMode}
                    onChange={setEnairoTestMode}
                    label={t('settings.envairo_test_label')}
                    description={t('settings.envairo_test_desc')}
                  />
                </div>
              )}
            </div>

            {/* Sticky Action Footer */}
            <div className="p-3 sm:p-4 px-4 sm:px-6 bg-bg-card border-t border-white/10 shrink-0 flex gap-2.5 sm:gap-3 z-10">
              <button
                onClick={() => setIsEnairoModalOpen(false)}
                className="flex-1 py-2.5 px-3 sm:px-4 rounded-xl font-semibold text-xs sm:text-sm text-text-primary bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
              >
                {t('dashboard.envairo_cancel_btn')}
              </button>
              <button
                onClick={() => {
                  setIsEnairoModalOpen(false);
                  triggerEnairo();
                }}
                className="flex-1 py-2.5 px-3 sm:px-4 rounded-xl font-semibold text-xs sm:text-sm text-white bg-accent hover:bg-accent-hover transition-all shadow-glow-sm cursor-pointer"
              >
                {t('dashboard.envairo_generate_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* envAIro Filter Configuration Modal */}
      {isAutoDjModalOpen && (
        <div
          className="fixed inset-0 z-[20000] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in"
          onClick={() => {
            setIsAutoDjModalOpen(false);
            setAutoDJ(false); // cancel activation
          }}
        >
          <div
            className="bg-bg-elevated w-full max-w-md sm:max-w-lg rounded-2xl sm:rounded-3xl border border-white/15 shadow-2xl overflow-hidden animate-slide-up relative flex flex-col max-h-[82dvh] sm:max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Close button and safe padding */}
            <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 pr-2 min-w-0">
                <div className="p-2 sm:p-3 bg-accent/20 border border-accent/30 rounded-xl sm:rounded-2xl shrink-0">
                  <Sparkles size={20} className="text-accent animate-pulse" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-xl font-bold text-white leading-tight truncate">
                    {t('dashboard.filter_modal_title')}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-text-muted mt-0.5 leading-tight sm:leading-relaxed line-clamp-2">
                    {t('dashboard.filter_modal_desc')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAutoDjModalOpen(false);
                  setAutoDJ(false);
                }}
                className="p-1.5 sm:p-2 rounded-full bg-white/5 hover:bg-white/10 text-text-muted hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="p-3.5 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0 space-y-3 sm:space-y-4">
              {/* Contexto de la IA */}
              <div className="bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-1.5 sm:space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-accent">
                    {t('dashboard.filter_context_label')}
                  </label>
                  <span className={`text-[11px] sm:text-xs font-mono ${autoDjPrompt.length >= MAX_PROMPT_LENGTH ? 'text-danger font-bold' : 'text-text-muted'}`}>
                    {autoDjPrompt.length} / {MAX_PROMPT_LENGTH}
                  </span>
                </div>
                <textarea
                  maxLength={MAX_PROMPT_LENGTH}
                  value={autoDjPrompt}
                  onChange={(e) => setAutoDjPrompt(sanitizePrompt(e.target.value))}
                  placeholder={t('dashboard.filter_context_placeholder')}
                  className="input-field w-full h-16 sm:h-20 resize-none text-xs sm:text-sm leading-relaxed"
                />
                <p className="text-[10px] sm:text-[11px] text-text-muted leading-tight">
                  {t('dashboard.filter_context_hint')}
                </p>
              </div>

              {/* Filtro Explícito */}
              <div className="bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                <Toggle
                  checked={explicitFilter}
                  onChange={setExplicitFilter}
                  label={t('dashboard.filter_explicit_title')}
                  description={t('dashboard.filter_explicit_desc')}
                />
              </div>

              {/* Posición de peticiones */}
              {(() => {
                const currentOffset = (typeof partyRequestOffset === 'number' && !isNaN(partyRequestOffset) && partyRequestOffset > 0) ? partyRequestOffset : 5;
                return (
                  <div className="bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 sm:space-y-2.5">
                    <div className="flex justify-between items-center gap-2">
                      <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-accent truncate">
                        {t('dashboard.filter_offset_title')}
                      </label>
                      <span className="text-[11px] sm:text-xs font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-accent/20 text-accent border border-accent/30 font-mono shrink-0">
                        {currentOffset === 1 ? t('dashboard.filter_offset_next') : t('dashboard.filter_offset_songs', { count: currentOffset })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 sm:gap-3 pt-1">
                      <input
                        type="range"
                        min={1}
                        max={20}
                        value={currentOffset}
                        onChange={(e) => setPartyRequestOffset(e.target.value)}
                        className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
                      />
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={currentOffset}
                        onChange={(e) => setPartyRequestOffset(e.target.value)}
                        className="w-14 sm:w-16 py-1 px-1.5 text-center text-xs sm:text-sm bg-black/50 border border-white/15 rounded-xl font-bold text-white focus:border-accent outline-none"
                      />
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-text-muted leading-tight">
                      {t('dashboard.filter_offset_hint')}
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* Sticky Action Footer */}
            <div className="p-3 sm:p-4 px-4 sm:px-6 bg-bg-card border-t border-white/10 shrink-0 flex gap-2.5 sm:gap-3 z-10">
              <button
                onClick={() => {
                  setIsAutoDjModalOpen(false);
                  setAutoDJ(false); // cancel activation
                }}
                className="flex-1 py-2.5 px-3 sm:px-4 rounded-xl font-semibold text-xs sm:text-sm text-text-primary bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
              >
                {t('dashboard.filter_cancel_btn')}
              </button>
              <button
                onClick={() => {
                  setIsAutoDjModalOpen(false);
                  setAutoDJ(true);
                }}
                className="flex-1 py-2.5 px-3 sm:px-4 rounded-xl font-semibold text-xs sm:text-sm text-white bg-accent hover:bg-accent-hover transition-all shadow-glow-sm cursor-pointer"
              >
                {t('dashboard.filter_activate_btn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
