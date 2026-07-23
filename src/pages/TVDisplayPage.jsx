import React, { useEffect, useRef, useState } from 'react';
import { Tv, Activity } from 'lucide-react';

export default function TVDisplayPage() {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const channelRef = useRef(null);
  const [status, setStatus] = useState('Esperando conexión...');
  const [currentVideoId, setCurrentVideoId] = useState(null);

  useEffect(() => {
    // 1. Cargar API de YouTube IFrame
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    // 2. Inicializar el BroadcastChannel
    channelRef.current = new BroadcastChannel('envairo_tv_sync');

    // 3. Callback cuando la API de YouTube esté lista
    window.onYouTubeIframeAPIReady = () => {
      setStatus('Conectado. Esperando música...');
      initPlayer();
    };

    if (window.YT && window.YT.Player) {
      setStatus('Conectado. Esperando música...');
      initPlayer();
    }

    function initPlayer() {
      if (playerRef.current) return;
      
      playerRef.current = new window.YT.Player('tv-youtube-player', {
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3
        },
        events: {
          onReady: (event) => {
            // SILENCIO ABSOLUTO PARA NO DUPLICAR AUDIO
            event.target.mute();
            
            // Escuchar comandos del Dashboard
            channelRef.current.onmessage = (e) => {
              const data = e.data;
              if (data.type === 'SYNC' || data.type === 'SYNC_TIME') {
                handleSync(data, event.target);
              }
            };
          },
          onStateChange: (event) => {
            // Asegurar que siempre esté muteado, incluso si cambia de estado
            event.target.mute();
          }
        }
      });
    }

    return () => {
      if (channelRef.current) {
        channelRef.current.close();
      }
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, []);

  const handleSync = (data, player) => {
    if (!player || typeof player.getPlayerState !== 'function') return;

    try {
      const isCurrentlyPlaying = player.getPlayerState() === window.YT.PlayerState.PLAYING;
      
      // Si el video cambió
      if (data.videoId && data.videoId !== currentVideoId) {
        setCurrentVideoId(data.videoId);
        setStatus('');
        player.loadVideoById({ videoId: data.videoId, startSeconds: data.time || 0 });
        if (data.isPlaying) {
          player.playVideo();
        } else {
          player.pauseVideo();
        }
        return;
      }

      // Si es el mismo video, procesar Play/Pause
      if (data.isPlaying && !isCurrentlyPlaying) {
        player.playVideo();
      } else if (!data.isPlaying && isCurrentlyPlaying) {
        player.pauseVideo();
      }

      // Sincronizar tiempo si hay un desfase grande (más de 3 segundos)
      if (data.type === 'SYNC_TIME' && data.time > 0) {
        const currentTime = player.getCurrentTime();
        if (Math.abs(currentTime - data.time) > 3) {
          player.seekTo(data.time, true);
        }
      }
    } catch (err) {
      console.error("Error sincronizando TV Display:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center overflow-hidden">
      
      {/* Player Container */}
      <div 
        ref={containerRef} 
        className="absolute inset-0 z-0 flex items-center justify-center bg-black"
        style={{ width: '100vw', height: '100vh' }}
      >
        <div id="tv-youtube-player" style={{ width: '100%', height: '100%' }}></div>
      </div>

      {/* Click-blocking overlay */}
      <div className="absolute inset-0 z-10 cursor-default"></div>
      
      {/* Overlay status if no video */}
      {!currentVideoId && (
        <div className="relative z-10 flex flex-col items-center gap-6 animate-pulse">
          <div className="relative">
            <div className="absolute inset-0 bg-accent/20 blur-xl rounded-full"></div>
            <div className="bg-black/50 p-6 rounded-full border border-white/10 relative">
              <Tv size={48} className="text-accent" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-3xl font-bold text-white tracking-wider">env<span className="text-accent">AI</span>ro TV</h1>
            <div className="flex items-center gap-2 text-text-muted bg-black/50 px-4 py-2 rounded-full border border-white/5">
              <Activity size={16} className="text-accent animate-pulse" />
              <span>{status}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
