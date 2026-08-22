import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { Tv, Activity, Maximize, Minimize, X, Unlink, Volume2, VolumeX, Music2 } from 'lucide-react';
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

// Utility: disable YouTube captions on a player instance
function disableCaptions(player) {
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
}

export default function TVDisplayPage() {
  const { t } = useTranslation();
  const channelRef = useRef(null);
  const sbSyncChannelRef = useRef(null);
  const playerARef = useRef(null);
  const playerBRef = useRef(null);
  const activeTvDeckRef = useRef('A'); // 'A' | 'B'
  const pendingSyncRef = useRef(null);
  const isTvTransitioningRef = useRef(false);
  const tvTransitionTimerRef = useRef(null);
  const tvVolIntervalRef = useRef(null);

  // Proxy that always points to the active deck's player
  const playerRef = {
    get current() {
      return activeTvDeckRef.current === 'A' ? playerARef.current : playerBRef.current;
    },
    set current(val) {
      if (activeTvDeckRef.current === 'A') playerARef.current = val;
      else playerBRef.current = val;
    }
  };

  // Refs to always call the latest version of these handlers from useEffect listeners
  const handleSyncRef = useRef(null);
  const handleTransitionStartRef = useRef(null);
  const handlePreloadStandbyRef = useRef(null);

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
  const isBufferingRef = useRef(false);
  const bufferSafetyTimerRef = useRef(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const loadingTimerRef = useRef(null);
  const hostRefreshingRef = useRef(false);
  const trackStartedAtRef = useRef(0);
  const lastSeekTimeRef = useRef(0);
  const lastHostSyncTimeRef = useRef(Date.now());
  const isHostPlayingRef = useRef(true);
  const silentAudioRef = useRef(null);

  // 0. Elemento de audio silencioso en loop para otorgar prioridad de reproducción multimedia en segundo plano al navegador
  useEffect(() => {
    const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    audio.loop = true;
    audio.volume = 0.001;
    silentAudioRef.current = audio;

    const startKeepAlive = () => {
      audio.play().catch(() => {});
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'playing';
        } catch (e) {}
      }
    };

    startKeepAlive();
    window.addEventListener('pointerdown', startKeepAlive, { once: true });
    window.addEventListener('keydown', startKeepAlive, { once: true });

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

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
          setSessionId(null);
          setStatus(t('tv.unpaired_by_host'));
        } else if (e.payload?.type === 'TOGGLE_SOUND') {
          handleToggleSound(e.payload.tvWithSound);
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

    // 2.a. BroadcastChannel Local aislado por sesión
    channelRef.current = new BroadcastChannel(`envairo_tv_sync_${sessionId}`);

    const handleMessage = (e) => {
      if (e.data.type === 'PING') {
        if (!limitReached) {
          channelRef.current.postMessage({ type: 'PONG', tvId: myTvId.current });
        }
      } else if (e.data.type === 'PONG') {
        activeTvs.current.add(e.data.tvId);
      } else if (e.data.type === 'PRELOAD_STANDBY_DECK') {
        if (!limitReached && handlePreloadStandbyRef.current) handlePreloadStandbyRef.current(e.data);
      } else if (e.data.type === 'DJ_TRANSITION_START') {
        if (!limitReached && handleTransitionStartRef.current) handleTransitionStartRef.current(e.data);
      } else if (e.data.type === 'SYNC' || e.data.type === 'SYNC_TIME') {
        if (!limitReached && handleSyncRef.current) handleSyncRef.current(e.data);
      } else if (e.data.type === 'HOST_REFRESHING') {
        if (!limitReached) {
          hostRefreshingRef.current = true;
          if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
            playerRef.current.pauseVideo();
          }
          setStatus(t('tv.host_refreshing'));
        }
      } else if (e.data.type === 'MASTER_DISCONNECT') {
        if (!limitReached) {
          if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
            try { playerRef.current.pauseVideo(); } catch (err) {}
          }
          const cA = document.getElementById('tv-yt-deck-a');
          const cB = document.getElementById('tv-yt-deck-b');
          if (cA) cA.style.opacity = '0.001';
          if (cB) cB.style.opacity = '0.001';
          currentVideoIdRef.current = null;
          setCurrentVideoId(null);
          setStatus(t('tv.host_disconnected') || 'Anfitrión desconectado. Esperando conexión...');
        }
      } else if (e.data.type === 'UNPAIRED') {
        const cleanTargetId = String(e.data.tvId || '').replace(/\D/g, '');
        const cleanCurrentPin = String(tvPin || '').replace(/\D/g, '');
        if (cleanTargetId && cleanCurrentPin && cleanTargetId !== cleanCurrentPin) return;

        if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
          try { playerRef.current.pauseVideo(); } catch (err) {}
        }
        const cA = document.getElementById('tv-yt-deck-a');
        const cB = document.getElementById('tv-yt-deck-b');
        if (cA) cA.style.opacity = '0.001';
        if (cB) cB.style.opacity = '0.001';
        currentVideoIdRef.current = null;
        setCurrentVideoId(null);
        localStorage.removeItem('bq-tv-session-id');
        setSessionId(null);
        setStatus(t('tv.unpaired_by_host'));
      } else if (e.data.type === 'TOGGLE_SOUND') {
        handleToggleSound(e.data.tvWithSound);
      }
    };

    channelRef.current.addEventListener('message', handleMessage);
    channelRef.current.postMessage({ type: 'PING', tvId: myTvId.current });

    // 2.b. Supabase Realtime Broadcast & Database Sync (Internet)
    sbSyncChannelRef.current = supabase.channel(`tv-sync-${sessionId}`);
    sbSyncChannelRef.current
      .on('broadcast', { event: 'tv_sync' }, (e) => {
        if (e.payload) {
          if (e.payload.type === 'PRELOAD_STANDBY_DECK') {
            if (handlePreloadStandbyRef.current) handlePreloadStandbyRef.current(e.payload);
          } else if (e.payload.type === 'DJ_TRANSITION_START') {
            if (handleTransitionStartRef.current) handleTransitionStartRef.current(e.payload);
          } else if (e.payload.type === 'HOST_REFRESHING') {
            hostRefreshingRef.current = true;
            if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
              try { playerRef.current.pauseVideo(); } catch (err) {}
            }
            setStatus(t('tv.host_refreshing'));
          } else if (e.payload.type === 'MASTER_DISCONNECT') {
            if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
              try { playerRef.current.pauseVideo(); } catch (err) {}
            }
            const cA = document.getElementById('tv-yt-deck-a');
            const cB = document.getElementById('tv-yt-deck-b');
            if (cA) cA.style.opacity = '0.001';
            if (cB) cB.style.opacity = '0.001';
            currentVideoIdRef.current = null;
            setCurrentVideoId(null);
            setStatus(t('tv.host_disconnected') || 'Anfitrión desconectado. Esperando conexión...');
          } else if (e.payload.type === 'UNPAIRED') {
            const cleanTargetId = String(e.payload.tvId || '').replace(/\D/g, '');
            const cleanCurrentPin = String(tvPin || '').replace(/\D/g, '');
            if (cleanTargetId && cleanCurrentPin && cleanTargetId !== cleanCurrentPin) return;

            if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
              try { playerRef.current.pauseVideo(); } catch (err) {}
            }
            const cA = document.getElementById('tv-yt-deck-a');
            const cB = document.getElementById('tv-yt-deck-b');
            if (cA) cA.style.opacity = '0.001';
            if (cB) cB.style.opacity = '0.001';
            currentVideoIdRef.current = null;
            setCurrentVideoId(null);
            localStorage.removeItem('bq-tv-session-id');
            setSessionId(null);
            setStatus(t('tv.unpaired_by_host'));
          } else if (e.payload.type === 'TOGGLE_SOUND') {
            const cleanTargetId = String(e.payload.tvId || '').replace(/\D/g, '');
            const cleanCurrentPin = String(tvPin || '').replace(/\D/g, '');
            if (cleanTargetId && cleanCurrentPin && cleanTargetId !== cleanCurrentPin) return;
            handleToggleSound(e.payload.tvWithSound);
          } else {
            if (handleSyncRef.current) handleSyncRef.current(e.payload);
          }
        }
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const newSession = payload.new;
          if (!newSession) return;

          const cleanCurrentPin = String(tvPin || '').replace(/\D/g, '');
          const pairedList = Array.isArray(newSession.paired_tvs) ? newSession.paired_tvs : [];
          const myTvEntry = pairedList.find(t => String(t.id || '').replace(/\D/g, '') === cleanCurrentPin);

          // Si cambió el estado de sonido en la base de datos para esta TV
          if (myTvEntry && typeof myTvEntry.soundEnabled === 'boolean' && myTvEntry.soundEnabled !== tvWithSoundRef.current) {
            handleToggleSound(myTvEntry.soundEnabled);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          sbSyncChannelRef.current.send({
            type: 'broadcast',
            event: 'tv_sync',
            payload: { type: 'REQUEST_SYNC' }
          }).catch(() => {});
        }
      });

    // Intervalo de reintento automático y detección de anfitrión desconectado:
    const syncRetryInterval = setInterval(() => {
      // Si llevamos más de 7.5s sin recibir heartbeat/sync del anfitrión mientras teníamos video cargado
      const isHostOffline = currentVideoIdRef.current && !hostRefreshingRef.current && (Date.now() - lastHostSyncTimeRef.current > 7500);
      if (isHostOffline) {
        const activeP = activeTvDeckRef.current === 'A' ? playerARef.current : playerBRef.current;
        if (activeP && typeof activeP.pauseVideo === 'function') {
          try { activeP.pauseVideo(); } catch (err) {}
        }
        const cA = document.getElementById('tv-yt-deck-a');
        const cB = document.getElementById('tv-yt-deck-b');
        if (cA) cA.style.opacity = '0.001';
        if (cB) cB.style.opacity = '0.001';
        currentVideoIdRef.current = null;
        setCurrentVideoId(null);
        setStatus(t('tv.host_disconnected') || 'Anfitrión desconectado. Esperando conexión...');
      }

      const needsRetry = !currentVideoIdRef.current || hostRefreshingRef.current;
      if (needsRetry) {
        if (channelRef.current) {
          channelRef.current.postMessage({ type: 'REQUEST_SYNC' });
        }
        if (sbSyncChannelRef.current && sbSyncChannelRef.current.state === 'joined') {
          sbSyncChannelRef.current.send({
            type: 'broadcast',
            event: 'tv_sync',
            payload: { type: 'REQUEST_SYNC' }
          }).catch(() => {});
        }
      }
    }, 2000);

    const handleToggleSound = (withSoundVal) => {
      const withSound = !!withSoundVal;
      localStorage.setItem('bq-tv-sound', withSound ? '1' : '0');
      tvWithSoundRef.current = withSound;
      setTvWithSound(withSound);
      
      const applyVolume = (p) => {
        if (!p) return;
        try {
          if (withSound) {
            if (typeof p.unMute === 'function') p.unMute();
            if (typeof p.setVolume === 'function') p.setVolume(100);
          } else {
            if (typeof p.mute === 'function') p.mute();
          }
        } catch (e) {}
      };

      applyVolume(playerARef.current);
      applyVolume(playerBRef.current);
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
    if (playerARef.current || playerBRef.current) return;

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
      origin: window.location.origin,
      playsinline: 1
    };

    const handleDeckReady = (deck, event) => {
      try {
        const iframe = event.target?.getIframe?.();
        if (iframe) {
          iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
          iframe.setAttribute('allowfullscreen', '1');
        }
      } catch (e) {}

      if (tvWithSoundRef.current) {
        try { event.target.unMute(); event.target.setVolume(100); } catch (e) {}
      } else {
        try { event.target.mute(); } catch (e) {}
      }
      disableCaptions(event.target);

      if (deck === 'A') {
        if (pendingSyncRef.current) {
          const syncData = pendingSyncRef.current;
          pendingSyncRef.current = null;
          if (handleSyncRef.current) handleSyncRef.current(syncData);
        }
        if (channelRef.current) channelRef.current.postMessage({ type: 'REQUEST_SYNC' });
        if (sbSyncChannelRef.current && sbSyncChannelRef.current.state === 'joined') {
          sbSyncChannelRef.current.send({ type: 'broadcast', event: 'tv_sync', payload: { type: 'REQUEST_SYNC' } }).catch(() => {});
        }
      }
    };

    const handleDeckStateChange = (deck, event) => {
      // Only force volume on the ACTIVE deck; don't touch the incoming deck during transitions
      if (!isTvTransitioningRef.current && activeTvDeckRef.current === deck) {
        if (tvWithSoundRef.current) {
          try { event.target.unMute(); event.target.setVolume(100); } catch (e) {}
        } else {
          try { event.target.mute(); } catch (e) {}
        }
      }
      disableCaptions(event.target);

      if (event.data === window.YT.PlayerState.PLAYING) {
        isBufferingRef.current = false;
        if (bufferSafetyTimerRef.current) clearTimeout(bufferSafetyTimerRef.current);
        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
        setIsLoadingVideo(false);

        // Revelar contenedor SOLO cuando el video está reproduciéndose con éxito
        const playingContainer = document.getElementById(deck === 'A' ? 'tv-yt-deck-a' : 'tv-yt-deck-b');
        if (playingContainer) {
          playingContainer.style.opacity = '1';
          playingContainer.style.zIndex = '2';
        }
      } else if (event.data === window.YT.PlayerState.PAUSED) {
        // Anti-Throttling de pestañas en segundo plano: si Chrome pausa el iframe en background mientras hay video activo, forzar play
        if (activeTvDeckRef.current === deck && currentVideoIdRef.current && !hostRefreshingRef.current) {
          setTimeout(() => {
            try {
              if (activeTvDeckRef.current === deck && event.target && typeof event.target.playVideo === 'function') {
                event.target.playVideo();
              }
            } catch (e) {}
          }, 150);
        }
      }
    };

    const handleDeckError = (deck, event) => {
      console.warn(`[TVDisplay] Error YouTube ${event.data} en Deck ${deck}`);
      isBufferingRef.current = false;
      if (bufferSafetyTimerRef.current) clearTimeout(bufferSafetyTimerRef.current);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);

      // Ocultar INMEDIATAMENTE el contenedor con error para que la pantalla de YouTube bloqueada nunca se vea
      const errContainer = document.getElementById(deck === 'A' ? 'tv-yt-deck-a' : 'tv-yt-deck-b');
      if (errContainer) {
        errContainer.style.opacity = '0.001';
      }

      // Si el error ocurrió en el deck activo, activar el overlay de carga estilizado mientras se resuelve el reemplazo
      if (activeTvDeckRef.current === deck) {
        setIsLoadingVideo(true);
      }

      // Notificar al anfitrión sin crashear la pantalla
      if (channelRef.current && currentVideoIdRef.current) {
        try {
          channelRef.current.postMessage({ type: 'SLAVE_ERROR', videoId: currentVideoIdRef.current, deck });
        } catch (e) {}
      }
      if (sbSyncChannelRef.current && sbSyncChannelRef.current.state === 'joined') {
        sbSyncChannelRef.current.send({
          type: 'broadcast',
          event: 'tv_sync',
          payload: { type: 'SLAVE_ERROR', videoId: currentVideoIdRef.current, deck }
        }).catch(() => {});
      }
    };

    playerARef.current = new window.YT.Player('tv-youtube-player-deck-a', {
      height: '100%', width: '100%', playerVars,
      events: {
        onReady: (e) => handleDeckReady('A', e),
        onStateChange: (e) => handleDeckStateChange('A', e),
        onError: (e) => handleDeckError('A', e)
      }
    });

    playerBRef.current = new window.YT.Player('tv-youtube-player-deck-b', {
      height: '100%', width: '100%', playerVars,
      events: {
        onReady: (e) => handleDeckReady('B', e),
        onStateChange: (e) => handleDeckStateChange('B', e),
        onError: (e) => handleDeckError('B', e)
      }
    });
  }

  const handleFsChange = () => {
    setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    }
  };

  // Re-sincronización y reactivación instantánea al volver de otra pestaña
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      if (silentAudioRef.current) {
        silentAudioRef.current.play().catch(() => {});
      }
      if (channelRef.current) channelRef.current.postMessage({ type: 'REQUEST_SYNC' });
      if (sbSyncChannelRef.current && sbSyncChannelRef.current.state === 'joined') {
        sbSyncChannelRef.current.send({ type: 'broadcast', event: 'tv_sync', payload: { type: 'REQUEST_SYNC' } }).catch(() => {});
      }
      if (isHostPlayingRef.current) {
        const activeP = activeTvDeckRef.current === 'A' ? playerARef.current : playerBRef.current;
        if (activeP && typeof activeP.playVideo === 'function') {
          try { activeP.playVideo(); } catch (e) {}
        }
      }
    }
  };

  // Watchdog periódico para revivir la reproducción si el navegador intenta pausarla en segundo plano
  const bgWatchdogInterval = setInterval(() => {
    if (isTvTransitioningRef.current || hostRefreshingRef.current || isBufferingRef.current) return;
    // NUNCA revivir ni despausar si el anfitrión está pausado por el usuario
    if (!isHostPlayingRef.current) return;

    const activeP = activeTvDeckRef.current === 'A' ? playerARef.current : playerBRef.current;
    if (activeP && typeof activeP.getPlayerState === 'function' && currentVideoIdRef.current) {
      const state = activeP.getPlayerState();
      if (state === window.YT.PlayerState.PAUSED) {
        try {
          activeP.playVideo();
        } catch (e) {}
      }
    }
  }, 1200);

  document.addEventListener('fullscreenchange', handleFsChange);
  document.addEventListener('webkitfullscreenchange', handleFsChange);
  document.addEventListener('mozfullscreenchange', handleFsChange);
  document.addEventListener('MSFullscreenChange', handleFsChange);
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    clearInterval(syncRetryInterval);
    clearInterval(bgWatchdogInterval);
    clearTimeout(timeoutId);
    if (channelRef.current) {
      channelRef.current.removeEventListener('message', handleMessage);
      channelRef.current.close();
    }
    if (sbSyncChannelRef.current) {
      supabase.removeChannel(sbSyncChannelRef.current);
    }
    safeDestroyPlayer(playerARef, 'tv-yt-deck-a', 'tv-youtube-player-deck-a');
    safeDestroyPlayer(playerBRef, 'tv-yt-deck-b', 'tv-youtube-player-deck-b');
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    if (bufferSafetyTimerRef.current) clearTimeout(bufferSafetyTimerRef.current);
    if (tvTransitionTimerRef.current) clearTimeout(tvTransitionTimerRef.current);
    if (tvVolIntervalRef.current) clearInterval(tvVolIntervalRef.current);

    document.removeEventListener('fullscreenchange', handleFsChange);
    document.removeEventListener('webkitfullscreenchange', handleFsChange);
    document.removeEventListener('mozfullscreenchange', handleFsChange);
    document.removeEventListener('MSFullscreenChange', handleFsChange);
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}, [sessionId]);

