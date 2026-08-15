import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { Tv, Activity, Maximize, Minimize, X, Unlink, Volume2, VolumeX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../store/useLanguageStore';

function generate6DigitPin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function safeDestroyPlayer(playerRef, containerId, childId) {
  if (playerRef.current) {
    try {
      if (typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
      }
    } catch (e) {
      console.warn(`Advertencia al destruir reproductor ${childId}:`, e);
    }
    playerRef.current = null;
  }
  const container = document.getElementById(containerId);
  if (container && !document.getElementById(childId)) {
    container.innerHTML = `<div id="${childId}"></div>`;
  }
}

export default function TVDisplayPage() {
  const { t } = useTranslation();
  const channelRef = useRef(null);
  const sbSyncChannelRef = useRef(null);
  const playerRef = useRef(null);

  // Session & Pairing State
  const [sessionId, setSessionId] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paramSession = urlParams.get('session');
    if (paramSession) return paramSession;
    return localStorage.getItem('bq-tv-session-id') || null;
  });

  // Sonido en la pantalla TV (por URL ?sound=1 o enviado por el anfitrión en el pairing)
  const [tvWithSound, setTvWithSound] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('sound') === '1') return true;
    try {
      return localStorage.getItem('bq-tv-sound') === '1';
    } catch {
      return false;
    }
  });
  const tvWithSoundRef = useRef(tvWithSound);
  useEffect(() => { tvWithSoundRef.current = tvWithSound; }, [tvWithSound]);

  const [tvPin] = useState(() => {
    const saved = localStorage.getItem('bq-tv-pin');
    if (saved) return saved;
    const newPin = generate6DigitPin();
    localStorage.setItem('bq-tv-pin', newPin);
    return newPin;
  });
  const [status, setStatus] = useState(t('tv.checking_availability'));
  const [currentVideoId, setCurrentVideoId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [isCheckingLimit, setIsCheckingLimit] = useState(true);
  const [localVolume, setLocalVolume] = useState(100);
  const [localMuted, setLocalMuted] = useState(false);
  const myTvId = useRef(crypto.randomUUID ? crypto.randomUUID() : Math.random().toString());
  const activeTvs = useRef(new Set());
  const idleTimerRef = useRef(null);
  const currentVideoIdRef = useRef(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const loadingTimerRef = useRef(null);

  // 1. Escuchar canal de emparejamiento SIEMPRE (tanto para PAIRED como para UNPAIRED)
  useEffect(() => {
    const pairChannel = supabase.channel(`tv-pair-${tvPin}`);

    pairChannel
      .on('broadcast', { event: 'pairing_result' }, (e) => {
        if (e.payload?.type === 'PAIRED' && e.payload.sessionId) {
          
          // Enviar ACK al Host para confirmar que la TV existe y recibió el comando
          pairChannel.send({
            type: 'broadcast',
            event: 'pairing_ack',
            payload: { success: true }
          }).catch(()=>{});

          const newSessionId = e.payload.sessionId;
          const oldSessionId = localStorage.getItem('bq-tv-session-id');
          
          if (oldSessionId && oldSessionId !== newSessionId) {
             const oldSync = supabase.channel(`tv-sync-${oldSessionId}`);
             oldSync.subscribe(async (status) => {
                 if (status === 'SUBSCRIBED') {
                     await oldSync.send({ type: 'broadcast', event: 'tv_sync', payload: { type: 'TV_STOLEN', tvId: tvPin } });
                     setTimeout(() => supabase.removeChannel(oldSync), 500);
                 }
             });
          }

          localStorage.setItem('bq-tv-session-id', newSessionId);
          setSessionId(newSessionId);
          const withSound = !!e.payload.tvWithSound;
          localStorage.setItem('bq-tv-sound', withSound ? '1' : '0');
          setTvWithSound(withSound);
        } else if (e.payload?.type === 'UNPAIRED') {
          if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
            playerRef.current.pauseVideo();
          }
          currentVideoIdRef.current = null;
          setCurrentVideoId(null);
          localStorage.removeItem('bq-tv-session-id');
          localStorage.removeItem('bq-tv-pin');
          setSessionId(null);
          setStatus(t('tv.unpaired_by_host'));
          window.location.reload();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(pairChannel);
    };
  }, [tvPin]);

  // 2. Conectar a sincronización de reproducción (Local + Supabase Realtime Internet) cuando exista sessionId
  useEffect(() => {
    if (!sessionId) return;

    // 2.a. BroadcastChannel Local
    channelRef.current = new BroadcastChannel('envairo_tv_sync');

    const handleMessage = (e) => {
      if (e.data.type === 'PING') {
        if (!limitReached) {
          channelRef.current.postMessage({ type: 'PONG', tvId: myTvId.current });
        }
      } else if (e.data.type === 'PONG') {
        activeTvs.current.add(e.data.tvId);
      } else if (e.data.type === 'SYNC' || e.data.type === 'SYNC_TIME') {
        if (!limitReached) handleSync(e.data);
      } else if (e.data.type === 'MASTER_DISCONNECT') {
        if (!limitReached) {
          if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
            playerRef.current.pauseVideo();
          }
          setStatus(t('tv.host_disconnected'));
        }
      } else if (e.data.type === 'TOGGLE_SOUND') {
        handleToggleSound(e.data.tvWithSound);
      }
    };

    channelRef.current.addEventListener('message', handleMessage);
    channelRef.current.postMessage({ type: 'PING', tvId: myTvId.current });

    // 2.b. Supabase Realtime Broadcast (Internet)
    sbSyncChannelRef.current = supabase.channel(`tv-sync-${sessionId}`);
    sbSyncChannelRef.current
      .on('broadcast', { event: 'tv_sync' }, (e) => {
        if (e.payload) {
          if (e.payload.type === 'MASTER_DISCONNECT') {
            if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
              playerRef.current.pauseVideo();
            }
            setStatus(t('tv.host_disconnected'));
          } else if (e.payload.type === 'UNPAIRED') {
            if (e.payload.tvId && e.payload.tvId !== tvPin) return;

            if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
              playerRef.current.pauseVideo();
            }
            currentVideoIdRef.current = null;
            setCurrentVideoId(null);
            localStorage.removeItem('bq-tv-session-id');
            localStorage.removeItem('bq-tv-pin');
            setSessionId(null);
            setStatus(t('tv.unpaired_by_host'));
            window.location.reload();
          } else if (e.payload.type === 'TOGGLE_SOUND') {
            if (e.payload.tvId && e.payload.tvId !== tvPin) return;
            handleToggleSound(e.payload.tvWithSound);
          } else {
            handleSync(e.payload);
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          sbSyncChannelRef.current.send({
            type: 'broadcast',
            event: 'tv_sync',
            payload: { type: 'REQUEST_SYNC' }
          }).catch(() => {});
        }
      });

    const handleToggleSound = (withSoundVal) => {
      const withSound = !!withSoundVal;
      localStorage.setItem('bq-tv-sound', withSound ? '1' : '0');
      setTvWithSound(withSound);
      
      if (playerRef.current && typeof playerRef.current.unMute === 'function') {
        if (withSound) {
          playerRef.current.unMute();
          if (typeof playerRef.current.setVolume === 'function') playerRef.current.setVolume(100);
        } else {
          playerRef.current.mute();
        }
      }
    };

    // 2.c. Verificación de límite de pantallas (Máximo 4 pantallas además del anfitrión)
    const timeoutId = setTimeout(() => {
      if (activeTvs.current.size >= 4) {
        setLimitReached(true);
        setIsCheckingLimit(false);
        setStatus(t('tv.max_limit_reached'));
      } else {
        setIsCheckingLimit(false);
        const checkAndInit = () => {
          setStatus(t('tv.connected_waiting'));
          initPlayer();
        };

        if (window.YT && window.YT.Player) {
          checkAndInit();
        } else {
          const prevReady = window.onYouTubeIframeAPIReady;
          window.onYouTubeIframeAPIReady = () => {
            if (typeof prevReady === 'function') prevReady();
            checkAndInit();
          };

          if (window.YT && typeof window.YT.ready === 'function') {
            window.YT.ready(checkAndInit);
          }

          if (!document.getElementById('yt-iframe-api-script') && !window.YT) {
            const tag = document.createElement('script');
            tag.id = 'yt-iframe-api-script';
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            if (firstScriptTag && firstScriptTag.parentNode) {
              firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            } else {
              document.head.appendChild(tag);
            }
          }
        }
      }
    }, 500);

    function initPlayer() {
      if (playerRef.current) return;

      const disableCaptions = (player) => {
        try {
          if (player && typeof player.unloadModule === 'function') {
            player.unloadModule('captions');
            player.unloadModule('cc');
          }
          if (player && typeof player.setOption === 'function') {
            player.setOption('captions', 'track', {});
            player.setOption('cc', 'track', {});
          }
        } catch (e) {}
      };

      const playerVars = {
        autoplay: 1,
        enablejsapi: 1,
        mute: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        iv_load_policy: 3,
        cc_load_policy: 0,
        cc_lang_pref: 'none',
        origin: window.location.origin
      };

      const onReady = (event) => {
        if (tvWithSoundRef.current) {
          event.target.unMute();
          event.target.setVolume(100);
        } else {
          event.target.mute();
        }
        disableCaptions(event.target);

        if (pendingSyncRef.current) {
          const syncData = pendingSyncRef.current;
          pendingSyncRef.current = null;
          handleSync(syncData);
        }

        if (channelRef.current) channelRef.current.postMessage({ type: 'REQUEST_SYNC' });
        if (sbSyncChannelRef.current && sbSyncChannelRef.current.state === 'joined') {
          sbSyncChannelRef.current.send({ type: 'broadcast', event: 'tv_sync', payload: { type: 'REQUEST_SYNC' } }).catch(() => {});
        }
      };

      const onStateChange = (event) => {
        if (tvWithSoundRef.current) {
          event.target.unMute();
          event.target.setVolume(100);
        } else {
          event.target.mute();
        }
        disableCaptions(event.target);

        if (event.data === window.YT.PlayerState.PLAYING) {
          if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
          setIsLoadingVideo(false);

          const playingContainer = document.getElementById('tv-yt-container');
          if (playingContainer) {
            playingContainer.style.opacity = '1';
            playingContainer.style.zIndex = '2';
          }
        }
      };

      const onError = (event) => {
        console.warn('Error en reproductor esclavo:', event.data);
        const failedId = currentVideoIdRef.current;

        const c1 = document.getElementById('tv-yt-container');
        if (c1) {
          c1.style.opacity = '0';
          c1.style.zIndex = '-1';
        }
        
        if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
          try { playerRef.current.pauseVideo(); } catch (e) {}
        }

        setCurrentVideoId(null);
        currentVideoIdRef.current = null;
        setIsLoadingVideo(false);
        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
        setStatus(t('tv.connected_waiting'));

        if (failedId) {
          const payload = { type: 'SLAVE_ERROR', videoId: failedId };
          if (channelRef.current) channelRef.current.postMessage(payload);
          if (sbSyncChannelRef.current && sbSyncChannelRef.current.state === 'joined') {
            sbSyncChannelRef.current.send({ type: 'broadcast', event: 'tv_sync', payload }).catch(() => {});
          }
        }
      };

      playerRef.current = new window.YT.Player('tv-youtube-player', {
        height: '100%', width: '100%', playerVars, events: { onReady, onStateChange, onError }
      });
    }

    const handleFsChange = () => {
      setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    document.addEventListener('MSFullscreenChange', handleFsChange);

    return () => {
      clearTimeout(timeoutId);
      if (channelRef.current) {
        channelRef.current.removeEventListener('message', handleMessage);
        channelRef.current.close();
      }
      if (sbSyncChannelRef.current) {
        supabase.removeChannel(sbSyncChannelRef.current);
      }
      safeDestroyPlayer(playerRef, 'tv-yt-container', 'tv-youtube-player');
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);

      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
      document.removeEventListener('MSFullscreenChange', handleFsChange);
    };
  }, [sessionId]);

  const pendingSyncRef = useRef(null);

  const handleSync = (data) => {
    const p = playerRef.current;
    if (!p || typeof p.getPlayerState !== 'function') {
      if (data?.videoId) {
        pendingSyncRef.current = data;
      }
      return;
    }

    try {
      const isCurrentlyPlaying = p.getPlayerState() === window.YT.PlayerState.PLAYING;

      if (data.videoId) {
        if (!currentVideoIdRef.current) {
          currentVideoIdRef.current = data.videoId;
          setCurrentVideoId(data.videoId);
          setStatus('');
        }

        if (data.videoId !== currentVideoIdRef.current) {
          currentVideoIdRef.current = data.videoId;
          setCurrentVideoId(data.videoId);
          setStatus('');
          const bufferingOffset = 0.1;
          const start = data.time ? data.time + bufferingOffset : 0;

          const c1 = document.getElementById('tv-yt-container');
          if (c1) {
            c1.style.opacity = '1';
            c1.style.zIndex = '2';
          }

          p.loadVideoById({ videoId: data.videoId, startSeconds: start });
          if (!data.isPlaying) {
             setTimeout(() => {
                if (p && typeof p.pauseVideo === 'function') p.pauseVideo();
             }, 500);
          }
          return;
        }
      }

      // 1. Ajustar el tiempo si hay desvío (Smooth Catch-up)
      if (typeof data.time === 'number') {
        const playerState = p.getPlayerState();
        const isBuffering = playerState === window.YT.PlayerState.BUFFERING;
        const isEnded = playerState === window.YT.PlayerState.ENDED;
        const duration = p.getDuration() || 0;

        const transitDelay = (data.sentAt && data.sentAt > 0)
          ? Math.max(0, Math.min(2.0, (Date.now() - data.sentAt) / 1000))
          : 0;
        const targetTime = data.time + (data.isPlaying ? transitDelay : 0);
        const currentTime = p.getCurrentTime() || 0;
        const diff = targetTime - currentTime; // positive = TV is behind

        if ((isEnded || (duration > 0 && duration - currentTime < 3)) && data.time > duration - 10) {
          if (typeof p.setPlaybackRate === 'function') p.setPlaybackRate(1.0);
        } else if (isBuffering) {
          // Don't seek or change rate while buffering
        } else if (Math.abs(diff) > 0.8) {
          p.seekTo(targetTime, true);
          if (typeof p.setPlaybackRate === 'function') p.setPlaybackRate(1.0);
        } else if (diff > 0.15) {
          if (typeof p.setPlaybackRate === 'function') p.setPlaybackRate(1.15);
        } else if (diff > 0.05) {
          if (typeof p.setPlaybackRate === 'function') p.setPlaybackRate(1.05);
        } else if (diff < -0.15) {
          if (typeof p.setPlaybackRate === 'function') p.setPlaybackRate(0.85);
        } else if (diff < -0.05) {
          if (typeof p.setPlaybackRate === 'function') p.setPlaybackRate(0.95);
        } else {
          if (typeof p.setPlaybackRate === 'function') p.setPlaybackRate(1.0);
        }
      }

      // 2. Sincronizar inmediatamente el estado de reproducción/pausa
      if (typeof data.isPlaying === 'boolean') {
        if (!data.isPlaying) {
          if (p && typeof p.pauseVideo === 'function') p.pauseVideo();
        } else if (data.isPlaying && !isCurrentlyPlaying) {
          if (p && typeof p.playVideo === 'function') p.playVideo();
        }
      }
    } catch (err) {
      console.error("Error sincronizando TV Display:", err);
    }
  };

  const handleMouseMove = () => {
    setIsIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true);
    }, 3000);
  };

  const toggleFullscreen = () => {
    const docElm = document.documentElement;
    const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;

    if (!isFs) {
      if (docElm.requestFullscreen) {
        docElm.requestFullscreen();
      } else if (docElm.webkitRequestFullscreen) {
        docElm.webkitRequestFullscreen();
      } else if (docElm.mozRequestFullScreen) {
        docElm.mozRequestFullScreen();
      } else if (docElm.msRequestFullscreen) {
        docElm.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  };

  const handleUnpair = () => {
    safeDestroyPlayer(playerRef, 'tv-yt-container', 'tv-youtube-player');
    localStorage.removeItem('bq-tv-session-id');
    localStorage.removeItem('bq-tv-pin');
    setSessionId(null);
    setCurrentVideoId(null);
    currentVideoIdRef.current = null;
    window.location.reload();
  };

  const handleLocalVolumeChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setLocalVolume(val);
    if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
      playerRef.current.setVolume(val);
      if (val > 0 && localMuted) {
         setLocalMuted(false);
         playerRef.current.unMute();
      }
    }
  };

  const toggleLocalMute = () => {
    const newMuted = !localMuted;
    setLocalMuted(newMuted);
    if (playerRef.current && typeof playerRef.current.unMute === 'function') {
      if (newMuted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
    }
  };

  return (
    <div
      className={`fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center overflow-hidden ${isIdle ? 'cursor-none' : ''}`}
      onMouseMove={handleMouseMove}
      onClick={handleMouseMove}
    >
      {/* 1. Contenedor permanente de reproductor YouTube */}
      <div
        id="tv-yt-container"
        className={`absolute inset-0 z-[2] flex items-center justify-center bg-black transition-opacity duration-1000 ease-in-out ${!sessionId ? 'pointer-events-none opacity-0' : ''}`}
        style={{ width: '100vw', height: '100vh' }}
      >
        <div id="tv-youtube-player"></div>
      </div>

      {/* Click-blocking overlay */}
      <div className="absolute inset-0 z-10 cursor-default"></div>

      {/* Modo Sin Emparejar (Pantalla de Vinculación con QR y PIN) */}
      {!sessionId && (
        <div className="absolute inset-0 z-40 bg-bg-card flex flex-col items-center justify-center p-8 select-none text-white overflow-hidden">
          {/* Fondo decorativo con luces de neón */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none"></div>

          <div className="relative z-10 flex flex-col items-center max-w-2xl w-full text-center space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-3 rounded-full backdrop-blur-md">
              <Tv size={24} className="text-accent" />
              <span className="text-sm font-semibold tracking-wider uppercase text-text-muted">envAIro TV Display</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">{t('tv.link_this_screen')}</h1>

            {/* Tarjeta de Vinculación */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-bg-elevated/80 border border-white/10 p-8 rounded-3xl backdrop-blur-xl shadow-2xl w-full max-w-3xl">
              {/* Columna QR */}
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="bg-white p-4 rounded-2xl shadow-xl border border-white/20">
                  <QRCodeSVG
                    value={`${window.location.origin}/app/dashboard?pair_pin=${tvPin}`}
                    size={160}
                    level="H"
                    includeMargin={false}
                  />
                </div>
                <p className="text-xs text-text-muted font-medium">{t('tv.scan_from_host')}</p>
              </div>

              {/* Columna PIN */}
              <div className="flex flex-col items-center md:items-start space-y-4 border-t md:border-t-0 md:border-l border-white/10 pt-6 md:pt-0 md:pl-8 w-full min-w-0">
                <span className="text-xs font-semibold text-accent uppercase tracking-widest">{t('tv.or_enter_pin')}</span>
                <div className="bg-black/50 border border-white/15 rounded-2xl px-4 py-3 md:px-5 md:py-3.5 font-mono text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-wider shadow-inner w-full text-center whitespace-nowrap overflow-hidden flex items-center justify-center">
                  {tvPin.slice(0, 3)} - {tvPin.slice(3)}
                </div>
                <p className="text-xs text-text-muted text-center md:text-left leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(t('tv.pin_instructions')) }} />
              </div>
            </div>

            {/* Status footer */}
            <div className="flex items-center gap-3 text-white/60 bg-white/5 px-5 py-2.5 rounded-full text-xs">
              <Activity size={16} className="animate-spin-slow text-accent" />
              <span>{t('tv.waiting_realtime')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modo Emparejado: Overlay status si no hay video activo */}
      {sessionId && !currentVideoId && (
        <div className="absolute inset-0 z-20 bg-black flex flex-col items-center justify-center gap-6 animate-pulse">
          <div className="bg-white/10 p-6 rounded-full border border-white/20">
            <Tv size={64} className="text-white opacity-80" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-3xl font-bold text-white tracking-wide">TV Display</h1>
            <div className="flex items-center gap-3 text-white/60">
              <Activity size={20} className="animate-spin-slow text-accent" />
              <p className="text-xl font-medium">{status}</p>
            </div>
          </div>
        </div>
      )}

      {/* Modo Emparejado: Controles flotantes */}
      {sessionId && (
        <div className={`absolute bottom-6 right-6 z-30 flex items-center gap-3 transition-opacity duration-300 ${isIdle ? 'opacity-0' : 'opacity-100'}`}>
          {tvWithSound && (
            <div className="bg-black/50 p-1.5 rounded-full backdrop-blur-md flex items-center shadow-lg group hover:bg-black/70 transition-all border border-white/5">
              <button
                onClick={toggleLocalMute}
                className="text-white p-2.5 rounded-full hover:bg-white/10 transition-colors"
                title={localMuted ? "Quitar silencio" : "Silenciar"}
              >
                {localMuted || localVolume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={localVolume}
                onChange={handleLocalVolumeChange}
                className="w-0 opacity-0 group-hover:w-24 group-hover:opacity-100 transition-all duration-300 cursor-pointer mr-3 ml-1 accent-accent"
              />
            </div>
          )}
          <button
            onClick={handleUnpair}
            className="bg-black/50 hover:bg-danger/80 text-white p-4 rounded-full backdrop-blur-md transition-all flex items-center justify-center cursor-pointer shadow-lg"
            title={t('tv.unpair_tv')}
          >
            <Unlink size={24} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="bg-black/50 hover:bg-black/80 text-white p-4 rounded-full backdrop-blur-md transition-all flex items-center justify-center cursor-pointer shadow-lg"
            title={isFullscreen ? t('tv.exit_fullscreen') : t('tv.fullscreen')}
          >
            {isFullscreen ? <Minimize size={28} /> : <Maximize size={28} />}
          </button>
        </div>
      )}

      {/* Botón extra X arriba si está en full screen */}
      {isFullscreen && (
        <div className={`absolute top-6 right-6 z-30 transition-opacity duration-300 ${isIdle ? 'opacity-0' : 'opacity-100'}`}>
          <button
            onClick={toggleFullscreen}
            className="bg-black/50 hover:bg-black/80 text-white p-4 rounded-full backdrop-blur-md transition-all flex items-center justify-center cursor-pointer shadow-lg"
            title={t('tv.exit_esc')}
          >
            <X size={28} />
          </button>
        </div>
      )}
    </div>
  );
}
