import React, { useEffect, useRef, useState } from 'react';
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
  const player1Ref = useRef(null);
  const player2Ref = useRef(null);
  const activePlayerIndex = useRef(1);
  const isTransitioning = useRef(false);

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

  const getActivePlayer = () => activePlayerIndex.current === 1 ? player1Ref.current : player2Ref.current;
  const getBufferPlayer = () => activePlayerIndex.current === 1 ? player2Ref.current : player1Ref.current;

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
             // Notificar al anfitrión anterior que esta pantalla fue vinculada por otro usuario
             const oldSync = supabase.channel(`tv-sync-${oldSessionId}`);
             oldSync.subscribe(async (status) => {
                 if (status === 'SUBSCRIBED') {
                     await oldSync.send({ type: 'broadcast', event: 'tv_sync', payload: { type: 'TV_STOLEN', tvId: tvPin } });
                     setTimeout(() => supabase.removeChannel(oldSync), 500);
                 }
             });
          }

          // Vinculación inicial
          localStorage.setItem('bq-tv-session-id', newSessionId);
          setSessionId(newSessionId);
          // Leer preferencia de sonido enviada por el anfitrión
          const withSound = !!e.payload.tvWithSound;
          localStorage.setItem('bq-tv-sound', withSound ? '1' : '0');
          setTvWithSound(withSound);
        } else if (e.payload?.type === 'UNPAIRED') {
          // Host desvinculó esta TV: detener reproducción y volver a pantalla de vinculación
          const activeP = getActivePlayer();
          if (activeP && typeof activeP.pauseVideo === 'function') {
            activeP.pauseVideo();
          }
          currentVideoIdRef.current = null;
          setCurrentVideoId(null);
          localStorage.removeItem('bq-tv-session-id');
          localStorage.removeItem('bq-tv-pin');
          setSessionId(null);
          setStatus(t('tv.unpaired_by_host'));
          window.location.reload(); // Recargar para generar un nuevo PIN limpio
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
          const activeP = getActivePlayer();
          if (activeP && typeof activeP.pauseVideo === 'function') {
            activeP.pauseVideo();
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
            const activeP = getActivePlayer();
            if (activeP && typeof activeP.pauseVideo === 'function') {
              activeP.pauseVideo();
            }
            setStatus(t('tv.host_disconnected'));
          } else if (e.payload.type === 'UNPAIRED') {
            // Validar que el mensaje de desvinculación sea específicamente para esta TV
            if (e.payload.tvId && e.payload.tvId !== tvPin) return;

            // El anfitrión desvinculó esta pantalla: detener música y volver a pantalla de vinculación
            const activeP = getActivePlayer();
            if (activeP && typeof activeP.pauseVideo === 'function') {
              activeP.pauseVideo();
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
      .subscribe();

    const handleToggleSound = (withSoundVal) => {
      const withSound = !!withSoundVal;
      localStorage.setItem('bq-tv-sound', withSound ? '1' : '0');
      setTvWithSound(withSound);
      
      const applySound = (player) => {
        if (player && typeof player.unMute === 'function') {
          if (withSound) {
            player.unMute();
            if (typeof player.setVolume === 'function') player.setVolume(100);
          } else {
            player.mute();
          }
        }
      };
      applySound(player1Ref.current);
      applySound(player2Ref.current);
    };

    // 2.c. Verificación de límite de pantallas
    const timeoutId = setTimeout(() => {
      if (activeTvs.current.size >= 10) {
        setLimitReached(true);
        setIsCheckingLimit(false);
        setStatus(t('tv.max_limit_reached'));
      } else {
        setIsCheckingLimit(false);
        if (!window.YT) {
          const tag = document.createElement('script');
          tag.src = "https://www.youtube.com/iframe_api";
          const firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }

        window.onYouTubeIframeAPIReady = () => {
          setStatus(t('tv.connected_waiting'));
          initPlayers();
        };

        if (window.YT && window.YT.Player) {
          setStatus(t('tv.connected_waiting'));
          initPlayers();
        }
      }
    }, 500);

    let readyCount = 0;
    function initPlayers() {
      if (player1Ref.current && player2Ref.current) return;

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
        autoplay: 0,
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
        readyCount++;
        if (readyCount === 2) {
          channelRef.current.postMessage({ type: 'REQUEST_SYNC' });
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
        const activeP = getActivePlayer();
        const bufferP = getBufferPlayer();

        if (isTransitioning.current && event.target === bufferP) {
          if (event.data === window.YT.PlayerState.PLAYING) {
            isTransitioning.current = false;

            const nextIndex = activePlayerIndex.current === 1 ? 2 : 1;
            const activeContainer = document.getElementById(`tv-yt-container-${activePlayerIndex.current}`);
            const bufferContainer = document.getElementById(`tv-yt-container-${nextIndex}`);

            if (activeContainer && bufferContainer) {
              bufferContainer.style.opacity = '1';
              bufferContainer.style.zIndex = '2';

              activeContainer.style.opacity = '0';
              activeContainer.style.zIndex = '1';
            }

            if (activeP && typeof activeP.pauseVideo === 'function') {
              activeP.pauseVideo();
            }
            activePlayerIndex.current = nextIndex;
          }
        }
      };

      const onError = (event) => {
        console.warn('Error en reproductor esclavo:', event.data);
        const failedId = currentVideoIdRef.current;
        
        const bufferP = getBufferPlayer();
        if (isTransitioning.current && event.target === bufferP) {
          isTransitioning.current = false;
        }

        const activeP = getActivePlayer();
        if (activeP && typeof activeP.pauseVideo === 'function') {
          activeP.pauseVideo();
        }

        setCurrentVideoId(null);
        currentVideoIdRef.current = null;
        setStatus(t('tv.searching_alternative'));

        // Notificar al anfitrión (Host) para que busque otra alternativa si es un error fatal
        if (event.data === 150 || event.data === 101 || event.data === 100) {
          const payload = { type: 'SLAVE_ERROR', videoId: failedId };
          if (channelRef.current) {
            channelRef.current.postMessage(payload);
          }
          if (sbSyncChannelRef.current && sbSyncChannelRef.current.state === 'joined') {
            sbSyncChannelRef.current.send({ type: 'broadcast', event: 'tv_sync', payload }).catch(() => {});
          }
        }
      };

      player1Ref.current = new window.YT.Player('tv-youtube-player-1', {
        height: '100%', width: '100%', playerVars, events: { onReady, onStateChange, onError }
      });
      player2Ref.current = new window.YT.Player('tv-youtube-player-2', {
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
      safeDestroyPlayer(player1Ref, 'tv-yt-container-1', 'tv-youtube-player-1');
      safeDestroyPlayer(player2Ref, 'tv-yt-container-2', 'tv-youtube-player-2');
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
      document.removeEventListener('MSFullscreenChange', handleFsChange);
    };
  }, [sessionId]);

  const handleSync = (data) => {
    const activeP = getActivePlayer();
    const bufferP = getBufferPlayer();
    if (!activeP || !bufferP || typeof activeP.getPlayerState !== 'function') return;

    try {
      const isCurrentlyPlaying = activeP.getPlayerState() === window.YT.PlayerState.PLAYING;

      if (data.videoId && data.videoId !== currentVideoIdRef.current) {
        currentVideoIdRef.current = data.videoId;
        setCurrentVideoId(data.videoId);
        setStatus('');
        const bufferingOffset = 0.1;
        const start = data.time ? data.time + bufferingOffset : 0;

        if (isCurrentlyPlaying && data.isPlaying) {
          isTransitioning.current = true;
          bufferP.loadVideoById({ videoId: data.videoId, startSeconds: start });
        } else {
          isTransitioning.current = false;
          if (data.isPlaying) {
            activeP.loadVideoById({ videoId: data.videoId, startSeconds: start });
          } else {
            activeP.cueVideoById({ videoId: data.videoId, startSeconds: start });
          }
        }
        return;
      }

      // 1. Ajustar el tiempo (seekTo) si hay un desvío, antes de play/pause para evitar estado BUFFERING
      let shouldSeek = false;
      if (typeof data.time === 'number' && !isTransitioning.current) {
        const playerState = activeP.getPlayerState();
        const isBuffering = playerState === window.YT.PlayerState.BUFFERING;
        
        // Forzar seek en SYNC (directo del host), o en SYNC_TIME si no está en buffer
        // Reducimos la tolerancia a 0.5s para asegurar que todas las pantallas esclavas
        // estén sincronizadas casi perfectamente "entre sí".
        if (data.type === 'SYNC' || (!isBuffering && data.type === 'SYNC_TIME')) {
          const currentTime = activeP.getCurrentTime();
          if (currentTime !== undefined && Math.abs(currentTime - data.time) > 0.5) {
            shouldSeek = true;
          }
        }
      }

      if (shouldSeek) {
        activeP.seekTo(data.time, true);
      }

      // 2. Sincronizar inmediatamente el estado de reproducción/pausa con el anfitrión
      if (typeof data.isPlaying === 'boolean') {
        if (!data.isPlaying && isCurrentlyPlaying) {
          activeP.pauseVideo();
        } else if (data.isPlaying && !isCurrentlyPlaying) {
          activeP.playVideo();
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
    safeDestroyPlayer(player1Ref, 'tv-yt-container-1', 'tv-youtube-player-1');
    safeDestroyPlayer(player2Ref, 'tv-yt-container-2', 'tv-youtube-player-2');
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
    const applyVol = (player) => {
      if (player && typeof player.setVolume === 'function') {
        player.setVolume(val);
        if (val > 0 && localMuted) {
           setLocalMuted(false);
           player.unMute();
        }
      }
    };
    applyVol(player1Ref.current);
    applyVol(player2Ref.current);
  };

  const toggleLocalMute = () => {
    const newMuted = !localMuted;
    setLocalMuted(newMuted);
    const applyMute = (player) => {
      if (player && typeof player.unMute === 'function') {
        if (newMuted) {
          player.mute();
        } else {
          player.unMute();
        }
      }
    };
    applyMute(player1Ref.current);
    applyMute(player2Ref.current);
  };

  return (
    <div
      className={`fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center overflow-hidden ${isIdle ? 'cursor-none' : ''}`}
      onMouseMove={handleMouseMove}
      onClick={handleMouseMove}
    >
      {/* 1. Contenedores permanentes de reproductores YouTube (Para evitar errores de reconciliación DOM en React) */}
      <div
        id="tv-yt-container-1"
        className={`absolute inset-0 z-[2] flex items-center justify-center bg-black transition-opacity duration-1000 ease-in-out ${!sessionId ? 'pointer-events-none opacity-0' : ''}`}
        style={{ width: '100vw', height: '100vh' }}
      >
        <div id="tv-youtube-player-1"></div>
      </div>

      <div
        id="tv-yt-container-2"
        className={`absolute inset-0 z-[1] flex items-center justify-center bg-black transition-opacity duration-1000 ease-in-out ${!sessionId ? 'pointer-events-none opacity-0' : ''}`}
        style={{ width: '100vw', height: '100vh' }}
      >
        <div id="tv-youtube-player-2"></div>
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
                <p className="text-xs text-text-muted text-center md:text-left leading-relaxed" dangerouslySetInnerHTML={{ __html: t('tv.pin_instructions') }} />
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
