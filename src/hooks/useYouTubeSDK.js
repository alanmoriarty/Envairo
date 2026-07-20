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

      const wrapper = document.createElement('div');
      wrapper.id = 'youtube-wrapper';
      wrapper.style.position = 'fixed';
      wrapper.style.top = '50%';
      wrapper.style.left = '50%';
      wrapper.style.width = '100vw';
      wrapper.style.height = '56.25vw'; // 16:9
      wrapper.style.minHeight = '100vh';
      wrapper.style.minWidth = '177.77vh'; // 16:9
      wrapper.style.transform = 'translate(-50%, -50%)';
      wrapper.style.zIndex = '-1';
      wrapper.style.pointerEvents = 'none'; // Prevenir interacciones por defecto
      wrapper.style.opacity = '0.5'; 
      wrapper.style.filter = 'blur(4px) saturate(1.5)';
      document.body.appendChild(wrapper);

      const targetDiv = document.createElement('div');
      targetDiv.id = 'youtube-player-target';
      wrapper.appendChild(targetDiv);

      // Capa invisible para capturar el doble click en fullscreen sin darle eventos a YT
      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.zIndex = '10';
      overlay.addEventListener('dblclick', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      });
      wrapper.appendChild(overlay);

      const handleFsChange = () => {
        const fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        if (fsElement) {
          wrapper.style.opacity = '1';
          wrapper.style.filter = 'none';
          wrapper.style.pointerEvents = 'auto'; // Permitir clicks para el overlay
        } else {
          wrapper.style.opacity = '0.5';
          wrapper.style.filter = 'blur(4px) saturate(1.5)';
          wrapper.style.pointerEvents = 'none'; // Bloquear clicks
        }
      };
      
      const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
      events.forEach(event => document.addEventListener(event, handleFsChange));
      
      wrapper._fsListener = handleFsChange;
      wrapper._fsEvents = events;

      playerRef.current = new window.YT.Player('youtube-player-target', {
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
          cc_load_policy: 0, // Desactivar subtítulos por defecto
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
              setTimeout(async () => {
                let videoIdToPlay = store.currentTrack.id;

                if (store.currentTrack.source === 'spotify' || (store.currentTrack.uri && store.currentTrack.uri.startsWith('spotify:'))) {
                  const cacheKey = `yt_bridge_${store.currentTrack.id}`;
                  const cachedId = localStorage.getItem(cacheKey);
                  if (cachedId) {
                    videoIdToPlay = cachedId;
                  } else {
                    try {
                      const { searchYouTubeVideos } = await import('../lib/youtubeApi');
                      const query = `${store.currentTrack.artists} ${store.currentTrack.name} VIDEO OFICIAL`;
                      const results = await searchYouTubeVideos(query, 1);
                      if (results && results.length > 0) {
                        videoIdToPlay = results[0].id;
                        localStorage.setItem(cacheKey, videoIdToPlay);
                      }
                    } catch (e) {
                      console.error('Bridge error on resume:', e);
                    }
                  }
                }

                if (store.isPlaying) {
                  event.target.loadVideoById(videoIdToPlay, store.progress / 1000);
                } else {
                  event.target.cueVideoById(videoIdToPlay, store.progress / 1000);
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
              // Force disable captions
              try {
                event.target.unloadModule('captions');
                event.target.unloadModule('cc');
              } catch(e) {}
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
      const wrapper = document.getElementById('youtube-wrapper');
      if (wrapper) {
        if (wrapper._fsListener && wrapper._fsEvents) {
          wrapper._fsEvents.forEach(event => 
            document.removeEventListener(event, wrapper._fsListener)
          );
        }
        wrapper.remove();
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