// ── handlePreloadStandby: precarga silenciosa en el deck de reserva de la TV ──
const handlePreloadStandby = (data) => {
  if (!data?.nextVideoId || isTvTransitioningRef.current) return;
  const standbyDeck = activeTvDeckRef.current === 'A' ? 'B' : 'A';
  const standbyPlayer = standbyDeck === 'A' ? playerARef.current : playerBRef.current;
  const standbyContainer = document.getElementById(standbyDeck === 'A' ? 'tv-yt-deck-a' : 'tv-yt-deck-b');

  if (standbyContainer) {
    standbyContainer.style.opacity = '0.001';
    standbyContainer.style.zIndex = '1';
  }

  if (standbyPlayer && typeof standbyPlayer.loadVideoById === 'function') {
    try {
      if (typeof standbyPlayer.mute === 'function') standbyPlayer.mute();
      disableCaptions(standbyPlayer);
      standbyPlayer.loadVideoById({
        videoId: data.nextVideoId,
        startSeconds: 0,
        suggestedQuality: 'small'
      });
      setTimeout(() => {
        try {
          if (standbyPlayer && typeof standbyPlayer.pauseVideo === 'function' && !isTvTransitioningRef.current) {
            standbyPlayer.pauseVideo();
          }
        } catch (e) {}
      }, 350);
    } catch (e) {}
  }
};
handlePreloadStandbyRef.current = handlePreloadStandby;

