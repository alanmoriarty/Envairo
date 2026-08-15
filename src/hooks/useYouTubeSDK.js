import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';

export function useYouTubeSDK() {
  const { setYoutubePlayer, playbackEngine, setIsPlaying, setProgress, setDuration, setCurrentTrack, currentTrack } = usePlayerStore();
  const playerRef = useRef(null);
  const currentYtIdRef = useRef(null);
  const [ytReady, setYtReady] = useState(false);
  const progressInterval = useRef(null);
  const { visualizerEnabled, youtubeNativeCast } = useSettingsStore();

  const applyStyles = (wrapper, isVis, isFs) => {
    if (!wrapper) return;

    const dragHeader = document.getElementById('youtube-drag-header');

    if (isFs) {
      wrapper.style.display = 'block';
      wrapper.style.top = '50%';
      wrapper.style.left = '50%';
      wrapper.style.right = 'auto';
      wrapper.style.bottom = 'auto';
      wrapper.style.width = '100vw';
      wrapper.style.height = '56.25vw';
      wrapper.style.minHeight = '100vh';
      wrapper.style.minWidth = '177.77vh';
      wrapper.style.transform = 'translate(-50%, -50%)';
      wrapper.style.borderRadius = '0';
      wrapper.style.boxShadow = 'none';
      wrapper.style.opacity = wrapper.dataset.errorHidden === 'true' ? '0' : '1';
      wrapper.style.zIndex = '99999';
      wrapper.style.filter = 'none';
      wrapper.style.pointerEvents = 'auto';
      if (dragHeader) dragHeader.style.display = 'none';
    } else {
      // DRAGGABLE PIP MINI PLAYER (240x135px - 16:9)
      // Position saved in localStorage or defaults to bottom-right (24px, 96px)
      wrapper.style.display = 'block';
      wrapper.style.width = '240px';
      wrapper.style.height = '135px';
      wrapper.style.minHeight = '0';
      wrapper.style.minWidth = '0';
      wrapper.style.transform = 'none';
      wrapper.style.borderRadius = '12px';
      wrapper.style.border = '2px solid rgba(157,78,221,0.5)';
      wrapper.style.boxShadow = '0 10px 30px rgba(0,0,0,0.8)';
      wrapper.style.opacity = wrapper.dataset.errorHidden === 'true' ? '0' : '1';
      wrapper.style.zIndex = '9999';
      wrapper.style.filter = 'none';
      wrapper.style.willChange = 'left, top';
      wrapper.style.pointerEvents = 'auto';
      if (dragHeader) dragHeader.style.display = 'flex';

      const savedPosStr = localStorage.getItem('bq-pip-pos');
      let hasSavedPos = false;
      if (savedPosStr) {
        try {
          const pos = JSON.parse(savedPosStr);
          if (typeof pos.x === 'number' && typeof pos.y === 'number') {
            wrapper.style.left = `${Math.max(10, Math.min(window.innerWidth - 250, pos.x))}px`;
            wrapper.style.top = `${Math.max(10, Math.min(window.innerHeight - 150, pos.y))}px`;
            wrapper.style.right = 'auto';
            wrapper.style.bottom = 'auto';
            hasSavedPos = true;
          }
        } catch (e) { }
      }

      if (!hasSavedPos && wrapper.dataset.userMoved !== 'true') {
        wrapper.style.left = 'auto';
        wrapper.style.top = 'auto';
        wrapper.style.right = '24px';
        wrapper.style.bottom = '96px';
      }
    }
  };

  useEffect(() => {
    const wrapper = document.getElementById('youtube-wrapper');
    const isFs = document.fullscreenElement === wrapper;
    applyStyles(wrapper, visualizerEnabled, isFs);
  }, [visualizerEnabled]);

  useEffect(() => {
    if (playbackEngine !== 'youtube') return;

    const loadYouTubeAPI = () => {
      if (window.YT && window.YT.Player) {
        initPlayer();
        return;
      }

      window.onYouTubeIframeAPIReady = initPlayer;

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.body.appendChild(script);
    };

    const initPlayer = () => {
      if (playerRef.current) return;

      const wrapper = document.createElement('div');
      wrapper.id = 'youtube-wrapper';
      wrapper.style.position = 'fixed';
      wrapper.style.overflow = 'hidden';

      // Restore saved custom position if available
      try {
        const savedPosStr = localStorage.getItem('bq-pip-pos');
        if (savedPosStr) {
          const pos = JSON.parse(savedPosStr);
          if (typeof pos.x === 'number' && typeof pos.y === 'number') {
            wrapper.style.left = `${Math.max(10, Math.min(window.innerWidth - 250, pos.x))}px`;
            wrapper.style.top = `${Math.max(10, Math.min(window.innerHeight - 150, pos.y))}px`;
            wrapper.dataset.userMoved = 'true';
          }
        }
      } catch (e) { }

      applyStyles(wrapper, useSettingsStore.getState().visualizerEnabled, false);

      // Drag Header Bar for moving PiP freely across screen
      const dragHeader = document.createElement('div');
      dragHeader.id = 'youtube-drag-header';
      dragHeader.style.position = 'absolute';
      dragHeader.style.top = '0';
      dragHeader.style.left = '0';
      dragHeader.style.right = '0';
      dragHeader.style.height = '24px';
      dragHeader.style.background = 'linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0))';
      dragHeader.style.zIndex = '35';
      dragHeader.style.cursor = 'grab';
      dragHeader.style.display = 'flex';
      dragHeader.style.alignItems = 'center';
      dragHeader.style.justifyContent = 'space-between';
      dragHeader.style.padding = '0 8px';
      dragHeader.style.userSelect = 'none';

      const dragHandleIcon = document.createElement('span');
      dragHandleIcon.innerHTML = '⋮⋮';
      dragHandleIcon.style.color = 'rgba(255,255,255,0.7)';
      dragHandleIcon.style.fontSize = '12px';
      dragHandleIcon.style.fontWeight = 'bold';
      dragHandleIcon.style.letterSpacing = '1px';
      dragHeader.appendChild(dragHandleIcon);

      const expandBtn = document.createElement('button');
      expandBtn.innerHTML = '⛶';
      expandBtn.title = 'Pantalla Completa';
      expandBtn.style.color = 'rgba(255,255,255,0.8)';
      expandBtn.style.background = 'none';
      expandBtn.style.border = 'none';
      expandBtn.style.fontSize = '12px';
      expandBtn.style.cursor = 'pointer';
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (wrapper.requestFullscreen) wrapper.requestFullscreen();
        else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
      });
      dragHeader.appendChild(expandBtn);

      wrapper.appendChild(dragHeader);

      // Make PiP Draggable
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;

      const onMouseDown = (e) => {
        if (document.fullscreenElement) return;
        isDragging = true;
        wrapper.style.cursor = 'grabbing';
        if (dragHeader) dragHeader.style.cursor = 'grabbing';
        if (overlay) overlay.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;
        const rect = wrapper.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };

      const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const newLeft = Math.max(10, Math.min(window.innerWidth - 250, initialLeft + dx));
        const newTop = Math.max(10, Math.min(window.innerHeight - 145, initialTop + dy));

        wrapper.style.left = `${newLeft}px`;
        wrapper.style.top = `${newTop}px`;
        wrapper.style.right = 'auto';
        wrapper.style.bottom = 'auto';
        wrapper.dataset.userMoved = 'true';
      };

      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        wrapper.style.cursor = 'grab';
        if (dragHeader) dragHeader.style.cursor = 'grab';
        if (overlay) overlay.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Save custom PiP position to localStorage
        const rect = wrapper.getBoundingClientRect();
        try {
          localStorage.setItem('bq-pip-pos', JSON.stringify({ x: rect.left, y: rect.top }));
        } catch (e) { }
      };

      dragHeader.addEventListener('mousedown', onMouseDown);
      wrapper.style.overflow = 'hidden';
      applyStyles(wrapper, useSettingsStore.getState().visualizerEnabled, false);
      document.body.appendChild(wrapper);

      // Contenedor del reproductor único
      const container = document.createElement('div');
      container.id = 'yt-container';
      container.style.position = 'absolute';
      container.style.inset = '0';
      container.style.opacity = '1';
      container.style.zIndex = '2';
      wrapper.appendChild(container);

      const target = document.createElement('div');
      target.id = 'youtube-player-target';
      container.appendChild(target);

      // Overlay transparent shield to capture drag on PiP header/edges
      const overlay = document.createElement('div');
      overlay.id = 'youtube-overlay';
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.zIndex = '10';
      overlay.style.cursor = 'grab';
      // Solo capturar pointerEvents si el video está reproduciéndose o en fullscreen; si está pausado con botón rojo de YT, dejar que el usuario haga click directo
      overlay.style.pointerEvents = 'none';
      overlay.style.display = useSettingsStore.getState().youtubeNativeCast ? 'none' : 'block';

      overlay.addEventListener('mousedown', onMouseDown);

      overlay.addEventListener('dblclick', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => { });
        } else {
          if (wrapper.requestFullscreen) wrapper.requestFullscreen();
          else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
        }
      });

      overlay.addEventListener('click', (e) => {
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

      // Loader de transición con efectos visuales dinámicos (Spin, Fade, Glitch, Zoom, Slide)
      const loader = document.createElement('div');
      loader.id = 'youtube-transition-loader';
      loader.style.position = 'absolute';
      loader.style.inset = '0';
      loader.style.zIndex = '15';
      loader.style.background = 'radial-gradient(circle at center, rgba(30,15,45,0.92) 0%, rgba(10,10,15,0.96) 100%)';
      loader.style.display = 'flex';
      loader.style.flexDirection = 'column';
      loader.style.alignItems = 'center';
      loader.style.justifyContent = 'center';
      loader.style.gap = '14px';
      loader.style.opacity = '0';
      loader.style.pointerEvents = 'none';
      loader.style.transition = 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s ease';

      loader.innerHTML = `
        <div id="youtube-fx-icon-container" style="position: relative; display: flex; align-items: center; justify-content: center; width: 72px; height: 72px; border-radius: 50%; background: rgba(157,78,221,0.2); border: 2px solid rgba(157,78,221,0.5); box-shadow: 0 0 35px rgba(157,78,221,0.45); transition: transform 0.4s ease;">
          <svg id="youtube-fx-icon" style="width: 32px; height: 32px; color: #d88aff; animation: pulse 1.5s infinite ease-in-out;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
          <span id="youtube-loader-text" style="font-size: 12px; font-weight: 700; color: #fff; letter-spacing: 0.75px; text-transform: uppercase; text-shadow: 0 2px 10px rgba(0,0,0,0.8);"></span>
          <span id="youtube-loader-subtext" style="font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.6);">Mezclando en directo</span>
        </div>
      `;
      wrapper.appendChild(loader);

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
        if (overlay) {
          overlay.style.pointerEvents = 'auto';
          overlay.style.cursor = isFs ? 'pointer' : 'grab';
        }
        // Optimización de RAM: Fullscreen = 1080p / PiP = 360p-480p
        try {
          if (playerRef.current && typeof playerRef.current.setPlaybackQuality === 'function') {
            playerRef.current.setPlaybackQuality(isFs ? 'hd1080' : 'medium');
          }
        } catch (e) { }
      };

      const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
      events.forEach(event => document.addEventListener(event, handleFsChange));
      wrapper._fsListener = handleFsChange;
      wrapper._fsEvents = events;

      // Virtual Player Proxy único
      const virtualPlayer = {
        playVideo: () => {
          if (!playerRef.current) return;
          try {
            if (typeof playerRef.current.unMute === 'function') playerRef.current.unMute();
            if (typeof playerRef.current.playVideo === 'function') playerRef.current.playVideo();
          } catch (e) {
            console.warn('Error en playVideo:', e);
          }
        },
        pauseVideo: () => playerRef.current?.pauseVideo(),
        seekTo: (s, a) => playerRef.current?.seekTo(s, a),
        setVolume: (v) => playerRef.current?.setVolume(v),
        getVolume: () => playerRef.current?.getVolume(),
        getPlayerState: () => playerRef.current?.getPlayerState(),
        getCurrentTime: () => playerRef.current?.getCurrentTime(),
        getDuration: () => playerRef.current?.getDuration(),
        setPlaybackRate: (rate) => playerRef.current?.setPlaybackRate(rate),
        getPlaybackRate: () => playerRef.current?.getPlaybackRate(),
        stopVideo: () => playerRef.current?.stopVideo(),
        unloadModule: (m) => playerRef.current?.unloadModule(m),
        destroy: () => playerRef.current?.destroy(),
        cueVideoById: (args) => playerRef.current?.cueVideoById(args),

        loadVideoById: (args) => {
          if (!playerRef.current) return;

          currentYtIdRef.current = args.videoId;

          // Mostrar overlay de transición con nota musical
          const loader = document.getElementById('youtube-transition-loader');
          if (loader) {
            loader.style.opacity = '1';
            loader.style.pointerEvents = 'auto';
          }
          try {
            if (typeof playerRef.current.unMute === 'function') playerRef.current.unMute();
            if (typeof playerRef.current.loadVideoById === 'function') {
              const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
              playerRef.current.loadVideoById({
                videoId: args.videoId,
                startSeconds: args.startSeconds || 0,
                suggestedQuality: isFs ? 'hd1080' : 'medium'
              });
            }
            if (typeof playerRef.current.playVideo === 'function') {
              playerRef.current.playVideo();
            }
          } catch (e) {
            console.warn('Error en loadVideoById:', e);
          }
        }
      };

      const playerVars = {
        autoplay: 1,
        controls: useSettingsStore.getState().youtubeNativeCast ? 1 : 0,
        disablekb: useSettingsStore.getState().youtubeNativeCast ? 0 : 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        enablejsapi: 1,
        origin: window.location.origin,
        iv_load_policy: 3,
        cc_load_policy: 0,
        playsinline: 1
      };

      const onReady = (event) => {
        try {
          event.target.unloadModule("captions");
          event.target.unloadModule("cc");
        } catch (e) { }

        setYtReady(true);
        const store = usePlayerStore.getState();
        if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
          playerRef.current.setVolume(store.volume);
          playerRef.current.unMute();
        }
        store.setSdkReady(true);
        store.setDeviceId('youtube-device');
        store.setActiveDeviceId('youtube-device');
        setYoutubePlayer(virtualPlayer);

        // Autoplay on refresh: retry up to 15 times (every 300ms = 4.5s total)
        let autoplayAttempts = 0;
        const tryAutoplay = () => {
          autoplayAttempts++;
          const freshStore = usePlayerStore.getState();

          if (freshStore.currentTrack && freshStore.currentTrack.id) {
            freshStore.playEngineTrack(freshStore.currentTrack, freshStore.progress || 0, null, true);
          } else if (autoplayAttempts < 15) {
            setTimeout(tryAutoplay, 300);
          }
        };
        setTimeout(tryAutoplay, 150);
      };

      const handleStateChange = (event) => {
        const yt = window.YT;
        const p = playerRef.current;
        if (!p) return;

        if (event.data === yt.PlayerState.PLAYING) {
          const wrapper = document.getElementById('youtube-wrapper');
          if (wrapper) wrapper.dataset.errorHidden = 'false';

          // Ocultar suavemente el loader de transición
          const loader = document.getElementById('youtube-transition-loader');
          if (loader) {
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none';
          }

          setIsPlaying(true);
          setDuration(Math.floor(p.getDuration() * 1000));
          startProgressTimer(p);

          // Emitir broadcast inmediato a controles remotos
          try {
            const sessId = useSettingsStore.getState().sessionId;
            if (sessId) {
              const ch = supabase.channel(`queue-sync-${sessId}`);
              ch.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                  ch.send({
                    type: 'broadcast',
                    event: 'playback_sync',
                    payload: { isPlaying: true, progress: Math.floor(p.getCurrentTime() * 1000), currentTrack: usePlayerStore.getState().currentTrack }
                  });
                  setTimeout(() => supabase.removeChannel(ch), 500);
                }
              });
            }
          } catch (e) { }

          try {
            p.unloadModule('captions');
            p.unloadModule('cc');
            if (p.setOption) {
              p.setOption('captions', 'track', {});
              p.setOption('cc', 'track', {});
            }
          } catch (e) { }
        } else if (event.data === yt.PlayerState.PAUSED) {
          setIsPlaying(false);
          stopProgressTimer();

          // Emitir broadcast inmediato a controles remotos
          try {
            const sessId = useSettingsStore.getState().sessionId;
            if (sessId) {
              const ch = supabase.channel(`queue-sync-${sessId}`);
              ch.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                  ch.send({
                    type: 'broadcast',
                    event: 'playback_sync',
                    payload: { isPlaying: false, progress: Math.floor(p.getCurrentTime() * 1000), currentTrack: usePlayerStore.getState().currentTrack }
                  });
                  setTimeout(() => supabase.removeChannel(ch), 500);
                }
              });
            }
          } catch (e) { }
        } else if (event.data === yt.PlayerState.ENDED) {
          setIsPlaying(false);
          stopProgressTimer();
          const store = usePlayerStore.getState();
          const nextTrack = store.shiftQueue();
          if (nextTrack) {
            store.playEngineTrack(nextTrack, 0, null, true);
          } else {
            currentYtIdRef.current = null;
            usePlayerStore.setState({ currentTrack: null, isPlaying: false, progress: 0, duration: 0 });
            try {
              playerRef.current?.stopVideo();
            } catch (e) { }
          }
        }
      };

      const handleError = (event) => {
        const wrapper = document.getElementById('youtube-wrapper');
        if (wrapper) {
          wrapper.dataset.errorHidden = 'true';
          const isVisualizerOn = useSettingsStore.getState().visualizerEnabled;
          const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
          applyStyles(wrapper, isVisualizerOn, isFs);
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
          store.playEngineTrack(store.currentTrack, 0, null, 1);
          import('sonner').then(({ toast }) => toast.error('Video no disponible. Buscando alternativa...'));
        } else if (event.data === 2 || event.data === 5) {
          const store = usePlayerStore.getState();
          const currentYtId = store.currentYtId || currentYtIdRef.current;
          if (currentYtId && playerRef.current) {
            setTimeout(() => {
              playerRef.current.loadVideoById({ videoId: currentYtId, startSeconds: 0 });
            }, 1000);
          } else {
            store.playEngineTrack(store.currentTrack, 0, null, 1);
          }
        }
      };

      playerRef.current = new window.YT.Player('youtube-player-target', {
        height: '100%', width: '100%', playerVars, events: { onReady, onStateChange: handleStateChange, onError: handleError }
      });
    };

    loadYouTubeAPI();

    return () => {
      stopProgressTimer();
      if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
      const wrapper = document.getElementById('youtube-wrapper');
      if (wrapper) {
        if (wrapper._fsListener && wrapper._fsEvents) {
          wrapper._fsEvents.forEach(event => document.removeEventListener(event, wrapper._fsListener));
        }
        document.body.removeChild(wrapper);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackEngine, youtubeNativeCast]);

  const isTransitioningRef = useRef(false);
  const transitionTimerRef = useRef(null);

  const startProgressTimer = (p) => {
    stopProgressTimer();
    progressInterval.current = setInterval(() => {
      if (p && typeof p.getCurrentTime === 'function') {
        const time = p.getCurrentTime();
        if (time > 0) setProgress(Math.floor(time * 1000));
        let dur = 0;
        if (typeof p.getDuration === 'function') {
          dur = p.getDuration();
          if (dur > 0) setDuration(Math.floor(dur * 1000));
        }

        // ── DJ Transiciones Automáticas a 5 segundos de terminar ──────────────
        const settings = useSettingsStore.getState();
        const store = usePlayerStore.getState();
        const remainingSeconds = dur - time;

        if (
          settings.djTransitionsEnabled &&
          dur > 15 && // Solo aplicar si el track dura más de 15s
          remainingSeconds <= (settings.djTransitionDuration || 5) &&
          remainingSeconds > 0.5 &&
          !isTransitioningRef.current &&
          store.queue.length > 0 &&
          store.currentQueueIndex < store.queue.length - 1
        ) {
          triggerDJTransition(p, remainingSeconds);
        }
      }
    }, 500);
  };

  const triggerDJTransition = async (p, durationSec) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    const settings = useSettingsStore.getState();
    const effects = ['fade', 'cut', 'brake', 'echo', 'start'];
    const chosenEffect = settings.djTransitionMode === 'random' || !settings.djTransitionMode
      ? effects[Math.floor(Math.random() * effects.length)]
      : settings.djTransitionMode;

    const loader = document.getElementById('youtube-transition-loader');
    const loaderText = document.getElementById('youtube-loader-text');
    const iconContainer = document.getElementById('youtube-fx-icon-container');

    const effectLabels = {
      fade: '🎧 Transición: Fundido Suave',
      cut: '⚡ Transición: Corte Rápido',
      brake: '🛑 Transición: Vinyl Brake',
      echo: '🌊 Transición: Echo Sweep',
      start: '🚀 Transición: Spin Up'
    };

    usePlayerStore.getState().setActiveTransition({
      type: chosenEffect,
      label: effectLabels[chosenEffect] || '🎧 Transición DJ'
    });

    if (loaderText) {
      loaderText.innerText = effectLabels[chosenEffect] || '🎧 Transición DJ';
    }

    // Efectos visuales de animación en el icono central
    if (iconContainer) {
      if (chosenEffect === 'brake') {
        iconContainer.style.transform = 'rotate(-180deg) scale(0.9)';
      } else if (chosenEffect === 'start') {
        iconContainer.style.transform = 'rotate(360deg) scale(1.15)';
      } else if (chosenEffect === 'cut') {
        iconContainer.style.transform = 'scale(1.25)';
      } else if (chosenEffect === 'echo') {
        iconContainer.style.transform = 'scale(1.05)';
      } else {
        iconContainer.style.transform = 'scale(1)';
      }
    }

    if (loader) {
      loader.style.opacity = '1';
      loader.style.pointerEvents = 'none';
    }

    const initialVolume = usePlayerStore.getState().volume || 70;
    const transitionMs = Math.max(1500, Math.floor(durationSec * 1000));

    // Pre-obtener y resolver la siguiente canción en segundo plano durante los 5s de transición
    const store = usePlayerStore.getState();
    const nextIdx = store.currentQueueIndex + 1;
    const upcomingTrack = store.queue[nextIdx];
    if (upcomingTrack) {
      store.resolveYouTubeVideoId(upcomingTrack).catch(() => { });
    }

    // Fundido suave de volumen de música real de fondo
    if (chosenEffect === 'fade' || chosenEffect === 'echo') {
      const steps = 10;
      const stepTime = transitionMs / steps;
      let currentStep = 0;

      const fadeInterval = setInterval(() => {
        currentStep++;
        const targetVol = Math.max(0, Math.floor(initialVolume * (1 - currentStep / steps)));
        try { if (typeof p.setVolume === 'function') p.setVolume(targetVol); } catch (e) { }
        if (currentStep >= steps) clearInterval(fadeInterval);
      }, stepTime);
    }

    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => {
      // Restaurar volumen y valores por defecto para el siguiente track
      try {
        if (typeof p.setVolume === 'function') p.setVolume(initialVolume);
      } catch (e) { }

      if (iconContainer) {
        iconContainer.style.transform = 'none';
      }

      usePlayerStore.getState().setActiveTransition(null);

      const freshStore = usePlayerStore.getState();
      const nextTrack = freshStore.shiftQueue();
      if (nextTrack) {
        freshStore.playEngineTrack(nextTrack, 0, null, true);
      } else {
        if (loader) {
          loader.style.opacity = '0';
          loader.style.pointerEvents = 'none';
        }
      }
      isTransitioningRef.current = false;
    }, transitionMs);
  };

  const stopProgressTimer = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    isTransitioningRef.current = false;
  };

  return {
    ytReady,
    controls: {
      togglePlay: () => {
        const p = playerRef.current;
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
