import React, { useEffect, useRef, useState } from 'react';
import { Tv, Activity, Maximize, Minimize, X, Unlink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';

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

  const [tvPin] = useState(() => generate6DigitPin());
  const [status, setStatus] = useState('Verificando disponibilidad...');
  const [currentVideoId, setCurrentVideoId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [isCheckingLimit, setIsCheckingLimit] = useState(true);
  const myTvId = useRef(crypto.randomUUID ? crypto.randomUUID() : Math.random().toString());
  const activeTvs = useRef(new Set());
  const idleTimerRef = useRef(null);
  const currentVideoIdRef = useRef(null);

  const getActivePlayer = () => activePlayerIndex.current === 1 ? player1Ref.current : player2Ref.current;
  const getBufferPlayer = () => activePlayerIndex.current === 1 ? player2Ref.current : player1Ref.current;

  // 1. Escuchar eventos de emparejamiento por Supabase Realtime si NO hay sessionId
  useEffect(() => {
    if (sessionId) return;

    const pairChannel = supabase.channel(`tv-pair-${tvPin}`);

    pairChannel
      .on('broadcast', { event: 'pairing_result' }, (e) => {
        if (e.payload?.type === 'PAIRED' && e.payload.sessionId) {
          localStorage.setItem('bq-tv-session-id', e.payload.sessionId);
          setSessionId(e.payload.sessionId);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(pairChannel);
    };
  }, [tvPin, sessionId]);

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
          currentVideoIdRef.current = null;
          setCurrentVideoId(null);
          setStatus('Anfitrión desconectado. Esperando reconexión...');
        }
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
            currentVideoIdRef.current = null;
            setCurrentVideoId(null);
            setStatus('Anfitrión desconectado. Esperando reconexión...');
          } else {
            handleSync(e.payload);
          }
        }
      })
      .subscribe();

    // 2.c. Verificación de límite de pantallas
    const timeoutId = setTimeout(() => {
      if (activeTvs.current.size >= 10) {
        setLimitReached(true);
        setIsCheckingLimit(false);
        setStatus('Límite máximo alcanzado (10 pantallas simultáneas)');
      } else {
        setIsCheckingLimit(false);
        if (!window.YT) {
          const tag = document.createElement('script');
          tag.src = "https://www.youtube.com/iframe_api";
          const firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }

        window.onYouTubeIframeAPIReady = () => {
          setStatus('Conectado. Esperando música...');
          initPlayers();
        };

        if (window.YT && window.YT.Player) {
          setStatus('Conectado. Esperando música...');
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
        event.target.mute();
        disableCaptions(event.target);
        readyCount++;
        if (readyCount === 2) {
          channelRef.current.postMessage({ type: 'REQUEST_SYNC' });
        }
      };

      const onStateChange = (event) => {
        event.target.mute();
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
        setCurrentVideoId(null);
        setStatus('Buscando alternativa...');
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

      // Sincronizar inmediatamente el estado de reproducción/pausa con el anfitrión
      if (typeof data.isPlaying === 'boolean') {
        if (!data.isPlaying && isCurrentlyPlaying) {
          activeP.pauseVideo();
        } else if (data.isPlaying && !isCurrentlyPlaying) {
          activeP.playVideo();
        }
      }

      if (data.type === 'SYNC_TIME' && data.time > 0 && !isTransitioning.current) {
        const playerState = activeP.getPlayerState();
        // Solo ajustar seekTo si el desvío es mayor a 3.0 segundos y el reproductor no está en buffer
        if (playerState !== window.YT.PlayerState.BUFFERING) {
          const currentTime = activeP.getCurrentTime();
          if (currentTime !== undefined && Math.abs(currentTime - data.time) > 3.0) {
            activeP.seekTo(data.time, true);
          }
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
    setSessionId(null);
    setCurrentVideoId(null);
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

            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
              Vincular esta pantalla
            </h1>

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
                <p className="text-xs text-text-muted font-medium">Escanea desde el celular del Anfitrión</p>
              </div>

              {/* Columna PIN */}
              <div className="flex flex-col items-center md:items-start space-y-4 border-t md:border-t-0 md:border-l border-white/10 pt-6 md:pt-0 md:pl-8 w-full min-w-0">
                <span className="text-xs font-semibold text-accent uppercase tracking-widest">O ingresa este PIN</span>
                <div className="bg-black/50 border border-white/15 rounded-2xl px-4 py-3 md:px-5 md:py-3.5 font-mono text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-wider shadow-inner w-full text-center whitespace-nowrap overflow-hidden flex items-center justify-center">
                  {tvPin.slice(0, 3)} - {tvPin.slice(3)}
                </div>
                <p className="text-xs text-text-muted text-center md:text-left leading-relaxed">
                  Ingresa a tu panel de control de envAIro, presiona <strong className="text-white">Vincular TV</strong> e introduce este código de 6 dígitos.
                </p>
              </div>
            </div>

            {/* Status footer */}
            <div className="flex items-center gap-3 text-white/60 bg-white/5 px-5 py-2.5 rounded-full text-xs">
              <Activity size={16} className="animate-spin-slow text-accent" />
              <span>Esperando vinculación en tiempo real...</span>
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
          <button
            onClick={handleUnpair}
            className="bg-black/50 hover:bg-danger/80 text-white p-4 rounded-full backdrop-blur-md transition-all flex items-center justify-center cursor-pointer shadow-lg"
            title="Desvincular esta pantalla TV"
          >
            <Unlink size={24} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="bg-black/50 hover:bg-black/80 text-white p-4 rounded-full backdrop-blur-md transition-all flex items-center justify-center cursor-pointer shadow-lg"
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla Completa"}
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
            title="Salir (o presiona ESC)"
          >
            <X size={28} />
          </button>
        </div>
      )}
    </div>
  );
}
