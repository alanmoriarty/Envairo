import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';

export function useYouTubeSDK() {
  const { setYoutubePlayer, playbackEngine, setIsPlaying, setProgress, setDuration, setCurrentTrack, currentTrack } = usePlayerStore();
  const player1Ref = useRef(null);
  const player2Ref = useRef(null);
  const activePlayerIndex = useRef(1); // 1 o 2
  const isTransitioning = useRef(false);
  
  const currentYtIdRef = useRef(null);
  const [ytReady, setYtReady] = useState(false);
  const progressInterval = useRef(null);
  const { visualizerEnabled, youtubeNativeCast } = useSettingsStore();

  const getActivePlayer = () => activePlayerIndex.current === 1 ? player1Ref.current : player2Ref.current;
  const getBufferPlayer = () => activePlayerIndex.current === 1 ? player2Ref.current : player1Ref.current;

  const applyStyles = (wrapper, isVis, isFs) => {
    if (!wrapper) return;

    const currentTrack = usePlayerStore.getState().currentTrack;

    if (isFs) {
      wrapper.style.top = '50%';
      wrapper.style.left = '50%';
      wrapper.style.width = '100vw';
      wrapper.style.height = '56.25vw';
      wrapper.style.minHeight = '100vh';
      wrapper.style.minWidth = '177.77vh';
      wrapper.style.transform = 'translate(-50%, -50%)';
      wrapper.style.borderRadius = '0';
      wrapper.style.boxShadow = 'none';
      wrapper.style.opacity = wrapper.dataset.errorHidden === 'true' ? '0' : '1';
      wrapper.style.zIndex = '9999';
      wrapper.style.filter = 'none';
      wrapper.style.pointerEvents = 'auto';
    } else if (isVis) {
      wrapper.style.top = 'auto';
      wrapper.style.left = 'auto';
      wrapper.style.right = '16px';
      wrapper.style.bottom = '80px'; // Above footer player
      wrapper.style.width = '160px';
      wrapper.style.height = '90px';
      wrapper.style.minHeight = '0';
      wrapper.style.minWidth = '0';
      wrapper.style.transform = 'none';
      wrapper.style.borderRadius = '12px';
      wrapper.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
      wrapper.style.opacity = currentTrack ? '0.6' : '0';
      wrapper.style.zIndex = '40';
      wrapper.style.filter = 'none';
      wrapper.style.pointerEvents = 'none';
    } else {
      wrapper.style.top = '50%';
      wrapper.style.left = '50%';
      wrapper.style.width = '100vw';
      wrapper.style.height = '56.25vw';
      wrapper.style.minHeight = '100vh';
      wrapper.style.minWidth = '177.77vh';
      wrapper.style.transform = 'translate(-50%, -50%)';
      wrapper.style.borderRadius = '0';
      wrapper.style.boxShadow = 'none';
      wrapper.style.opacity = (currentTrack && wrapper.dataset.errorHidden !== 'true') ? '0.5' : '0';
      wrapper.style.zIndex = '-1';
      wrapper.style.filter = 'blur(4px) saturate(1.5)';
      wrapper.style.pointerEvents = 'none';
    }
  };

  useEffect(() => {
    const wrapper = document.getElementById('youtube-wrapper');
    const isFs = document.fullscreenElement === wrapper;
    applyStyles(wrapper, visualizerEnabled, isFs);
  }, [visualizerEnabled, currentTrack]);

  useEffect(() => {
    if (playbackEngine !== 'youtube') return;

    const loadYouTubeAPI = () => {
      if (window.YT && window.YT.Player) {
        initPlayers();
        return;
      }

      window.onYouTubeIframeAPIReady = initPlayers;

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.body.appendChild(script);
    };

    const initPlayers = () => {
      if (player1Ref.current && player2Ref.current) return;

      const wrapper = document.createElement('div');
      wrapper.id = 'youtube-wrapper';
      wrapper.style.position = 'fixed';
      wrapper.style.overflow = 'hidden';
      applyStyles(wrapper, useSettingsStore.getState().visualizerEnabled, false);
      document.body.appendChild(wrapper);

      // Reproductor 1 (Activo por defecto)
      const container1 = document.createElement('div');
      container1.id = 'yt-container-1';
      container1.style.position = 'absolute';
      container1.style.inset = '0';
      container1.style.opacity = '1';
      container1.style.transition = 'opacity 0.8s ease-in-out';
      container1.style.zIndex = '2';
      wrapper.appendChild(container1);
      
      const target1 = document.createElement('div');
      target1.id = 'youtube-player-target-1';
      container1.appendChild(target1);

      // Reproductor 2 (Búfer por defecto)
      const container2 = document.createElement('div');
      container2.id = 'yt-container-2';
      container2.style.position = 'absolute';
      container2.style.inset = '0';
      container2.style.opacity = '0';
      container2.style.transition = 'opacity 0.8s ease-in-out';
      container2.style.zIndex = '1';
      wrapper.appendChild(container2);
      
      const target2 = document.createElement('div');
      target2.id = 'youtube-player-target-2';
      container2.appendChild(target2);

      // Overlay to capture clicks
      const overlay = document.createElement('div');
      overlay.id = 'youtube-overlay';
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.zIndex = '10';
      overlay.style.cursor = 'pointer';
      overlay.style.display = useSettingsStore.getState().youtubeNativeCast ? 'none' : 'block';

      overlay.addEventListener('dblclick', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => { });
        }
      });

      overlay.addEventListener('click', () => {
        if (document.fullscreenElement) {
          const state = usePlayerStore.getState();
          const { sessionId, hostSecret } = useSettingsStore.getState();
          if (state.isPlaying) {
            state.setIsPlaying(false);
            import('../lib/supabase').then(m => m.supabase.rpc('sync_host_config', { p_session_id: sessionId, p_secret: hostSecret, p_updates: { playback_command: { action: 'pause', ts: Date.now() } } }).then());
          } else {
            state.setIsPlaying(true);
            import('../lib/supabase').then(m => m.supabase.rpc('sync_host_config', { p_session_id: sessionId, p_secret: hostSecret, p_updates: { playback_command: { action: 'play', ts: Date.now() } } }).then());
          }
        }
      });
      wrapper.appendChild(overlay);

      // Botón flotante para salir de fullscreen
      const closeBtn = document.createElement('button');
      closeBtn.id = 'youtube-fs-close';
      closeBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '24px';
      closeBtn.style.right = '24px';
      closeBtn.style.zIndex = '20';
      closeBtn.style.background = 'rgba(0,0,0,0.5)';
      closeBtn.style.color = 'white';
      closeBtn.style.border = 'none';
      closeBtn.style.borderRadius = '50%';
      closeBtn.style.width = '44px';
      closeBtn.style.height = '44px';
      closeBtn.style.display = 'none';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.alignItems = 'center';
      closeBtn.style.justifyContent = 'center';

      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => { });
        }
      });
      wrapper.appendChild(closeBtn);

      const handleFsChange = () => {
        const fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        const isVisualizerOn = useSettingsStore.getState().visualizerEnabled;
        const isFs = fsElement === wrapper;
        applyStyles(wrapper, isVisualizerOn, isFs);
        closeBtn.style.display = isFs ? 'flex' : 'none';
      };

      const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
      events.forEach(event => document.addEventListener(event, handleFsChange));
      wrapper._fsListener = handleFsChange;
      wrapper._fsEvents = events;

      // Virtual Player Proxy para usePlayerStore
      const virtualPlayer = {
        playVideo: () => getActivePlayer()?.playVideo(),
        pauseVideo: () => getActivePlayer()?.pauseVideo(),
        seekTo: (s, a) => { getActivePlayer()?.seekTo(s, a); getBufferPlayer()?.seekTo(s, a); },
        setVolume: (v) => { player1Ref.current?.setVolume(v); player2Ref.current?.setVolume(v); },
        getVolume: () => getActivePlayer()?.getVolume(),
        getPlayerState: () => getActivePlayer()?.getPlayerState(),
        getCurrentTime: () => getActivePlayer()?.getCurrentTime(),
        getDuration: () => getActivePlayer()?.getDuration(),
        stopVideo: () => getActivePlayer()?.stopVideo(),
        unloadModule: (m) => getActivePlayer()?.unloadModule(m),
        destroy: () => { player1Ref.current?.destroy(); player2Ref.current?.destroy(); },
        cueVideoById: (args) => getActivePlayer()?.cueVideoById(args),
        
        loadVideoById: (args) => {
          // Evitar recargar si es el mismo video
          if (args.videoId === currentYtIdRef.current && !isTransitioning.current) {
            getActivePlayer()?.seekTo(args.startSeconds || 0, true);
            getActivePlayer()?.playVideo();
            return;
          }
          
          currentYtIdRef.current = args.videoId;

          const activeP = getActivePlayer();
          const bufferP = getBufferPlayer();
          if (!bufferP || !activeP) return;

          // Si el reproductor activo ya está sonando, hacemos crossfade usando el búfer
          const store = usePlayerStore.getState();
          if (activeP.getPlayerState() === window.YT.PlayerState.PLAYING && store.isPlaying) {
            isTransitioning.current = true;
            bufferP.mute(); // Mutear mientras carga
            bufferP.loadVideoById({ videoId: args.videoId, startSeconds: args.startSeconds || 0 });
            // El swap ocurrirá en onStateChange cuando el buffer reporte PLAYING
          } else {
            // Carga normal sin crossfade (ej. primera canción o estaba en pausa)
            activeP.unMute();
            activeP.loadVideoById({ videoId: args.videoId, startSeconds: args.startSeconds || 0 });
          }
        }
      };

      const playerVars = {
        autoplay: 0,
        controls: useSettingsStore.getState().youtubeNativeCast ? 1 : 0,
        disablekb: useSettingsStore.getState().youtubeNativeCast ? 0 : 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        iv_load_policy: 3,
        cc_load_policy: 0, 
        mute: 0,
        origin: window.location.origin
      };

      let readyCount = 0;
      const onReady = (event) => {
        try {
          event.target.unloadModule("captions");
          event.target.unloadModule("cc");
        } catch (e) {}
        
        readyCount++;
        if (readyCount === 2) {
          setYtReady(true);
          const store = usePlayerStore.getState();
          player1Ref.current.setVolume(store.volume);
          player2Ref.current.setVolume(store.volume);
          store.setSdkReady(true);
          store.setDeviceId('youtube-device');
          store.setActiveDeviceId('youtube-device');
          setYoutubePlayer(virtualPlayer);

          // Wait 800ms to ensure the initial DB pull from useQueueSync has settled
          // before trying to resume. We read the store fresh inside the timeout.
          setTimeout(() => {
            const freshStore = usePlayerStore.getState();
            if (freshStore.currentTrack && freshStore.currentTrack.id) {
              // Load the video at the saved position but don't autoplay
              // (browser autoplay policy often blocks it anyway).
              // The user or the play button will trigger actual playback.
              freshStore.playEngineTrack(
                freshStore.currentTrack,
                freshStore.progress,
                null,
                false // don't autoplay on reload — avoids browser policy blocks
              );
            }
          }, 800);
        }
      };

      const handleStateChange = (event) => {
        const yt = window.YT;
        const activeP = getActivePlayer();
        const bufferP = getBufferPlayer();

        // 1. Manejo del reproductor BÚFER (Cargando en segundo plano)
        if (isTransitioning.current && event.target === bufferP) {
          if (event.data === yt.PlayerState.PLAYING) {
            // ¡El búfer está listo y sonando! Hacemos el Swap.
            isTransitioning.current = false;
            
            const nextIndex = activePlayerIndex.current === 1 ? 2 : 1;
            const activeContainer = document.getElementById(`yt-container-${activePlayerIndex.current}`);
            const bufferContainer = document.getElementById(`yt-container-${nextIndex}`);

            // Swap visual (Crossfade suave)
            bufferP.unMute();
            bufferContainer.style.opacity = '1';
            bufferContainer.style.zIndex = '2';
            
            activeContainer.style.opacity = '0';
            activeContainer.style.zIndex = '1';
            
            activeP.pauseVideo(); // Detener el viejo
            activePlayerIndex.current = nextIndex; // Oficializar el cambio

            const store = usePlayerStore.getState();
            if (!store.isPlaying) {
              bufferP.pauseVideo();
            } else {
              setIsPlaying(true);
            }
            
            setDuration(Math.floor(bufferP.getDuration() * 1000));
            startProgressTimer(bufferP);
            try {
              bufferP.unloadModule('captions');
              bufferP.unloadModule('cc');
              if (bufferP.setOption) {
                bufferP.setOption('captions', 'track', {});
                bufferP.setOption('cc', 'track', {});
              }
            } catch (e) { }
          }
          return; // Detener propagación de estado si es el búfer
        }

        // 2. Manejo del reproductor ACTIVO
        if (event.target === activeP && !isTransitioning.current) {
          if (event.data === yt.PlayerState.PLAYING) {
            const wrapper = document.getElementById('youtube-wrapper');
            if (wrapper) wrapper.dataset.errorHidden = 'false';
            setIsPlaying(true);
            setDuration(Math.floor(activeP.getDuration() * 1000));
            startProgressTimer(activeP);
            try {
              activeP.unloadModule('captions');
              activeP.unloadModule('cc');
              if (activeP.setOption) {
                activeP.setOption('captions', 'track', {});
                activeP.setOption('cc', 'track', {});
              }
            } catch (e) { }
          } else if (event.data === yt.PlayerState.PAUSED) {
            setIsPlaying(false);
            stopProgressTimer();
          } else if (event.data === yt.PlayerState.ENDED) {
            setIsPlaying(false);
            stopProgressTimer();
            const store = usePlayerStore.getState();
            const nextTrack = store.shiftQueue();
            if (nextTrack) {
               store.playEngineTrack(nextTrack);
            } else {
               // No more tracks: stop both players to free CPU/GPU resources
               usePlayerStore.setState({ currentTrack: null, isPlaying: false });
               try {
                 player1Ref.current?.stopVideo();
                 player2Ref.current?.stopVideo();
               } catch (e) {}
            }
          }
        }
      };

      const handleError = (event) => {
        if (isTransitioning.current && event.target === getBufferPlayer()) {
          console.warn('Crossfade Buffer falló. Abortando transición suave.');
          isTransitioning.current = false;
          // Volver a usar el reproductor activo principal y forzar recarga
        }

        if (event.data === 150 || event.data === 101 || event.data === 100) {
          console.warn(`YouTube Error ${event.data}. Buscando alternativa...`);
          const store = usePlayerStore.getState();
          const currentYtId = store.currentYtId || currentYtIdRef.current;

          if (currentYtId) {
            store.addFailedYouTubeId(currentYtId);
            const { karaokeEnabled, lyricsEnabled } = useSettingsStore.getState();
            const mode = karaokeEnabled ? 'karaoke' : lyricsEnabled ? 'lyrics' : 'normal';
            if (store.currentTrack) {
              localStorage.removeItem(`yt_bridge_${store.currentTrack.id}_${mode}`);
            }
          }
          store.playEngineTrack(store.currentTrack, store.progress, null, 1);
          import('sonner').then(({ toast }) => toast.error('Buscando alternativa...'));
        } else if (event.data === 2 || event.data === 5) {
          // Reintentos de glitch
          const store = usePlayerStore.getState();
          const currentYtId = store.currentYtId || currentYtIdRef.current;
          if (currentYtId && getActivePlayer()) {
            setTimeout(() => {
              getActivePlayer().loadVideoById({ videoId: currentYtId, startSeconds: store.progress > 0 ? store.progress / 1000 : 0 });
            }, 1000);
          } else {
            store.playEngineTrack(store.currentTrack, store.progress, null, 1);
          }
        }
      };

      player1Ref.current = new window.YT.Player('youtube-player-target-1', {
        height: '100%', width: '100%', playerVars, events: { onReady, onStateChange: handleStateChange, onError: handleError }
      });
      player2Ref.current = new window.YT.Player('youtube-player-target-2', {
        height: '100%', width: '100%', playerVars, events: { onReady, onStateChange: handleStateChange, onError: handleError }
      });
    };

    loadYouTubeAPI();

    return () => {
      stopProgressTimer();
      if (player1Ref.current) { player1Ref.current.destroy(); player1Ref.current = null; }
      if (player2Ref.current) { player2Ref.current.destroy(); player2Ref.current = null; }
      const wrapper = document.getElementById('youtube-wrapper');
      if (wrapper) {
        if (wrapper._fsListener && wrapper._fsEvents) {
          wrapper._fsEvents.forEach(event => document.removeEventListener(event, wrapper._fsListener));
        }
        document.body.removeChild(wrapper);
      }
    };
  }, [playbackEngine, setYoutubePlayer, setIsPlaying, setDuration, youtubeNativeCast]);

  const startProgressTimer = (p) => {
    stopProgressTimer();
    progressInterval.current = setInterval(() => {
      if (p && typeof p.getCurrentTime === 'function') {
        const time = p.getCurrentTime();
        if (time > 0) setProgress(Math.floor(time * 1000));
      }
    }, 1000);
  };

  const stopProgressTimer = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  };

  return { 
    ytReady,
    controls: {
      togglePlay: () => {
        const p = getActivePlayer();
        if (!p) return;
        const state = p.getPlayerState();
        if (state === 1) p.pauseVideo();
        else p.playVideo();
      },
      skipNext: () => {
        const next = usePlayerStore.getState().shiftQueue();
        if (next) usePlayerStore.getState().playEngineTrack(next);
      },
      skipPrev: () => {
        const prev = usePlayerStore.getState().prevQueue();
        if (prev) usePlayerStore.getState().playEngineTrack(prev);
      }
    }
  };
}
