import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { supabase } from '../lib/supabase';
import { getTvSyncChannel } from '../lib/tvSyncChannel';

export function useYouTubeSDK() {
  const { setYoutubePlayer, playbackEngine, setIsPlaying, setProgress, setDuration, setCurrentTrack, currentTrack } = usePlayerStore();
  const playerRef = useRef(null);
  const currentYtIdRef = useRef(null);
  const [ytReady, setYtReady] = useState(false);
  const progressInterval = useRef(null);
  const isTransitioningRef = useRef(false);
  const transitionTimerRef = useRef(null);
  const lastLoadTimeRef = useRef(0);
  const { visualizerEnabled, youtubeNativeCast } = useSettingsStore();

  const getActivePlayer = () => playerRef.current;

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
    // Expose global controller for floating PiP video
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
        e.preventDefault();
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

      // SINGLE MASTER VIDEO CONTAINER (GPU Accelerated)
      const containerMaster = document.createElement('div');
      containerMaster.id = 'yt-master-container';
      containerMaster.style.position = 'absolute';
      containerMaster.style.inset = '0';
      containerMaster.style.transform = 'translateZ(0)';
      containerMaster.style.willChange = 'transform, filter';
      wrapper.appendChild(containerMaster);

      const targetPlayer = document.createElement('div');
      targetPlayer.id = 'youtube-player-element';
      containerMaster.appendChild(targetPlayer);

      // CINEMATIC CURTAIN LAYER (Masks video load & spinner completely with smooth glassmorphism glow)
      const curtain = document.createElement('div');
      curtain.id = 'youtube-curtain';
      curtain.style.position = 'absolute';
      curtain.style.inset = '0';
      curtain.style.zIndex = '8';
      curtain.style.pointerEvents = 'none';
      curtain.style.opacity = '0';
      curtain.style.transform = 'translateZ(0)';
      curtain.style.transition = 'opacity 0.4s ease, transform 0.4s ease, filter 0.4s ease';
      curtain.style.background = 'radial-gradient(circle at center, rgba(30,15,45,0.96) 0%, rgba(8,4,14,0.98) 100%)';
      curtain.style.backdropFilter = 'blur(16px)';
      curtain.style.display = 'flex';
      curtain.style.flexDirection = 'column';
      curtain.style.alignItems = 'center';
      curtain.style.justifyContent = 'center';
      curtain.style.gap = '8px';
      curtain.innerHTML = `
        <div style="width: 42px; height: 42px; border-radius: 50%; background: rgba(157,78,221,0.2); border: 2px solid rgba(157,78,221,0.5); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 25px rgba(157,78,221,0.4);">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9D4EDD" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 3s linear infinite;">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </div>
        <div id="yt-curtain-badge" style="padding: 4px 12px; border-radius: 9999px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: white; font-family: system-ui, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">
          <span id="yt-curtain-text">Transición DJ</span>
        </div>
      `;
      wrapper.appendChild(curtain);

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
          const p = getActivePlayer();
          if (p && typeof p.setPlaybackQuality === 'function') {
            p.setPlaybackQuality(isFs ? 'hd1080' : 'medium');
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
        stopVideo: () => playerRef.current?.stopVideo(),
        unloadModule: (m) => getActivePlayer()?.unloadModule(m),
        destroy: () => playerRef.current?.destroy(),
        cueVideoById: (args) => getActivePlayer()?.cueVideoById(args),

        loadVideoById: (args) => {
          if (transitionTimerRef.current) {
            clearTimeout(transitionTimerRef.current);
            transitionTimerRef.current = null;
          }
          isTransitioningRef.current = false;
          usePlayerStore.getState().setActiveTransition(null);

          const activeP = getActivePlayer();
          if (!activeP) return;

          currentYtIdRef.current = args.videoId;
          lastLoadTimeRef.current = Date.now();

          const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

          try {
            if (isHidden) {
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

      const handleStateChange = (event) => {
        const yt = window.YT;
        const p = playerRef.current;
        if (!p) return;

        if (event.data === yt.PlayerState.PLAYING) {
          const wrapper = document.getElementById('youtube-wrapper');
          if (wrapper) wrapper.dataset.errorHidden = 'false';

          const curtain = document.getElementById('youtube-curtain');
          if (curtain) {
            curtain.style.opacity = '0';
          }

          lastLoadTimeRef.current = 0;
          try {
            if (typeof p.unMute === 'function') p.unMute();
          } catch (e) {}

          setIsPlaying(true);
          setDuration(Math.floor(p.getDuration() * 1000));
          startProgressTimer(p);
        } else if (event.data === yt.PlayerState.PAUSED) {
          if (isTransitioningRef.current) return;
          const isTransientLoadPause = Date.now() - lastLoadTimeRef.current < 3000;
          if (!isTransientLoadPause) {
            setIsPlaying(false);
            stopProgressTimer();
          }
        } else if (event.data === yt.PlayerState.UNSTARTED || event.data === yt.PlayerState.BUFFERING) {
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            setTimeout(() => {
              try {
                if (typeof p.playVideo === 'function') p.playVideo();
                if (typeof p.unMute === 'function') p.unMute();
              } catch (e) {}
            }, 250);
          }
        } else if (event.data === yt.PlayerState.ENDED) {
          if (isTransitioningRef.current) return;
          setIsPlaying(false);
          stopProgressTimer();
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

      const handleError = (event) => {
        console.warn(`YouTube Error ${event.data} en Master Player.`);
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

      // Inicializar Single Master Player
      playerRef.current = new window.YT.Player('youtube-player-element', {
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
          onStateChange: handleStateChange,
          onError: handleError
        }
      });
    };

    loadYouTubeAPI();

    return () => {
      stopProgressTimer();
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
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

        // ── DJ Transición Automática a 5 segundos de terminar ──────────────
        const settings = useSettingsStore.getState();
        const store = usePlayerStore.getState();
        const remainingSeconds = dur - time;

        if (
          settings.djTransitionsEnabled &&
          dur > 25 &&
          time > 10 &&
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
    const settings = useSettingsStore.getState();
    const effects = ['fade', 'cut', 'brake', 'echo', 'start'];
    const chosenEffect = settings.djTransitionMode === 'random' || !settings.djTransitionMode
      ? effects[Math.floor(Math.random() * effects.length)]
      : settings.djTransitionMode;

    const initialVolume = usePlayerStore.getState().volume || 70;
    const transitionMs = Math.max(2500, Math.floor(durationSec * 1000));

    const nextIdx = freshStore.currentQueueIndex + 1;
    const upcomingTrack = freshStore.queue[nextIdx];

    if (!upcomingTrack || !playerRef.current) {
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

    // 2. Activar la Cortina Cinemática (oculta cuadro negro y spinner de YouTube)
    const curtain = document.getElementById('youtube-curtain');
    const curtainText = document.getElementById('yt-curtain-text');
    if (curtainText) curtainText.innerText = `Transición DJ: ${chosenEffect.toUpperCase()}`;
    if (curtain) {
      curtain.style.opacity = '1';
    }

    // 3. Emitir broadcast de inicio de transición a pantallas esclavas (TVs)
    try {
      const sessId = useSettingsStore.getState().sessionId;
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

      const tvChannel = getTvSyncChannel();
      if (tvChannel && tvChannel.state === 'joined') {
        tvChannel.send({ type: 'broadcast', event: 'tv_sync', payload }).catch(() => {});
      }
    } catch (e) { }

    // 4. Actualizar estado global y avanzar la cola
    const nextTrack = freshStore.shiftQueue();
    if (nextTrack) {
      currentYtIdRef.current = videoIdToPlay;
      lastLoadTimeRef.current = Date.now();
      usePlayerStore.setState({
        currentYtId: videoIdToPlay,
        currentTrack: nextTrack,
        isPlaying: true,
        progress: 0
      });
      freshStore.queueAddToHistory(nextTrack);
    }

    // 5. Cargar nuevo video en el reproductor maestro de forma limpia y transparente
    try {
      const p = playerRef.current;
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (p && typeof p.loadVideoById === 'function') {
        p.loadVideoById({
          videoId: videoIdToPlay,
          startSeconds: 0,
          suggestedQuality: isFs ? 'hd1080' : 'medium'
        });
      }
      if (p && typeof p.playVideo === 'function') {
        p.playVideo();
      }
    } catch (e) { }

    // 6. Watchdog de seguridad para retirar cortina y transición si ya entró en reproducción
    let watchdogCount = 0;
    const watchdog = setInterval(() => {
      watchdogCount++;
      const p = playerRef.current;
      const pState = p && typeof p.getPlayerState === 'function' ? p.getPlayerState() : null;
      if (pState === 1 || watchdogCount > 25) { // PLAYING o 3.75s
        clearInterval(watchdog);
        if (curtain) curtain.style.opacity = '0';
        usePlayerStore.getState().setActiveTransition(null);
        isTransitioningRef.current = false;
      }
    }, 150);

    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => {
      clearInterval(watchdog);
      if (curtain) curtain.style.opacity = '0';
      usePlayerStore.getState().setActiveTransition(null);
      isTransitioningRef.current = false;

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