// ── handleTransitionStart: crossfade entre decks en pantalla esclava ──
const handleTransitionStart = (data) => {
  if (!data?.nextVideoId) return;

  if (tvTransitionTimerRef.current) clearTimeout(tvTransitionTimerRef.current);
  if (tvVolIntervalRef.current) clearInterval(tvVolIntervalRef.current);

  isTvTransitioningRef.current = true;
  isBufferingRef.current = true;
  currentVideoIdRef.current = data.nextVideoId;
  setCurrentVideoId(data.nextVideoId);

  const outgoingDeck = activeTvDeckRef.current;
  const incomingDeck = outgoingDeck === 'A' ? 'B' : 'A';

  const outgoingPlayer = outgoingDeck === 'A' ? playerARef.current : playerBRef.current;
  const incomingPlayer = incomingDeck === 'A' ? playerARef.current : playerBRef.current;

  const outgoingContainer = document.getElementById(outgoingDeck === 'A' ? 'tv-yt-deck-a' : 'tv-yt-deck-b');
  const incomingContainer = document.getElementById(incomingDeck === 'A' ? 'tv-yt-deck-a' : 'tv-yt-deck-b');

  if (!incomingPlayer) {
    isTvTransitioningRef.current = false;
    isBufferingRef.current = false;
    return;
  }
  const durationSec = data.durationSec || 5;
  const chosenEffect = data.effect || 'fade';
  const transitionMs = Math.max(2500, Math.floor(durationSec * 1000));

  // 1. Cargar y arrancar el video entrante en el Deck en Standby en segundo plano con Audio Handshake
  try {
    if (tvWithSoundRef.current) {
      if (typeof incomingPlayer.unMute === 'function') incomingPlayer.unMute();
      if (typeof incomingPlayer.setVolume === 'function') incomingPlayer.setVolume(1);
    } else {
      if (typeof incomingPlayer.mute === 'function') incomingPlayer.mute();
    }
    disableCaptions(incomingPlayer);
    incomingPlayer.loadVideoById({ videoId: data.nextVideoId, startSeconds: 0, suggestedQuality: 'hd1080' });
    incomingPlayer.playVideo();
  } catch (e) { }

  // 2. Transición visual simultánea en pantalla
  const animDuration = chosenEffect === 'cut' ? 0.2 : durationSec;

  if (incomingContainer) {
    incomingContainer.style.zIndex = '3';
    incomingContainer.style.opacity = '0.001';
    incomingContainer.style.transform = 'scale(1.02) translateZ(0)';
    incomingContainer.style.transition = `opacity ${animDuration * 0.9}s ease, transform ${animDuration * 0.9}s ease`;
  }

  if (outgoingContainer) {
    outgoingContainer.style.zIndex = '2';
    outgoingContainer.style.transition = `opacity ${animDuration * 0.8}s ease, transform ${animDuration * 0.8}s ease, filter ${animDuration * 0.8}s ease`;
    if (chosenEffect === 'brake') {
      outgoingContainer.style.transform = 'rotate(-6deg) scale(0.95) translateZ(0)';
      outgoingContainer.style.filter = 'brightness(0.6) grayscale(0.3)';
    } else if (chosenEffect === 'start') {
      outgoingContainer.style.transform = 'rotate(8deg) scale(1.05) translateZ(0)';
      outgoingContainer.style.filter = 'brightness(1.2)';
    } else if (chosenEffect === 'echo') {
      outgoingContainer.style.transform = 'scale(1.08) translateZ(0)';
      outgoingContainer.style.filter = 'blur(6px) brightness(0.8)';
    } else if (chosenEffect === 'cut') {
      outgoingContainer.style.filter = 'none';
      outgoingContainer.style.transform = 'translateZ(0)';
    } else {
      outgoingContainer.style.filter = 'none';
      outgoingContainer.style.transform = 'translateZ(0)';
    }
    outgoingContainer.style.opacity = '0.001';
  }

  // 3. Rampa de volumen suave si la TV tiene sonido activado
  if (tvWithSoundRef.current) {
    const steps = 15;
    const stepTime = transitionMs / steps;
    let step = 0;
    tvVolIntervalRef.current = setInterval(() => {
      step++;
      const ratio = step / steps;
      try {
        if (outgoingPlayer && typeof outgoingPlayer.setVolume === 'function') outgoingPlayer.setVolume(Math.max(0, Math.floor(100 * (1 - ratio))));
        if (incomingPlayer && typeof incomingPlayer.setVolume === 'function') incomingPlayer.setVolume(Math.min(100, Math.floor(100 * ratio)));
      } catch (e) { }
      if (step >= steps) {
        clearInterval(tvVolIntervalRef.current);
        tvVolIntervalRef.current = null;
      }
    }, stepTime);
  }

  // 4. Consolidar cambio de deck en la TV al finalizar la mezcla
  tvTransitionTimerRef.current = setTimeout(() => {
    activeTvDeckRef.current = incomingDeck;
    isTvTransitioningRef.current = false;
    isBufferingRef.current = false;
    tvTransitionTimerRef.current = null;

    try {
      if (outgoingPlayer && typeof outgoingPlayer.pauseVideo === 'function') {
        outgoingPlayer.pauseVideo();
      }
    } catch (e) { }

    if (outgoingContainer) {
      outgoingContainer.style.transform = 'translateZ(0)';
      outgoingContainer.style.filter = 'none';
      outgoingContainer.style.opacity = '0.001';
      outgoingContainer.style.zIndex = '1';
    }

    if (incomingContainer) {
      incomingContainer.style.transform = 'translateZ(0)';
      incomingContainer.style.filter = 'none';
      incomingContainer.style.zIndex = '2';
    }
  }, transitionMs);
};
handleTransitionStartRef.current = handleTransitionStart;

