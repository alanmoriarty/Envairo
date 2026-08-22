import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { supabase } from '../lib/supabase';
import { getTvSyncChannel } from '../lib/tvSyncChannel';

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
  const lastLoadTimeRef = useRef(0);
  const { visualizerEnabled, youtubeNativeCast } = useSettingsStore();

  const getActivePlayer = () => activeDeckRef.current === 'A' ? playerARef.current : playerBRef.current;
  const getStandbyPlayer = () => activeDeckRef.current === 'A' ? playerBRef.current : playerARef.current;

  const applyStyles = (wrapper, isVis, isFs) => {
    if (!wrapper) return;

    const dragHeader = document.getElementById('youtube-drag-header');
    const miniBadge = document.getElementById('youtube-mini-badge');
    const isMinimized = wrapper.dataset.minimized === 'true';
    const isHidden = wrapper.dataset.hidden === 'true';

    if (isHidden) {
      wrapper.style.display = 'none';
      return;
    }

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
      wrapper.style.border = 'none';
      wrapper.style.boxShadow = 'none';
      wrapper.style.opacity = wrapper.dataset.errorHidden === 'true' ? '0' : '1';
      wrapper.style.zIndex = '99999';
      wrapper.style.filter = 'none';
      wrapper.style.pointerEvents = 'auto';
      if (dragHeader) dragHeader.style.display = 'none';
      if (miniBadge) miniBadge.style.display = 'none';
    } else if (isMinimized) {
      wrapper.style.display = 'block';
      wrapper.style.width = '48px';
      wrapper.style.height = '48px';
      wrapper.style.minHeight = '0';
      wrapper.style.minWidth = '0';
      wrapper.style.transform = 'none';
      wrapper.style.borderRadius = '24px';
      wrapper.style.border = '2px solid rgba(157,78,221,0.85)';
      wrapper.style.boxShadow = '0 8px 24px rgba(0,0,0,0.8), 0 0 15px rgba(157,78,221,0.4)';
      wrapper.style.opacity = wrapper.dataset.errorHidden === 'true' ? '0' : '1';
      wrapper.style.zIndex = '9999';
      wrapper.style.filter = 'none';
      wrapper.style.cursor = 'pointer';
      wrapper.style.pointerEvents = 'auto';
      if (dragHeader) dragHeader.style.display = 'none';
      if (miniBadge) miniBadge.style.display = 'flex';

      const savedPosStr = localStorage.getItem('bq-pip-pos');
      let hasSavedPos = false;
      if (savedPosStr) {
        try {
          const pos = JSON.parse(savedPosStr);
          if (typeof pos.x === 'number' && typeof pos.y === 'number') {
            wrapper.style.left = `${Math.max(8, Math.min(window.innerWidth - 56, pos.x))}px`;
            wrapper.style.top = `${Math.max(8, Math.min(window.innerHeight - 130, pos.y))}px`;
            wrapper.style.right = 'auto';
            wrapper.style.bottom = 'auto';
            hasSavedPos = true;
          }
        } catch (e) { }
      }

      if (!hasSavedPos && wrapper.dataset.userMoved !== 'true') {
        wrapper.style.left = 'auto';
        wrapper.style.top = 'auto';
        wrapper.style.right = '16px';
        wrapper.style.bottom = '85px';
      }
    } else {
      const isMobile = window.innerWidth < 640;
      const pipW = isMobile ? 160 : 240;
      const pipH = isMobile ? 90 : 135;

      wrapper.style.display = 'block';
      wrapper.style.width = `${pipW}px`;
      wrapper.style.height = `${pipH}px`;
      wrapper.style.minHeight = '0';
      wrapper.style.minWidth = '0';
      wrapper.style.transform = 'none';
      wrapper.style.borderRadius = '12px';
      wrapper.style.border = '2px solid rgba(157,78,221,0.6)';
      wrapper.style.boxShadow = '0 10px 30px rgba(0,0,0,0.85), 0 0 12px rgba(157,78,221,0.25)';
      wrapper.style.opacity = wrapper.dataset.errorHidden === 'true' ? '0' : '1';
      wrapper.style.zIndex = '9999';
      wrapper.style.filter = 'none';
      wrapper.style.willChange = 'left, top';
      wrapper.style.pointerEvents = 'auto';
      if (dragHeader) dragHeader.style.display = 'flex';
      if (miniBadge) miniBadge.style.display = 'none';

      const savedPosStr = localStorage.getItem('bq-pip-pos');
      let hasSavedPos = false;
      if (savedPosStr) {
        try {
          const pos = JSON.parse(savedPosStr);
          if (typeof pos.x === 'number' && typeof pos.y === 'number') {
            wrapper.style.left = `${Math.max(8, Math.min(window.innerWidth - pipW - 8, pos.x))}px`;
            wrapper.style.top = `${Math.max(8, Math.min(window.innerHeight - pipH - 85, pos.y))}px`;
            wrapper.style.right = 'auto';
            wrapper.style.bottom = 'auto';
            hasSavedPos = true;
          }
        } catch (e) { }
      }

      if (!hasSavedPos && wrapper.dataset.userMoved !== 'true') {
        wrapper.style.left = 'auto';
        wrapper.style.top = 'auto';
        wrapper.style.right = isMobile ? '12px' : '24px';
        wrapper.style.bottom = isMobile ? '80px' : '96px';
      }
    }
  };

  useEffect(() => {
    // Expose global controller for the floating PiP video
    window.toggleYouTubePiP = (forcedOpen) => {
      const wrapper = document.getElementById('youtube-wrapper');
      if (!wrapper) return;
      const isHidden = wrapper.dataset.hidden === 'true';
      const isMinimized = wrapper.dataset.minimized === 'true';

      if (typeof forcedOpen === 'boolean') {
        wrapper.dataset.hidden = forcedOpen ? 'false' : 'true';
        if (forcedOpen) wrapper.dataset.minimized = 'false';
      } else if (isHidden) {
        wrapper.dataset.hidden = 'false';
        wrapper.dataset.minimized = 'false';
      } else if (!isMinimized) {
        wrapper.dataset.minimized = 'true';
      } else {
        wrapper.dataset.minimized = 'false';
      }

      const isFs = document.fullscreenElement === wrapper;
      applyStyles(wrapper, useSettingsStore.getState().visualizerEnabled, isFs);
    };

    const handleResize = () => {
      const wrapper = document.getElementById('youtube-wrapper');
      if (!wrapper) return;
      const isFs = document.fullscreenElement === wrapper;
      applyStyles(wrapper, useSettingsStore.getState().visualizerEnabled, isFs);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      delete window.toggleYouTubePiP;
    };
  }, []);

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
      wrapper.style.transition = 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), height 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.25s ease';

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
      dragHeader.style.height = '26px';
      dragHeader.style.background = 'linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0))';
      dragHeader.style.zIndex = '35';
      dragHeader.style.cursor = 'grab';
      dragHeader.style.display = 'flex';
      dragHeader.style.alignItems = 'center';
      dragHeader.style.justifyContent = 'space-between';
      dragHeader.style.padding = '0 6px';
      dragHeader.style.userSelect = 'none';
      dragHeader.style.touchAction = 'none';

      const dragHandleIcon = document.createElement('div');
      dragHandleIcon.style.display = 'flex';
      dragHandleIcon.style.alignItems = 'center';
      dragHandleIcon.style.gap = '4px';
      dragHandleIcon.innerHTML = '<span style="color: rgba(255,255,255,0.7); font-size: 13px; font-weight: bold; line-height: 1;">⋮⋮</span><span style="font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.8); text-shadow: 0 1px 2px rgba(0,0,0,0.8);">Video</span>';
      dragHeader.appendChild(dragHandleIcon);

      const headerActions = document.createElement('div');
      headerActions.style.display = 'flex';
      headerActions.style.alignItems = 'center';
      headerActions.style.gap = '6px';

      // Minimize Button
      const minimizeBtn = document.createElement('button');
      minimizeBtn.innerHTML = '–';
      minimizeBtn.title = 'Minimizar a burbuja flotante';
      minimizeBtn.style.color = 'rgba(255,255,255,0.85)';
      minimizeBtn.style.background = 'rgba(255,255,255,0.1)';
      minimizeBtn.style.border = 'none';
      minimizeBtn.style.borderRadius = '4px';
      minimizeBtn.style.width = '18px';
      minimizeBtn.style.height = '18px';
      minimizeBtn.style.display = 'flex';
      minimizeBtn.style.alignItems = 'center';
      minimizeBtn.style.justifyContent = 'center';
      minimizeBtn.style.fontSize = '13px';
      minimizeBtn.style.fontWeight = 'bold';
      minimizeBtn.style.cursor = 'pointer';
      minimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.dataset.minimized = 'true';
        applyStyles(wrapper, useSettingsStore.getState().visualizerEnabled, false);
      });
      headerActions.appendChild(minimizeBtn);

      // Fullscreen Button
      const expandBtn = document.createElement('button');
      expandBtn.innerHTML = '⛶';
      expandBtn.title = 'Pantalla Completa';
      expandBtn.style.color = 'rgba(255,255,255,0.85)';
      expandBtn.style.background = 'rgba(255,255,255,0.1)';
      expandBtn.style.border = 'none';
      expandBtn.style.borderRadius = '4px';
      expandBtn.style.width = '18px';
      expandBtn.style.height = '18px';
      expandBtn.style.display = 'flex';
      expandBtn.style.alignItems = 'center';
      expandBtn.style.justifyContent = 'center';
      expandBtn.style.fontSize = '11px';
      expandBtn.style.cursor = 'pointer';
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (wrapper.requestFullscreen) wrapper.requestFullscreen();
        else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
      });
      headerActions.appendChild(expandBtn);

      // Hide Button
      const hideBtn = document.createElement('button');
      hideBtn.innerHTML = '✕';
      hideBtn.title = 'Ocultar video';
      hideBtn.style.color = 'rgba(255,255,255,0.85)';
      hideBtn.style.background = 'rgba(255,255,255,0.1)';
      hideBtn.style.border = 'none';
      hideBtn.style.borderRadius = '4px';
      hideBtn.style.width = '18px';
      hideBtn.style.height = '18px';
      hideBtn.style.display = 'flex';
      hideBtn.style.alignItems = 'center';
      hideBtn.style.justifyContent = 'center';
      hideBtn.style.fontSize = '10px';
      hideBtn.style.cursor = 'pointer';
      hideBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.dataset.hidden = 'true';
        applyStyles(wrapper, useSettingsStore.getState().visualizerEnabled, false);
      });
      headerActions.appendChild(hideBtn);

      dragHeader.appendChild(headerActions);
      wrapper.appendChild(dragHeader);

      // Minimized Floating Badge
      const miniBadge = document.createElement('div');
      miniBadge.id = 'youtube-mini-badge';
      miniBadge.style.position = 'absolute';
      miniBadge.style.inset = '0';
      miniBadge.style.zIndex = '40';
      miniBadge.style.background = 'linear-gradient(135deg, rgba(20,10,35,0.95), rgba(40,15,65,0.95))';
      miniBadge.style.backdropFilter = 'blur(6px)';
      miniBadge.style.display = 'none';
      miniBadge.style.alignItems = 'center';
      miniBadge.style.justifyContent = 'center';
      miniBadge.style.flexDirection = 'column';
      miniBadge.style.cursor = 'pointer';
      miniBadge.style.touchAction = 'none';
      miniBadge.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9D4EDD" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 4px rgba(157,78,221,0.6));">
          <polygon points="23 7 16 12 23 17 23 7"></polygon>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
        </svg>
      `;
      miniBadge.title = 'Toca para expandir el video';
      miniBadge.addEventListener('click', (e) => {
        if (hasMovedSignificantly) return;
        e.stopPropagation();
        wrapper.dataset.minimized = 'false';
        applyStyles(wrapper, useSettingsStore.getState().visualizerEnabled, false);
      });
      wrapper.appendChild(miniBadge);

      let isDragging = false;
      let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
      let hasMovedSignificantly = false;

      const handleDragStart = (clientX, clientY) => {
        if (document.fullscreenElement) return;
        isDragging = true;
        hasMovedSignificantly = false;
        startX = clientX;
        startY = clientY;
        const rect = wrapper.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        wrapper.style.cursor = 'grabbing';
      };

      const handleDragMove = (clientX, clientY) => {
        if (!isDragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasMovedSignificantly = true;
        }
        const isMin = wrapper.dataset.minimized === 'true';
        const isMobile = window.innerWidth < 640;
        const w = isMin ? 48 : (isMobile ? 160 : 240);
        const h = isMin ? 48 : (isMobile ? 90 : 135);

        const newLeft = Math.max(6, Math.min(window.innerWidth - w - 6, initialLeft + dx));
        const newTop = Math.max(6, Math.min(window.innerHeight - h - 6, initialTop + dy));
        wrapper.style.left = `${newLeft}px`;
        wrapper.style.top = `${newTop}px`;
        wrapper.style.right = 'auto';
        wrapper.style.bottom = 'auto';
        wrapper.dataset.userMoved = 'true';
      };

      const handleDragEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        wrapper.style.cursor = wrapper.dataset.minimized === 'true' ? 'pointer' : 'grab';
        const rect = wrapper.getBoundingClientRect();
        try {
          localStorage.setItem('bq-pip-pos', JSON.stringify({ x: rect.left, y: rect.top }));
        } catch (e) { }
      };

      const onMouseDown = (e) => {
        if (e.target.closest('button')) return;
        handleDragStart(e.clientX, e.clientY);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };

      const onMouseMove = (e) => {
        handleDragMove(e.clientX, e.clientY);
      };

      const onMouseUp = () => {
        handleDragEnd();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      const onTouchStart = (e) => {
        if (e.target.closest('button')) return;
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        handleDragStart(touch.clientX, touch.clientY);
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
        document.addEventListener('touchcancel', onTouchEnd);
      };

      const onTouchMove = (e) => {
        if (!isDragging || e.touches.length !== 1) return;
        e.preventDefault(); // prevent scrolling while dragging pip
        const touch = e.touches[0];
        handleDragMove(touch.clientX, touch.clientY);
      };

      const onTouchEnd = () => {
        handleDragEnd();
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('touchcancel', onTouchEnd);
      };

      dragHeader.addEventListener('mousedown', onMouseDown);
      dragHeader.addEventListener('touchstart', onTouchStart, { passive: true });
      miniBadge.addEventListener('mousedown', onMouseDown);
      miniBadge.addEventListener('touchstart', onTouchStart, { passive: true });

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
        getCurrentTime: () => {
          if (isTransitioningRef.current) {
            const incomingP = getStandbyPlayer();
            if (incomingP && typeof incomingP.getCurrentTime === 'function') {
              return incomingP.getCurrentTime();
            }
          }
          return getActivePlayer()?.getCurrentTime();
        },
        getDuration: () => {
          if (isTransitioningRef.current) {
            const incomingP = getStandbyPlayer();
            if (incomingP && typeof incomingP.getDuration === 'function') {
              return incomingP.getDuration();
            }
          }
          return getActivePlayer()?.getDuration();
        },
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
          if (transitionTimerRef.current) {
            clearTimeout(transitionTimerRef.current);
            transitionTimerRef.current = null;
          }
          isTransitioningRef.current = false;
          usePlayerStore.getState().setActiveTransition(null);

          const activeDeck = activeDeckRef.current;
          const standbyDeck = activeDeck === 'A' ? 'B' : 'A';
          const activeContainer = document.getElementById(activeDeck === 'A' ? 'yt-deck-a' : 'yt-deck-b');
          const standbyContainer = document.getElementById(standbyDeck === 'A' ? 'yt-deck-a' : 'yt-deck-b');
          const standbyP = getStandbyPlayer();

          if (activeContainer) {
            activeContainer.style.opacity = '1';
            activeContainer.style.zIndex = '3';
            activeContainer.style.transform = 'none';
            activeContainer.style.filter = 'none';
          }
          if (standbyContainer) {
            standbyContainer.style.opacity = '0';
            standbyContainer.style.zIndex = '2';
            standbyContainer.style.transform = 'none';
            standbyContainer.style.filter = 'none';
          }
          if (standbyP && typeof standbyP.stopVideo === 'function') {
            try { standbyP.stopVideo(); } catch (e) {}
          }

          const activeP = getActivePlayer();
          if (!activeP) return;

          currentYtIdRef.current = args.videoId;
          lastLoadTimeRef.current = Date.now();

          const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

          try {
            if (isHidden) {
              // Mute temporal para que Chrome autorice el inicio inmediato del stream en segundo plano
              if (typeof activeP.mute === 'function') activeP.mute();
            } else {
              if (typeof activeP.unMute === 'function') activeP.unMute();
            }

            if (typeof activeP.loadVideoById === 'function') {
              const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
              activeP.loadVideoById({
                videoId: args.videoId,
                startSeconds: args.startSeconds || 0,
                suggestedQuality: isHidden ? 'small' : isFs ? 'hd1080' : 'medium'
              });
            }
            if (typeof activeP.playVideo === 'function') {
              activeP.playVideo();
            }

            if (isHidden) {
              // Restaurar volumen tras inicio concedido por el navegador
              setTimeout(() => {
                try {
                  const p = getActivePlayer();
                  if (p) {
                    if (typeof p.playVideo === 'function') p.playVideo();
                    if (typeof p.unMute === 'function') p.unMute();
                  }
                } catch (e) {}
              }, 150);
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

          lastLoadTimeRef.current = 0;
          try {
            if (typeof p.unMute === 'function') p.unMute();
          } catch (e) {}
          setIsPlaying(true);
          setDuration(Math.floor(p.getDuration() * 1000));
          startProgressTimer(p);
        } else if (event.data === yt.PlayerState.PAUSED && isCurrentDeck) {
          // Ignorar estados transitorios PAUSED del ciclo de carga de YouTube en los primeros 2s
          const isTransientLoadPause = Date.now() - lastLoadTimeRef.current < 2000;
          if (!isTransientLoadPause) {
            setIsPlaying(false);
            stopProgressTimer();
          }
        } else if ((event.data === yt.PlayerState.UNSTARTED || event.data === yt.PlayerState.BUFFERING) && isCurrentDeck) {
          // Respaldo para desbloquear autoplay en pestañas en segundo plano
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            setTimeout(() => {
              try {
                if (typeof p.playVideo === 'function') p.playVideo();
                if (typeof p.unMute === 'function') p.unMute();
              } catch (e) {}
            }, 250);
          }
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
        console.warn(`YouTube Error ${event.data} en Deck ${deck}.`);
        // Solo procesar fallbacks si el error ocurrió en el deck actualmente ACTIVO
        if (activeDeckRef.current !== deck) return;

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
          onReady: (e) => {
            try {
              const iframe = e.target?.getIframe?.();
              if (iframe) {
                iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
                iframe.setAttribute('allowfullscreen', '1');
              }
            } catch (err) {}
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
                const p = getActivePlayer();
                const pState = p && typeof p.getPlayerState === 'function' ? p.getPlayerState() : null;
                if (pState === window.YT?.PlayerState?.PLAYING || pState === window.YT?.PlayerState?.BUFFERING) {
                  return;
                }
                freshStore.playEngineTrack(freshStore.currentTrack, freshStore.progress || 0, null, true);
              } else if (autoplayAttempts < 20) {
                setTimeout(tryAutoplay, 200);
              }
            };
            setTimeout(tryAutoplay, 80);

            // Respaldo para superar bloqueos de autoplay de navegadores (Chrome/Edge/Safari)
            const handleFirstGesture = () => {
              const fresh = usePlayerStore.getState();
              const p = getActivePlayer();
              if (fresh.currentTrack && p) {
                try {
                  if (typeof p.unMute === 'function') p.unMute();
                  if (typeof p.playVideo === 'function') p.playVideo();
                } catch (e) {}
              }
            };
            window.addEventListener('pointerdown', handleFirstGesture, { once: true });
            window.addEventListener('keydown', handleFirstGesture, { once: true });
            window.addEventListener('touchstart', handleFirstGesture, { once: true });
          },
          onStateChange: (e) => handleStateChange('A', e),
          onError: (e) => handleError('A', e)
        }
      });

      playerBRef.current = new window.YT.Player('youtube-player-deck-b', {
        height: '100%', width: '100%', playerVars,
        events: {
          onReady: (e) => {
            try {
              const iframe = e.target?.getIframe?.();
              if (iframe) {
                iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
                iframe.setAttribute('allowfullscreen', '1');
              }
            } catch (err) {}
          },
          onStateChange: (e) => handleStateChange('B', e),
          onError: (e) => handleError('B', e)
        }
      });
    };

    loadYouTubeAPI();

    return () => {
      stopProgressTimer();
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
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
          dur > 25 && // Solo aplicar si el track dura más de 25s
          time > 10 && // La canción debe llevar al menos 10s reproduciéndose para evitar disparos prematuros
          remainingSeconds <= (settings.djTransitionDuration || 5) &&
          remainingSeconds > 0.5 &&
          !isTransitioningRef.current &&
          store.queue.length > 0
        ) {
          triggerDJTransition(p, remainingSeconds);
        }
      }
    }, 500);
  };

  const triggerDJTransition = async (currentP, durationSec) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    const freshStore = usePlayerStore.getState();
    const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

    // Si la pestaña está en segundo plano, NO intentar cruzar al Deck B (Chrome bloquea iframes secundarios con opacity 0).
    // En su lugar, realizar el cambio continuo de pista directamente en el reproductor activo.
    if (isHidden) {
      isTransitioningRef.current = false;
      const nextTrack = freshStore.shiftQueue();
      if (nextTrack) {
        freshStore.playEngineTrack(nextTrack, 0, null, true);
      }
      return;
    }

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
      usePlayerStore.getState().setActiveTransition(null);
      return;
    }

    // Emitir broadcast de inicio de transición a pantallas esclavas (TVs)
    try {
      const sessId = useSettingsStore.getState().sessionId || useAuthStore.getState().user?.id;
      const { getLocalTvSyncChannelName } = await import('../lib/tvSyncChannel');
      const bc = new BroadcastChannel(getLocalTvSyncChannelName(sessId));
      const payload = {
        type: 'DJ_TRANSITION_START',
        nextVideoId: videoIdToPlay,
        durationSec: durationSec,
        effect: chosenEffect,
        sentAt: Date.now()
      };
      bc.postMessage(payload);
      bc.close();

      // Reusar canal permanente de useTVBroadcast en vez de crear uno efímero
      const tvChannel = getTvSyncChannel();
      if (tvChannel && tvChannel.state === 'joined') {
        tvChannel.send({ type: 'broadcast', event: 'tv_sync', payload }).catch(() => {});
      }
    } catch (e) { }

    // 2. Actualizar INMEDIATAMENTE el track y video ID en el estado global para que el anfitrión y los syncs reflejen el nuevo video
    const nextTrack = freshStore.shiftQueue();
    if (nextTrack) {
      currentYtIdRef.current = videoIdToPlay;
      usePlayerStore.setState({
        currentYtId: videoIdToPlay,
        currentTrack: nextTrack,
        isPlaying: true,
        progress: 0
      });
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

    // Conectar inmediatamente el timer de progreso a la nueva canción (incomingPlayer)
    startProgressTimer(incomingPlayer);

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

      if (incomingContainer) {
        incomingContainer.style.transform = 'none';
        incomingContainer.style.filter = 'none';
        incomingContainer.style.opacity = '1';
        incomingContainer.style.zIndex = '3';
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
        const store = usePlayerStore.getState();
        if (!store.canSwitchTrack()) {
          import('sonner').then(({ toast }) => toast.info('Espera un momento antes de volver a cambiar de canción.', { icon: '⏳' }));
          return;
        }
        store.recordTrackSwitch();
        const next = store.shiftQueue();
        if (next) store.playEngineTrack(next);
      },
      skipPrev: () => {
        const store = usePlayerStore.getState();
        if (!store.canSwitchTrack()) {
          import('sonner').then(({ toast }) => toast.info('Espera un momento antes de volver a cambiar de canción.', { icon: '⏳' }));
          return;
        }
        store.recordTrackSwitch();
        const prev = store.prevQueue();
        if (prev) store.playEngineTrack(prev);
      }
    }
  };
}
