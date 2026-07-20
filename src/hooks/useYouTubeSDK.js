import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';

export function useYouTubeSDK() {
  const { setYoutubePlayer, playbackEngine, setIsPlaying, setProgress, setDuration, setCurrentTrack } = usePlayerStore();
  const playerRef = useRef(null);
  const [ytReady, setYtReady] = useState(false);
  const progressInterval = useRef(null);

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

      const playerContainer = document.createElement('div');
      playerContainer.id = 'youtube-player-container';
      playerContainer.style.position = 'fixed';
      playerContainer.style.top = '50%';
      playerContainer.style.left = '50%';
      playerContainer.style.width = '100vw';
      playerContainer.style.height = '56.25vw'; // 16:9
      playerContainer.style.minHeight = '100vh';
      playerContainer.style.minWidth = '177.77vh'; // 16:9
      playerContainer.style.transform = 'translate(-50%, -50%)';
      playerContainer.style.zIndex = '-1';
      playerContainer.style.pointerEvents = 'none';
      playerContainer.style.opacity = '0.5'; // Mayor opacidad para que se vea bien
      playerContainer.style.filter = 'blur(4px) saturate(1.5)'; // Efecto moderno de fondo
      document.body.appendChild(playerContainer);

      const handleFsChange = () => {
        const fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        if (fsElement === playerContainer) {
          playerContainer.style.opacity = '1';
          playerContainer.style.filter = 'none';
          playerContainer.style.pointerEvents = 'auto'; // Permitir controles si YT los mostrara
        } else {
          playerContainer.style.opacity = '0.5';
          playerContainer.style.filter = 'blur(4px) saturate(1.5)';
          playerContainer.style.pointerEvents = 'none';
        }
      };
      
      const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
      events.forEach(event => document.addEventListener(event, handleFsChange));
      
      // Limpiar listener si alguna vez se desmonta
      playerContainer._fsListener = handleFsChange;
      playerContainer._fsEvents = events;

      playerRef.current = new window.YT.Player('youtube-player-container', {
        height: '100%',
        width: '100%',
        videoId: '',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3,
          mute: 0 // Importante para que suene
        },
        events: {
          onReady: (event) => {
            setYtReady(true);
            setYoutubePlayer(event.target);
            const store = usePlayerStore.getState();
            store.setSdkReady(true);
            store.setDeviceId('youtube-device');
            store.setActiveDeviceId('youtube-device');
            
            // Auto-resume or cue after refresh
            if (store.currentTrack && store.currentTrack.id) {
              setTimeout(() => {
                if (store.isPlaying) {
                  event.target.loadVideoById(store.currentTrack.id, store.progress / 1000);
                } else {
                  event.target.cueVideoById(store.currentTrack.id, store.progress / 1000);
                }
              }, 500);
            }
          },
          onStateChange: (event) => {
            const yt = window.YT;
            if (event.data === yt.PlayerState.PLAYING) {
              setIsPlaying(true);
              setDuration(Math.floor(event.target.getDuration() * 1000));
              startProgressTimer(event.target);
            } else if (event.data === yt.PlayerState.PAUSED) {
              setIsPlaying(false);
              stopProgressTimer();
            } else if (event.data === yt.PlayerState.ENDED) {
              setIsPlaying(false);
              stopProgressTimer();
              // Si termina, debería saltar a la siguiente
              usePlayerStore.getState().setPendingRequests((prev) => [...prev, { action: 'next', ts: Date.now() }]);
            }
          }
        }
      });
    };

    loadYouTubeAPI();

    return () => {
      stopProgressTimer();
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      const container = document.getElementById('youtube-player-container');
      if (container) {
        if (container._fsListener && container._fsEvents) {
          container._fsEvents.forEach(event => 
            document.removeEventListener(event, container._fsListener)
          );
        }
        container.remove();
      }
    };
  }, [playbackEngine]);

  const startProgressTimer = (player) => {
    stopProgressTimer();
    progressInterval.current = setInterval(() => {
      if (player && player.getCurrentTime) {
        setProgress(Math.floor(player.getCurrentTime() * 1000));
      }
    }, 1000);
  };

  const stopProgressTimer = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  };

  // Controles del motor (se mapean al reproductor de YT)
  const controls = {
    play: () => {
      if (playerRef.current && playerRef.current.playVideo) {
        playerRef.current.playVideo();
      }
    },
    pause: () => {
      if (playerRef.current && playerRef.current.pauseVideo) {
        playerRef.current.pauseVideo();
      }
    },
    next: () => {
      // Manejado externamente por la cola de EnvAIro (QueueSync/AutoQueue)
    },
    prev: () => {
      // Manejado externamente
    }
  };

  return { controls, ytReady };
}
