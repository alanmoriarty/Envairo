import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';

export function useYouTubeSDK() {
  const { setYoutubePlayer, playbackEngine, setIsPlaying, setProgress, setDuration, setCurrentTrack, currentTrack } = usePlayerStore();
  const playerRef = useRef(null);
  const currentYtIdRef = useRef(null);
  const [ytReady, setYtReady] = useState(false);
  const progressInterval = useRef(null);
  const { visualizerEnabled } = useSettingsStore();

  const applyStyles = (wrapper, isVis, isFs) => {
    if (!wrapper) return;
    
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
      wrapper.style.opacity = '1';
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
      wrapper.style.opacity = currentTrack ? '0.5' : '0';
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
      applyStyles(wrapper, useSettingsStore.getState().visualizerEnabled, false);
      document.body.appendChild(wrapper);

      const targetDiv = document.createElement('div');
      targetDiv.id = 'youtube-player-target';
      wrapper.appendChild(targetDiv);

      // Capa invisible para capturar eventos sobre el video
      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.zIndex = '10';
      
      overlay.addEventListener('dblclick', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      });
      
      overlay.addEventListener('click', () => {
        if (document.fullscreenElement) {
          const state = usePlayerStore.getState();
          const { sessionId, hostSecret } = useSettingsStore.getState();
          if (state.isPlaying) {
            state.setIsPlaying(false);
            import('../lib/supabase').then(m => m.supabase.rpc('update_session_state', { p_session_id: sessionId, p_secret: hostSecret, p_updates: { playback_command: { action: 'pause', ts: Date.now() } } }).then());
          } else {
            state.setIsPlaying(true);
            import('../lib/supabase').then(m => m.supabase.rpc('update_session_state', { p_session_id: sessionId, p_secret: hostSecret, p_updates: { playback_command: { action: 'play', ts: Date.now() } } }).then());
          }
        }
      });
      wrapper.appendChild(overlay);

      // Botón flotante para salir de fullscreen (visible solo en fullscreen)
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
          document.exitFullscreen().catch(() => {});
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

      playerRef.current = new window.YT.Player('youtube-player-target', {
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 0,
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
            event.target.setVolume(store.volume); // Sincronizar volumen inicial (70%) para evitar sustos
            store.setSdkReady(true);
            store.setDeviceId('youtube-device');
            store.setActiveDeviceId('youtube-device');
            
            // Auto-resume or cue after refresh
            if (store.currentTrack && store.currentTrack.id) {
              setTimeout(async () => {
                let videoIdToPlay = store.currentTrack.id;

                if (store.currentTrack.source === 'spotify' || (store.currentTrack.uri && store.currentTrack.uri.startsWith('spotify:'))) {
                  const { karaokeEnabled, lyricsEnabled } = useSettingsStore.getState();
                  const mode = karaokeEnabled ? 'karaoke' : lyricsEnabled ? 'lyrics' : 'normal';
                  const querySuffix = mode === 'karaoke' ? 'KARAOKE ORIGINAL WITH LYRICS NO COPYRIGHT'
                                    : mode === 'lyrics'  ? 'LYRICS NO COPYRIGHT'
                                    :                     'VIDEO OFICIAL';
                  const cacheKey = mode ? `yt_bridge_${store.currentTrack.id}_${mode}` : null;
                  const cachedId = cacheKey ? localStorage.getItem(cacheKey) : null;
                  if (cachedId && cachedId !== 'undefined' && cachedId !== 'null' && cachedId.length >= 11) {
                    videoIdToPlay = cachedId;
                  } else {
                    try {
                      const { searchYouTubeVideos } = await import('../lib/youtubeApi');
                      const cleanName = (store.currentTrack.name || '')
                        .replace(/\(?(video oficial|official video|official music video|music video|lyric video|official lyric video|letra oficial|en vivo|live|hd|4k|ft\.?.*|feat\.?.*)\)?/gi, '')
                        .replace(/[-–]\s*$/, '')
                        .trim();
                      const artistStr = (store.currentTrack.artists || '').split(',')[0].trim();
                      const nameStartsWithArtist = cleanName.toLowerCase().startsWith(artistStr.toLowerCase());
                      const queryBase = nameStartsWithArtist ? cleanName : `${artistStr} ${cleanName}`;
                      const query = `${queryBase} ${querySuffix}`;
                      const results = await searchYouTubeVideos(query, 5);
                      if (results && results.length > 0) {
                        const unblocked = results.filter(r => !store.failedYouTubeIds.includes(r.id));
                        if (unblocked.length > 0) {
                          let validResults = unblocked;
                          if (mode === 'karaoke' || mode === 'lyrics') {
                            validResults = unblocked.filter(r => {
                              const t = (r.name || '').toLowerCase();
                              if (mode === 'karaoke') return t.includes('karaoke') || t.includes('instrumental') || t.includes('pista');
                              if (mode === 'lyrics') return t.includes('lyric') || t.includes('letra') || t.includes('karaoke');
                              return true;
                            });
                          }

                          if (validResults.length > 0) {
                            videoIdToPlay = validResults[0].id;
                          } else {
                            import('sonner').then(({ toast }) => toast.info(`No se encontró versión ${mode} válida, usando respaldo.`, { id: 'yt-fallback' }));
                            videoIdToPlay = unblocked[0].id;
                          }
                          
                          if (cacheKey) localStorage.setItem(cacheKey, videoIdToPlay);
                        } else {
                          videoIdToPlay = null;
                        }
                      } else {
                        videoIdToPlay = null;
                      }
                    } catch (e) {
                      console.error('Bridge error on resume:', e);
                      videoIdToPlay = null;
                    }
                  }
                }

                if (!videoIdToPlay || videoIdToPlay === 'undefined' || videoIdToPlay === 'null' || videoIdToPlay.length < 11 || (videoIdToPlay === store.currentTrack.id && (store.currentTrack.source === 'spotify' || (store.currentTrack.uri && store.currentTrack.uri.startsWith('spotify:'))))) {
                  import('sonner').then(({ toast }) => toast.error('No se pudo encontrar un video válido para esta canción. Saltando...'));
                  const nextTrack = store.shiftQueue();
                  if (nextTrack) {
                    store.playEngineTrack(nextTrack);
                  } else {
                    store.setCurrentTrack(null);
                    store.setIsPlaying(false);
                  }
                  return;
                }

                if (store.isPlaying) {
                  currentYtIdRef.current = videoIdToPlay;
                  event.target.loadVideoById(videoIdToPlay, store.progress / 1000);
                } else {
                  currentYtIdRef.current = videoIdToPlay;
                  event.target.cueVideoById(videoIdToPlay, store.progress / 1000);
                }
              }, 500);
            }
          },
          onStateChange: (event) => {
            const yt = window.YT;
            if (event.data === yt.PlayerState.PLAYING) {
              const wrapper = document.getElementById('youtube-wrapper');
              if (wrapper) wrapper.style.opacity = '1';
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
              // Advance to next track in queue
              const nextTrack = usePlayerStore.getState().shiftQueue();
              if (nextTrack) {
                usePlayerStore.getState().playEngineTrack(nextTrack);
              }
            }
          },
          onError: (event) => {
            const wrapper = document.getElementById('youtube-wrapper');
            if (wrapper) wrapper.style.opacity = '0';
            
            // 101 o 150 = El propietario del video no permite su reproducción en reproductores integrados.
            if (event.data === 150 || event.data === 101) {
              console.warn('YouTube SDK Error 101/150: Video embedding blocked. Finding alternative...');
              const store = usePlayerStore.getState();
              const currentYtId = currentYtIdRef.current;
              
              if (currentYtId) {
                store.addFailedYouTubeId(currentYtId);
                
                const { karaokeEnabled, lyricsEnabled } = useSettingsStore.getState();
                const mode = karaokeEnabled ? 'karaoke' : lyricsEnabled ? 'lyrics' : 'normal';
                if (store.currentTrack) {
                  localStorage.removeItem(`yt_bridge_${store.currentTrack.id}_${mode}`);
                }
              }

                // Intentar reproducir de nuevo (esto disparará playEngineTrack que usará la nueva lista de bloqueados)
              if (store.currentTrack) {
                import('sonner').then(({ toast }) => {
                  toast.error('El video fue bloqueado por derechos de autor. Buscando alternativa...', { id: 'yt-copyright' });
                });
                // Forzar reintento de puente, pasando retryCount = 1
                store.playEngineTrack(store.currentTrack, store.progress, null, 1);
              }
            } else {
              console.error('YouTube Player Error:', event.data);
              // Auto-skip on fatal errors like 2 (invalid id), 5 (HTML5 error) or 100 (not found)
              if (event.data === 2 || event.data === 100 || event.data === 5) {
                const store = usePlayerStore.getState();
                import('sonner').then(({ toast }) => toast.error('Error al reproducir el video. Saltando a la siguiente...', { id: 'yt-fatal-error' }));
                const nextTrack = store.shiftQueue();
                if (nextTrack) {
                  store.playEngineTrack(nextTrack);
                } else {
                  // Si no hay más canciones, limpiar la actual para evitar loop de errores al refrescar
                  store.setCurrentTrack(null);
                  store.setIsPlaying(false);
                }
              }
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
    skipNext: () => {
      const nextTrack = usePlayerStore.getState().shiftQueue();
      if (nextTrack) {
        usePlayerStore.getState().playEngineTrack(nextTrack);
      }
    },
    skipPrev: () => {
      const prevTrack = usePlayerStore.getState().prevQueue();
      if (prevTrack) {
        usePlayerStore.getState().playEngineTrack(prevTrack);
      }
    }
  };

  return { controls, ytReady };
}