// ── handleSync: sincronización de reproducción con el anfitrión ──
const handleSync = (data) => {
  // Bloquear sincronización durante transiciones DJ para evitar interferencias
  if (isTvTransitioningRef.current) return;

  lastHostSyncTimeRef.current = Date.now();

  const activeP = activeTvDeckRef.current === 'A' ? playerARef.current : playerBRef.current;
  if (!activeP || typeof activeP.getPlayerState !== 'function') {
    if (data?.videoId) {
      pendingSyncRef.current = data;
    }
    return;
  }

  try {
    if (hostRefreshingRef.current && data.videoId) {
      hostRefreshingRef.current = false;
    }

    // Si el anfitrión no tiene canción en reproducción (cola vacía o reproductor detenido)
    if (data && data.videoId === null) {
      if (typeof activeP.pauseVideo === 'function') {
        try { activeP.pauseVideo(); } catch (e) {}
      }
      const cA = document.getElementById('tv-yt-deck-a');
      const cB = document.getElementById('tv-yt-deck-b');
      if (cA) cA.style.opacity = '0.001';
      if (cB) cB.style.opacity = '0.001';
      currentVideoIdRef.current = null;
      setCurrentVideoId(null);
      setStatus(t('tv.waiting_realtime') || 'Esperando canciones...');
      return;
    }

    // ── 1. Cambio de Video (Track Nuevo) ──
    if (data.videoId) {
      const isNewTrack = data.videoId !== currentVideoIdRef.current;

      if (isNewTrack) {
        currentVideoIdRef.current = data.videoId;
        setCurrentVideoId(data.videoId);
        setStatus('');
        isBufferingRef.current = true;
        trackStartedAtRef.current = Date.now();
        lastSeekTimeRef.current = Date.now();

        if (bufferSafetyTimerRef.current) clearTimeout(bufferSafetyTimerRef.current);
        bufferSafetyTimerRef.current = setTimeout(() => {
          isBufferingRef.current = false;
        }, 6000);

        setIsLoadingVideo(true);

        const start = data.time ? data.time + 0.1 : 0;
        const cActive = document.getElementById(activeTvDeckRef.current === 'A' ? 'tv-yt-deck-a' : 'tv-yt-deck-b');
        if (cActive) {
          cActive.style.zIndex = '2';
        }

        activeP.loadVideoById({ videoId: data.videoId, startSeconds: start, suggestedQuality: 'hd1080' });
        if (data.isPlaying && typeof activeP.playVideo === 'function') {
          try { activeP.playVideo(); } catch (e) {}
        }
        return;
      }
    }

    // Si aún está en búfer inicial, no interferir con seeks ni pausas prematuras
    if (isBufferingRef.current) return;

    const playerState = activeP.getPlayerState();
    const isCurrentlyPlaying = playerState === window.YT.PlayerState.PLAYING;
    const isCurrentlyPaused = playerState === window.YT.PlayerState.PAUSED;

    // ── 2. Corrección Suave de Deriva de Tiempo y Recuperación de Segundo Plano ──
    if (typeof data.time === 'number' && data.videoId === currentVideoIdRef.current) {
      const isEnded = playerState === window.YT.PlayerState.ENDED;
      const duration = activeP.getDuration() || 0;

      const transitDelay = (data.sentAt && data.sentAt > 0)
        ? Math.max(0, Math.min(2.0, (Date.now() - data.sentAt) / 1000))
        : 0;
      const targetTime = data.time + (data.isPlaying ? transitDelay : 0);
      const currentTime = activeP.getCurrentTime() || 0;
      const diff = targetTime - currentTime;
      const timeSinceTrackStart = Date.now() - trackStartedAtRef.current;
      const timeSinceLastSeek = Date.now() - lastSeekTimeRef.current;

      // Si la pestaña estuvo en segundo plano y se quedó atrás (> 1.2s), saltar inmediatamente al tiempo real
      if (Math.abs(diff) > 1.2 && timeSinceTrackStart > 2000 && timeSinceLastSeek > 1500) {
        lastSeekTimeRef.current = Date.now();
        activeP.seekTo(targetTime, true);
        if (typeof activeP.setPlaybackRate === 'function') activeP.setPlaybackRate(1.0);
        if (data.isPlaying && typeof activeP.playVideo === 'function') {
          try { activeP.playVideo(); } catch (e) {}
        }
      } else if (isCurrentlyPlaying) {
        let targetRate = 1.0;
        if ((isEnded || (duration > 0 && duration - currentTime < 3)) && data.time > duration - 10) {
          targetRate = 1.0;
        } else if (diff > 0.35) {
          targetRate = 1.1;
        } else if (diff > 0.1) {
          targetRate = 1.04;
        } else if (diff < -0.35) {
          targetRate = 0.9;
        } else if (diff < -0.1) {
          targetRate = 0.96;
        } else {
          targetRate = 1.0;
        }

        // Evitar llamar setPlaybackRate repetidamente cada 500ms si la velocidad ya es la deseada
        if (typeof activeP.getPlaybackRate === 'function' && typeof activeP.setPlaybackRate === 'function') {
          try {
            const currentRate = activeP.getPlaybackRate();
            if (currentRate !== targetRate) {
              activeP.setPlaybackRate(targetRate);
            }
          } catch (e) {}
        }
      }
    }

    // ── 3. Sincronización de Estado Play / Pause ──
    if (typeof data.isPlaying === 'boolean') {
      isHostPlayingRef.current = data.isPlaying;
      if (!data.isPlaying && isCurrentlyPlaying) {
        activeP.pauseVideo();
      } else if (data.isPlaying && !isCurrentlyPlaying) {
        activeP.playVideo();
      }
    }
  } catch (err) {
    console.warn('Error en handleSync de TV:', err);
  }
};
handleSyncRef.current = handleSync;

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

  const handleUnpair = async () => {
    const currentPin = tvPin || localStorage.getItem('bq-tv-pin');
    const currentSessId = sessionId || localStorage.getItem('bq-tv-session-id');

    // 1. Notificar al anfitrión por BroadcastChannel local aislado (si está en la misma PC)
    try {
      const localChannel = new BroadcastChannel(currentSessId ? `envairo_tv_sync_${currentSessId}` : 'envairo_tv_sync');
      localChannel.postMessage({ type: 'SLAVE_UNPAIRED', tvId: currentPin });
      setTimeout(() => localChannel.close(), 100);
    } catch (e) {}

    // 2. Notificar al anfitrión por Supabase Realtime (si es una Smart TV remota)
    if (currentSessId && currentPin) {
      try {
        const syncChannel = supabase.channel(`tv-sync-${currentSessId}`);
        await syncChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await syncChannel.send({
              type: 'broadcast',
              event: 'tv_sync',
              payload: { type: 'SLAVE_UNPAIRED', tvId: currentPin, sentAt: Date.now() }
            });
            setTimeout(() => supabase.removeChannel(syncChannel), 300);
          }
        });
      } catch (e) {}
    }

    safeDestroyPlayer(playerARef, 'tv-yt-deck-a', 'tv-youtube-player-deck-a');
    safeDestroyPlayer(playerBRef, 'tv-yt-deck-b', 'tv-youtube-player-deck-b');
    localStorage.removeItem('bq-tv-session-id');
    localStorage.removeItem('bq-tv-pin');
    setSessionId(null);
    setCurrentVideoId(null);
    currentVideoIdRef.current = null;
    setStatus(t('tv.checking_availability'));
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
      onDoubleClick={toggleFullscreen}
    >
      {/* 1. Contenedores permanentes de reproductores YouTube (Deck A y Deck B - Doble Buffer) */}
      <div
        id="tv-yt-deck-a"
        className={`absolute inset-0 z-[2] flex items-center justify-center bg-black transition-opacity duration-1000 ease-in-out ${!sessionId ? 'pointer-events-none opacity-0' : ''}`}
        style={{ width: '100vw', height: '100vh', opacity: 0.001 }}
      >
        <div id="tv-youtube-player-deck-a"></div>
      </div>

      <div
        id="tv-yt-deck-b"
        className={`absolute inset-0 z-[1] flex items-center justify-center bg-black transition-opacity duration-1000 ease-in-out ${!sessionId ? 'pointer-events-none opacity-0' : ''}`}
        style={{ width: '100vw', height: '100vh', opacity: 0.001 }}
      >
        <div id="tv-youtube-player-deck-b"></div>
      </div>

      {/* Overlay de transición con nota musical animada (evita pantalla en negro y preserva pantalla completa) */}
      {sessionId && isLoadingVideo && (
        <div className="absolute inset-0 z-[5] bg-[#0c0914] flex flex-col items-center justify-center gap-4 transition-opacity duration-300 animate-fade-in pointer-events-none select-none">
          <div className="relative flex items-center justify-center w-28 h-28 rounded-full bg-accent/15 border-2 border-accent/40 shadow-[0_0_50px_rgba(157,78,221,0.35)]">
            <Music2 size={48} className="text-accent animate-pulse" />
          </div>
          <p className="text-white/80 font-medium text-lg tracking-wide uppercase">{t('tv.loading')}</p>
        </div>
      )}

      {/* Click-blocking & Fullscreen Double-Click overlay */}
      <div className="absolute inset-0 z-10 cursor-default" onDoubleClick={toggleFullscreen}></div>

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

            {/* Tarjeta de Vinculación por PIN */}
            <div className="flex flex-col items-center bg-bg-elevated/80 border border-white/10 p-8 sm:p-10 rounded-3xl backdrop-blur-xl shadow-2xl w-full max-w-lg space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent shadow-glow-sm">
                <Tv size={36} />
              </div>

              <div className="space-y-2 text-center w-full">
                <span className="text-xs font-bold text-accent uppercase tracking-widest">
                  {t('tv.or_enter_pin')}
                </span>
                <div className="bg-black/60 border border-white/15 rounded-2xl px-6 py-4 font-mono text-4xl sm:text-5xl font-black text-white tracking-widest shadow-inner w-full text-center flex items-center justify-center select-all">
                  {tvPin.slice(0, 3)} - {tvPin.slice(3)}
                </div>
              </div>

              <p className="text-xs text-text-muted text-center leading-relaxed max-w-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(t('tv.pin_instructions')) }} />
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
