import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';

export function useYouTubeSDK() {
  const { setYoutubePlayer, playbackEngine, setIsPlaying, setProgress, setDuration, setCurrentTrack, currentTrack } = usePlayerStore();
  const activeDeckRef = useRef('A'); // 'A' | 'B'
  const playerARef = useRef(null);
  const playerBRef = useRef(null);
  const currentYtIdRef = useRef(null);
  const [ytReady, setYtReady] = useState(false);
  const progressInterval = useRef(null);
  const isTransitioningRef = useRef(false);
  const transitionTimerRef = useRef(null);
  const { visualizerEnabled, youtubeNativeCast } = useSettingsStore();

  const getActivePlayer = () => activeDeckRef.current === 'A' ? playerARef.current : playerBRef.current;
  const getStandbyPlayer = () => activeDeckRef.current === 'A' ? playerBRef.current : playerARef.current;

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
      if (playerARef.current || playerBRef.current) return;

      const wrapper = document.createElement('div');
      wrapper.id = 'youtube-wrapper';
      wrapper.style.position = 'fixed';
      wrapper.style.overflow = 'hidden';

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

      // Header Bar
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

      let isDragging = false;
      let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

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

        const rect = wrapper.getBoundingClientRect();
        try {
          localStorage.setItem('bq-pip-pos', JSON.stringify({ x: rect.left, y: rect.top }));
        } catch (e) { }
      };

      dragHeader.addEventListener('mousedown', onMouseDown);
      wrapper.style.overflow = 'hidden';
      applyStyles(wrapper, useSettingsStore.getState().visualizerEnabled, false);
      document.body.appendChild(wrapper);

      // DECK A CONTAINER
      const containerA = document.createElement('div');
      containerA.id = 'yt-deck-a';
      containerA.style.position = 'absolute';
      containerA.style.inset = '0';
      containerA.style.opacity = '1';
      containerA.style.zIndex = '3';
      containerA.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
      wrapper.appendChild(containerA);

      const targetA = document.createElement('div');
      targetA.id = 'youtube-player-deck-a';
      containerA.appendChild(targetA);

      // DECK B CONTAINER (Standby / Dual-buffer player)
      const containerB = document.createElement('div');
      containerB.id = 'yt-deck-b';
      containerB.style.position = 'absolute';
      containerB.style.inset = '0';
      containerB.style.opacity = '0';
      containerB.style.zIndex = '2';
      containerB.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
      wrapper.appendChild(containerB);

      const targetB = document.createElement('div');
      targetB.id = 'youtube-player-deck-b';
      containerB.appendChild(targetB);

      // Overlay
      const overlay = document.createElement('div');
      overlay.id = 'youtube-overlay';
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.zIndex = '10';
      overlay.style.cursor = 'grab';
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
      wrapper.appendChild(overlay);

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
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
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
        try {
          const activeP = getActivePlayer();
          if (activeP && typeof activeP.setPlaybackQuality === 'function') {
            activeP.setPlaybackQuality(isFs ? 'hd1080' : 'medium');
          }
        } catch (e) { }
      };

      const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
      events.forEach(event => document.addEventListener(event, handleFsChange));
      wrapper._fsListener = handleFsChange;
      wrapper._fsEvents = events;

      // Virtual Player Proxy único que interactúa con el Deck activo
      const virtualPlayer = {
        playVideo: () => {
          const p = getActivePlayer();
          if (!p) return;
          try {
            if (typeof p.unMute === 'function') p.unMute();
            if (typeof p.playVideo === 'function') p.playVideo();
          } catch (e) { }
        },
        pauseVideo: () => getActivePlayer()?.pauseVideo(),
        seekTo: (s, a) => getActivePlayer()?.seekTo(s, a),
        setVolume: (v) => {
          const p = getActivePlayer();
          if (p && typeof p.setVolume === 'function') p.setVolume(v);
        },
        getVolume: () => getActivePlayer()?.getVolume(),
        getPlayerState: () => getActivePlayer()?.getPlayerState(),
        getCurrentTime: () => getActivePlayer()?.getCurrentTime(),
        getDuration: () => getActivePlayer()?.getDuration(),
        setPlaybackRate: (rate) => getActivePlayer()?.setPlaybackRate(rate),
        getPlaybackRate: () => getActivePlayer()?.getPlaybackRate(),
        stopVideo: () => {
          playerARef.current?.stopVideo();
          playerBRef.current?.stopVideo();
        },
        unloadModule: (m) => getActivePlayer()?.unloadModule(m),
        destroy: () => {
          playerARef.current?.destroy();
          playerBRef.current?.destroy();
        },
        cueVideoById: (args) => getActivePlayer()?.cueVideoById(args),

        loadVideoById: (args) => {
          const activeP = getActivePlayer();
          if (!activeP) return;

          currentYtIdRef.current = args.videoId;

          try {
            if (typeof activeP.unMute === 'function') activeP.unMute();
            if (typeof activeP.loadVideoById === 'function') {
              const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
              activeP.loadVideoById({
                videoId: args.videoId,
                startSeconds: args.startSeconds || 0,
                suggestedQuality: isFs ? 'hd1080' : 'medium'
              });
            }
            if (typeof activeP.playVideo === 'function') {
              activeP.playVideo();
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

      const handleStateChange = (deck, event) => {
        const yt = window.YT;
        const isCurrentDeck = activeDeckRef.current === deck;
        const p = deck === 'A' ? playerARef.current : playerBRef.current;

        if (event.data === yt.PlayerState.PLAYING && isCurrentDeck) {
          const wrapper = document.getElementById('youtube-wrapper');
          if (wrapper) wrapper.dataset.errorHidden = 'false';

          setIsPlaying(true);
          setDuration(Math.floor(p.getDuration() * 1000));
          startProgressTimer(p);
        } else if (event.data === yt.PlayerState.PAUSED && isCurrentDeck) {
          setIsPlaying(false);
          stopProgressTimer();
        } else if (event.data === yt.PlayerState.ENDED && isCurrentDeck) {
          setIsPlaying(false);
          stopProgressTimer();
          if (isTransitioningRef.current) return;
          const store = usePlayerStore.getState();
          const nextTrack = store.shiftQueue();
          if (nextTrack) {
            store.playEngineTrack(nextTrack, 0, null, true);
          } else {
            currentYtIdRef.current = null;
            usePlayerStore.setState({ currentTrack: null, isPlaying: false, progress: 0, duration: 0 });
          }
        }
      };

      const handleError = (deck, event) => {
        console.warn(`YouTube Error ${event.data} en Deck ${deck}. Buscando alternativa...`);
        const store = usePlayerStore.getState();
        const currentYtId = store.currentYtId || currentYtIdRef.current;

        if (event.data === 150 || event.data === 101 || event.data === 100 || event.data === 2) {
          if (currentYtId) {
            store.addFailedYouTubeId(currentYtId);
            const { karaokeEnabled, lyricsEnabled } = useSettingsStore.getState();
            const mode = karaokeEnabled ? 'karaoke' : lyricsEnabled ? 'lyrics' : 'normal';
            if (store.currentTrack) {
              localStorage.removeItem(`yt_bridge_${store.currentTrack.id}_${mode}`);
            }
          }
          if (store.currentTrack) {
            store.playEngineTrack(store.currentTrack, 0, null, 1);
          }
        }
      };

      // Inicializar Deck A y Deck B
      playerARef.current = new window.YT.Player('youtube-player-deck-a', {
        height: '100%', width: '100%', playerVars,
        events: {
          onReady: () => {
            setYtReady(true);
            const store = usePlayerStore.getState();
            store.setSdkReady(true);
            store.setDeviceId('youtube-device');
            store.setActiveDeviceId('youtube-device');
            setYoutubePlayer(virtualPlayer);

            // Autoplay on refresh
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
            setTimeout(tryAutoplay, 200);
          },
          onStateChange: (e) => handleStateChange('A', e),
          onError: (e) => handleError('A', e)
        }
      });

      playerBRef.current = new window.YT.Player('youtube-player-deck-b', {
        height: '100%', width: '100%', playerVars,
        events: {
          onStateChange: (e) => handleStateChange('B', e),
          onError: (e) => handleError('B', e)
        }
      });
    };

    loadYouTubeAPI();

    return () => {
      stopProgressTimer();
      if (playerARef.current) { playerARef.current.destroy(); playerARef.current = null; }
      if (playerBRef.current) { playerBRef.current.destroy(); playerBRef.current = null; }
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

  const triggerDJTransition = async (currentP, durationSec) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    const settings = useSettingsStore.getState();
    const effects = ['fade', 'cut', 'brake', 'echo', 'start'];
    const chosenEffect = settings.djTransitionMode === 'random' || !settings.djTransitionMode
      ? effects[Math.floor(Math.random() * effects.length)]
      : settings.djTransitionMode;

    const initialVolume = usePlayerStore.getState().volume || 70;
    const transitionMs = Math.max(2500, Math.floor(durationSec * 1000));

    // Identificar Deck saliente y Deck entrante
    const outgoingDeck = activeDeckRef.current; // 'A' o 'B'
    const incomingDeck = outgoingDeck === 'A' ? 'B' : 'A';

    const outgoingContainer = document.getElementById(outgoingDeck === 'A' ? 'yt-deck-a' : 'yt-deck-b');
    const incomingContainer = document.getElementById(incomingDeck === 'A' ? 'yt-deck-a' : 'yt-deck-b');

    const outgoingPlayer = outgoingDeck === 'A' ? playerARef.current : playerBRef.current;
    const incomingPlayer = incomingDeck === 'A' ? playerARef.current : playerBRef.current;

    // Obtener la siguiente canción de la cola
    const freshStore = usePlayerStore.getState();
    const nextIdx = freshStore.currentQueueIndex + 1;
    const upcomingTrack = freshStore.queue[nextIdx];

    if (!upcomingTrack || !incomingPlayer) {
      isTransitioningRef.current = false;
      return;
    }

    usePlayerStore.getState().setActiveTransition({
      type: chosenEffect,
      label: 'Transición DJ'
    });

    // 1. Resolver el video ID de la siguiente canción
    const { videoIdToPlay } = await freshStore.resolveYouTubeVideoId(upcomingTrack);

    if (!videoIdToPlay) {
      isTransitioningRef.current = false;
      return;
    }

    // Emitir broadcast de inicio de transición a pantallas esclavas (TVs)
    try {
      const sessId = useSettingsStore.getState().sessionId;
      const bc = new BroadcastChannel('envairo_tv_sync');
      const payload = {
        type: 'DJ_TRANSITION_START',
        nextVideoId: videoIdToPlay,
        durationSec: durationSec,
        effect: chosenEffect,
        sentAt: Date.now()
      };
      bc.postMessage(payload);
      bc.close();

      if (sessId) {
        const ch = supabase.channel(`tv-sync-${sessId}`);
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            ch.send({ type: 'broadcast', event: 'tv_sync', payload });
            setTimeout(() => supabase.removeChannel(ch), 500);
          }
        });
      }
    } catch (e) { }

    // 2. Actualizar INMEDIATAMENTE el track en el estado global para que el panel anfitrión refleje el nuevo tema
    const nextTrack = freshStore.shiftQueue();
    if (nextTrack) {
      usePlayerStore.setState({ currentTrack: nextTrack, isPlaying: true, progress: 0 });
      freshStore.queueAddToHistory(nextTrack);
    }

    // 3. Arrancar la canción entrante en el Deck en Standby en segundo plano con volumen 0
    try {
      if (typeof incomingPlayer.unMute === 'function') incomingPlayer.unMute();
      if (typeof incomingPlayer.setVolume === 'function') incomingPlayer.setVolume(0);
      if (typeof incomingPlayer.loadVideoById === 'function') {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        incomingPlayer.loadVideoById({
          videoId: videoIdToPlay,
          startSeconds: 0,
          suggestedQuality: isFs ? 'hd1080' : 'medium'
        });
      }
      if (typeof incomingPlayer.playVideo === 'function') {
        incomingPlayer.playVideo();
      }
    } catch (e) { }

    // 4. Cruzar visualmente los contenedores (Opacity & Effects)
    if (incomingContainer) {
      incomingContainer.style.zIndex = '3';
      incomingContainer.style.opacity = '0';
      incomingContainer.style.transform = 'scale(1.02)';
      incomingContainer.style.transition = `opacity ${durationSec * 0.9}s ease, transform ${durationSec * 0.9}s ease`;
      setTimeout(() => {
        incomingContainer.style.opacity = '1';
        incomingContainer.style.transform = 'none';
      }, 50);
    }

    if (outgoingContainer) {
      outgoingContainer.style.zIndex = '2';
      outgoingContainer.style.transition = `opacity ${durationSec * 0.8}s ease, transform ${durationSec * 0.8}s ease, filter ${durationSec * 0.8}s ease`;
      
      if (chosenEffect === 'brake') {
        outgoingContainer.style.transform = 'rotate(-6deg) scale(0.95)';
        outgoingContainer.style.filter = 'brightness(0.7)';
      } else if (chosenEffect === 'start') {
        outgoingContainer.style.transform = 'rotate(8deg) scale(1.05)';
        outgoingContainer.style.filter = 'brightness(1.1)';
      }
      outgoingContainer.style.opacity = '0';
    }

    // 5. Rampa simultánea de volumen: Fade-out Deck saliente / Fade-in Deck entrante
    const steps = 15;
    const stepTime = transitionMs / steps;
    let currentStep = 0;

    const crossfadeInterval = setInterval(() => {
      currentStep++;
      const progressRatio = currentStep / steps; // 0 -> 1

      const outVol = Math.max(0, Math.floor(initialVolume * (1 - progressRatio)));
      const inVol = Math.min(initialVolume, Math.floor(initialVolume * progressRatio));

      try {
        if (outgoingPlayer && typeof outgoingPlayer.setVolume === 'function') outgoingPlayer.setVolume(outVol);
        if (incomingPlayer && typeof incomingPlayer.setVolume === 'function') incomingPlayer.setVolume(inVol);
      } catch (e) { }

      if (currentStep >= steps) {
        clearInterval(crossfadeInterval);
      }
    }, stepTime);

    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => {
      clearInterval(crossfadeInterval);

      // Consolidar cambio definitivo de deck activo
      activeDeckRef.current = incomingDeck;

      // Conectar el temporizador de progreso al nuevo reproductor activo
      if (incomingPlayer) {
        startProgressTimer(incomingPlayer);
        try {
          const dur = incomingPlayer.getDuration();
          if (dur > 0) setDuration(Math.floor(dur * 1000));
        } catch (e) { }
      }

      // Detener y resetear el deck saliente
      try {
        if (outgoingPlayer && typeof outgoingPlayer.stopVideo === 'function') {
          outgoingPlayer.stopVideo();
        }
      } catch (e) { }

      if (outgoingContainer) {
        outgoingContainer.style.transform = 'none';
        outgoingContainer.style.filter = 'none';
        outgoingContainer.style.opacity = '0';
        outgoingContainer.style.zIndex = '1';
      }

      // Sincronizar con dispositivos remotos (Smart TV / Guests)
      try {
        const sessId = useSettingsStore.getState().sessionId;
        if (sessId) {
          const ch = supabase.channel(`queue-sync-${sessId}`);
          ch.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              ch.send({
                type: 'broadcast',
                event: 'playback_sync',
                payload: { isPlaying: true, progress: 0, currentTrack: nextTrack }
              });
              setTimeout(() => supabase.removeChannel(ch), 500);
            }
          });
        }
      } catch (e) { }

      usePlayerStore.getState().setActiveTransition(null);
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
