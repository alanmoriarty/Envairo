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
  const playerRef = useRef(null);
  const pendingSyncRef = useRef(null);
  const isTvTransitioningRef = useRef(false);
  const tvTransitionTimerRef = useRef(null);
  const [transitionEffect, setTransitionEffect] = useState('Transición DJ');

  // Refs to always call the latest version of these handlers from useEffect listeners
  const handleSyncRef = useRef(null);
  const handleTransitionStartRef = useRef(null);

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
  const activeTvs = useRef(new Set());
  const idleTimerRef = useRef(null);
  const currentVideoIdRef = useRef(null);
  const isBufferingRef = useRef(false);
  const bufferSafetyTimerRef = useRef(null);
  const [isCurtainVisible, setIsCurtainVisible] = useState(false);
  const hostRefreshingRef = useRef(false);
  const trackStartedAtRef = useRef(0);
  const lastSeekTimeRef = useRef(0);

  // 1. Escuchar canal de emparejamiento SIEMPRE
  useEffect(() => {
    const pairChannel = supabase.channel(`tv-pair-${tvPin}`);

    pairChannel
      .on('broadcast', { event: 'pairing_result' }, (e) => {
        if (e.payload?.type === 'PAIRED' && e.payload.sessionId) {
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
          safeDestroyPlayer(playerRef, 'tv-yt-container', 'tv-youtube-player');
          localStorage.removeItem('bq-tv-session-id');
          localStorage.removeItem('bq-tv-sound');
          setSessionId(null);
          setCurrentVideoId(null);
          currentVideoIdRef.current = null;
          setStatus(t('tv.checking_availability'));
        }
      })
      .on('broadcast', { event: 'tv_ping' }, (e) => {
        if (e.payload?.senderId !== tvPin) {
          activeTvs.current.add(e.payload?.senderId);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(pairChannel);
    };
  }, [tvPin, t]);

  // 2. Escuchar canal de sincronización cuando hay sessionId activo
  useEffect(() => {
    if (!sessionId) {
      setIsCheckingLimit(false);
      return;
    }

    // 2.a. BroadcastChannel Local (mismo navegador / pantalla dividida)
    channelRef.current = new BroadcastChannel(`envairo_tv_sync_${sessionId}`);
    
    const handleMessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'DJ_TRANSITION_START') {
        if (handleTransitionStartRef.current) handleTransitionStartRef.current(data);
      } else if (data.type === 'SYNC') {
        if (handleSyncRef.current) handleSyncRef.current(data);
      } else if (data.type === 'REQUEST_SYNC_FORCE') {
        hostRefreshingRef.current = true;
        if (channelRef.current) channelRef.current.postMessage({ type: 'REQUEST_SYNC' });
        if (sbSyncChannelRef.current && sbSyncChannelRef.current.state === 'joined') {
          sbSyncChannelRef.current.send({ type: 'broadcast', event: 'tv_sync', payload: { type: 'REQUEST_SYNC' } }).catch(() => {});
        }
      } else if (data.type === 'UNPAIR_ALL' || (data.type === 'UNPAIR_SPECIFIC' && data.tvId === tvPin)) {
        handleUnpair();
      }
    };

    channelRef.current.addEventListener('message', handleMessage);

    // 2.b. Supabase Realtime Broadcast (Smart TVs / Navegadores Remotos)
    sbSyncChannelRef.current = supabase.channel(`tv-sync-${sessionId}`);
    sbSyncChannelRef.current
      .on('broadcast', { event: 'tv_sync' }, (e) => {
        const data = e.payload;
        if (!data) return;
        if (data.type === 'DJ_TRANSITION_START') {
          if (handleTransitionStartRef.current) handleTransitionStartRef.current(data);
        } else if (data.type === 'SYNC') {
          if (handleSyncRef.current) handleSyncRef.current(data);
        } else if (data.type === 'REQUEST_SYNC_FORCE') {
          hostRefreshingRef.current = true;
          if (channelRef.current) channelRef.current.postMessage({ type: 'REQUEST_SYNC' });
          if (sbSyncChannelRef.current && sbSyncChannelRef.current.state === 'joined') {
            sbSyncChannelRef.current.send({ type: 'broadcast', event: 'tv_sync', payload: { type: 'REQUEST_SYNC' } }).catch(() => {});
          }
        } else if (data.type === 'UNPAIR_ALL' || (data.type === 'UNPAIR_SPECIFIC' && data.tvId === tvPin)) {
          handleUnpair();
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setTimeout(() => {
            if (channelRef.current) channelRef.current.postMessage({ type: 'REQUEST_SYNC' });
            if (sbSyncChannelRef.current && sbSyncChannelRef.current.state === 'joined') {
              sbSyncChannelRef.current.send({ type: 'broadcast', event: 'tv_sync', payload: { type: 'REQUEST_SYNC' } }).catch(() => {});
            }
          }, 300);
        }
      });

    // Reintentos de sincronización inicial
    let syncAttempts = 0;
    const syncRetryInterval = setInterval(() => {
      if (!currentVideoIdRef.current && syncAttempts < 10) {
        syncAttempts++;
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

    const timeoutId = setTimeout(() => {
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
    }, 500);

    function initPlayer() {
      if (playerRef.current) return;

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

      const handlePlayerReady = (event) => {
        if (tvWithSoundRef.current) {
          try { event.target.unMute(); event.target.setVolume(100); } catch (e) {}
        } else {
          try { event.target.mute(); } catch (e) {}
        }
        disableCaptions(event.target);

        if (pendingSyncRef.current) {
          const syncData = pendingSyncRef.current;
          pendingSyncRef.current = null;
          if (handleSyncRef.current) handleSyncRef.current(syncData);
        }
        if (channelRef.current) channelRef.current.postMessage({ type: 'REQUEST_SYNC' });
        if (sbSyncChannelRef.current && sbSyncChannelRef.current.state === 'joined') {
          sbSyncChannelRef.current.send({ type: 'broadcast', event: 'tv_sync', payload: { type: 'REQUEST_SYNC' } }).catch(() => {});
        }
      };

      const handlePlayerStateChange = (event) => {
        if (tvWithSoundRef.current) {
          try { event.target.unMute(); event.target.setVolume(100); } catch (e) {}
        } else {
          try { event.target.mute(); } catch (e) {}
        }
        disableCaptions(event.target);

        if (event.data === window.YT.PlayerState.PLAYING) {
          isBufferingRef.current = false;
          if (bufferSafetyTimerRef.current) clearTimeout(bufferSafetyTimerRef.current);
          setIsCurtainVisible(false);
          isTvTransitioningRef.current = false;
        }
      };

      const handlePlayerError = (event) => {
        console.warn(`[TVDisplay] Error YouTube ${event.data} en Master TV Player`);
        isBufferingRef.current = false;
        if (bufferSafetyTimerRef.current) clearTimeout(bufferSafetyTimerRef.current);
        setIsCurtainVisible(false);
        if (channelRef.current && currentVideoIdRef.current) {
          try {
            channelRef.current.postMessage({ type: 'SLAVE_ERROR', videoId: currentVideoIdRef.current });
          } catch (e) {}
        }
      };

      playerRef.current = new window.YT.Player('tv-youtube-player', {
        height: '100%', width: '100%', playerVars,
        events: {
          onReady: handlePlayerReady,
          onStateChange: handlePlayerStateChange,
          onError: handlePlayerError
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

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    document.addEventListener('MSFullscreenChange', handleFsChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(syncRetryInterval);
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
      if (bufferSafetyTimerRef.current) clearTimeout(bufferSafetyTimerRef.current);
      if (tvTransitionTimerRef.current) clearTimeout(tvTransitionTimerRef.current);

      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
      document.removeEventListener('MSFullscreenChange', handleFsChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sessionId]);

  // ── handleTransitionStart: Cortina cinemática y cambio fluido en TV ──
  const handleTransitionStart = (data) => {
    if (!data?.nextVideoId) return;

    if (tvTransitionTimerRef.current) clearTimeout(tvTransitionTimerRef.current);

    isTvTransitioningRef.current = true;
    isBufferingRef.current = true;
    currentVideoIdRef.current = data.nextVideoId;
    setCurrentVideoId(data.nextVideoId);

    const chosenEffect = data.effect || 'fade';
    setTransitionEffect(`Transición DJ: ${chosenEffect.toUpperCase()}`);
    setIsCurtainVisible(true);

    const p = playerRef.current;
    if (!p) {
      isTvTransitioningRef.current = false;
      isBufferingRef.current = false;
      return;
    }

    try {
      if (tvWithSoundRef.current) {
        if (typeof p.unMute === 'function') p.unMute();
      } else {
        if (typeof p.mute === 'function') p.mute();
      }
      disableCaptions(p);
      p.loadVideoById({ videoId: data.nextVideoId, startSeconds: 0, suggestedQuality: 'hd1080' });
      p.playVideo();
    } catch (e) { }

    const durationSec = data.durationSec || 5;
    const transitionMs = Math.max(2500, Math.floor(durationSec * 1000));

    tvTransitionTimerRef.current = setTimeout(() => {
      setIsCurtainVisible(false);
      isTvTransitioningRef.current = false;
      isBufferingRef.current = false;
      tvTransitionTimerRef.current = null;
    }, transitionMs);
  };
  handleTransitionStartRef.current = handleTransitionStart;

  // ── handleSync: sincronización de reproducción con el anfitrión ──
  const handleSync = (data) => {
    if (isTvTransitioningRef.current) return;

    const p = playerRef.current;
    if (!p || typeof p.getPlayerState !== 'function') {
      if (data?.videoId) {
        pendingSyncRef.current = data;
      }
      return;
    }

    try {
      if (hostRefreshingRef.current && data.videoId) {
        hostRefreshingRef.current = false;
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

          setTransitionEffect('Cargando pista...');
          setIsCurtainVisible(true);

          const start = data.time ? data.time + 0.1 : 0;
          p.loadVideoById({ videoId: data.videoId, startSeconds: start, suggestedQuality: 'hd1080' });
          if (data.isPlaying && typeof p.playVideo === 'function') {
            try { p.playVideo(); } catch (e) {}
          }
          return;
        }
      }

      if (isBufferingRef.current) return;

      const playerState = p.getPlayerState();
      const isCurrentlyPlaying = playerState === window.YT.PlayerState.PLAYING;
      const isCurrentlyPaused = playerState === window.YT.PlayerState.PAUSED;

      // ── 2. Corrección Suave de Deriva de Tiempo ──
      if (typeof data.time === 'number' && data.videoId === currentVideoIdRef.current && isCurrentlyPlaying) {
        const isEnded = playerState === window.YT.PlayerState.ENDED;
        const duration = p.getDuration() || 0;

        const transitDelay = (data.sentAt && data.sentAt > 0)
          ? Math.max(0, Math.min(2.0, (Date.now() - data.sentAt) / 1000))
          : 0;
        const targetTime = data.time + (data.isPlaying ? transitDelay : 0);
        const currentTime = p.getCurrentTime() || 0;
        const diff = targetTime - currentTime;
        const timeSinceTrackStart = Date.now() - trackStartedAtRef.current;
        const timeSinceLastSeek = Date.now() - lastSeekTimeRef.current;

        let targetRate = 1.0;
        if ((isEnded || (duration > 0 && duration - currentTime < 3)) && data.time > duration - 10) {
          targetRate = 1.0;
        } else if (Math.abs(diff) > 4.0 && timeSinceTrackStart > 8000 && timeSinceLastSeek > 4000) {
          lastSeekTimeRef.current = Date.now();
          p.seekTo(targetTime, true);
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

        if (typeof p.getPlaybackRate === 'function' && typeof p.setPlaybackRate === 'function') {
          try {
            const currentRate = p.getPlaybackRate();
            if (currentRate !== targetRate) {
              p.setPlaybackRate(targetRate);
            }
          } catch (e) {}
        }
      }

      // ── 3. Sincronización de Estado Play / Pause ──
      if (typeof data.isPlaying === 'boolean') {
        const timeSinceTrackStart = Date.now() - trackStartedAtRef.current;
        if (!data.isPlaying && isCurrentlyPlaying && timeSinceTrackStart > 5000) {
          p.pauseVideo();
        } else if (data.isPlaying && isCurrentlyPaused) {
          p.playVideo();
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
      if (docElm.requestFullscreen) docElm.requestFullscreen();
      else if (docElm.webkitRequestFullscreen) docElm.webkitRequestFullscreen();
      else if (docElm.mozRequestFullScreen) docElm.mozRequestFullScreen();
      else if (docElm.msRequestFullscreen) docElm.msRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    }
  };

  const handleUnpair = async () => {
    const currentPin = tvPin || localStorage.getItem('bq-tv-pin');
    const currentSessId = sessionId || localStorage.getItem('bq-tv-session-id');

    try {
      const localChannel = new BroadcastChannel(currentSessId ? `envairo_tv_sync_${currentSessId}` : 'envairo_tv_sync');
      localChannel.postMessage({ type: 'SLAVE_UNPAIRED', tvId: currentPin });
      setTimeout(() => localChannel.close(), 100);
    } catch (e) {}

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

    safeDestroyPlayer(playerRef, 'tv-yt-container', 'tv-youtube-player');
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
      {/* 1. Contenedor Maestro YouTube TV */}
      <div
        id="tv-yt-container"
        className={`absolute inset-0 z-[2] flex items-center justify-center bg-black ${!sessionId ? 'pointer-events-none opacity-0' : ''}`}
        style={{ width: '100vw', height: '100vh' }}
      >
        <div id="tv-youtube-player"></div>
      </div>

      {/* 2. Cortina Cinemática de Transición TV (Cubre el cambio de video sin cuadro negro ni spinner) */}
      <div
        className={`absolute inset-0 z-[6] flex flex-col items-center justify-center gap-5 transition-all duration-500 pointer-events-none select-none ${
          isCurtainVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'
        }`}
        style={{
          background: 'radial-gradient(circle at center, rgba(30,15,45,0.96) 0%, rgba(8,4,14,0.98) 100%)',
          backdropFilter: 'blur(20px)'
        }}
      >
        <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-accent/20 border-2 border-accent/50 shadow-[0_0_50px_rgba(157,78,221,0.4)]">
          <Music2 size={40} className="text-accent animate-pulse" />
        </div>
        <div className="px-5 py-2 rounded-full bg-white/10 border border-white/20 text-white font-bold text-sm tracking-widest uppercase shadow-lg">
          {transitionEffect}
        </div>
      </div>

      {/* Click-blocking & Fullscreen Double-Click overlay */}
      <div className="absolute inset-0 z-10 cursor-default" onDoubleClick={toggleFullscreen}></div>

      {/* Modo Sin Emparejar (Pantalla de Vinculación con QR y PIN) */}
      {!sessionId && (
        <div className="absolute inset-0 z-40 bg-bg-card flex flex-col items-center justify-center p-8 select-none text-white overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none"></div>

          <div className="relative z-10 flex flex-col items-center max-w-2xl w-full text-center space-y-8 animate-fade-in">
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-3 rounded-full backdrop-blur-md">
              <Tv size={24} className="text-accent" />
              <span className="text-sm font-semibold tracking-wider uppercase text-text-muted">envAIro TV Display</span>
            </div>

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
