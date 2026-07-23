import React, { useEffect, useRef, useState } from 'react';
import { Tv, Activity } from 'lucide-react';

export default function TVDisplayPage() {
  const channelRef = useRef(null);
  const player1Ref = useRef(null);
  const player2Ref = useRef(null);
  const activePlayerIndex = useRef(1);
  const isTransitioning = useRef(false);
  const [status, setStatus] = useState('Esperando conexión...');
  const [currentVideoId, setCurrentVideoId] = useState(null);
  const currentVideoIdRef = useRef(null);

  const getActivePlayer = () => activePlayerIndex.current === 1 ? player1Ref.current : player2Ref.current;
  const getBufferPlayer = () => activePlayerIndex.current === 1 ? player2Ref.current : player1Ref.current;

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
      initPlayers();
    };

    if (window.YT && window.YT.Player) {
      setStatus('Conectado. Esperando música...');
      initPlayers();
    }

    let readyCount = 0;
    function initPlayers() {
      if (player1Ref.current && player2Ref.current) return;

      const playerVars = {
        autoplay: 0,
        mute: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        iv_load_policy: 3,
        cc_load_policy: 0,
        origin: window.location.origin
      };

      const onReady = (event) => {
        event.target.mute();
        readyCount++;
        if (readyCount === 2) {
           channelRef.current.onmessage = (e) => {
             if (e.data.type === 'SYNC' || e.data.type === 'SYNC_TIME') {
               handleSync(e.data);
             }
           };
        }
      };

      const onStateChange = (event) => {
        event.target.mute();
        const activeP = getActivePlayer();
        const bufferP = getBufferPlayer();
        
        // Manejo del Swap Visual (Crossfade)
        if (isTransitioning.current && event.target === bufferP) {
          if (event.data === window.YT.PlayerState.PLAYING) {
            isTransitioning.current = false;
            
            const nextIndex = activePlayerIndex.current === 1 ? 2 : 1;
            const activeContainer = document.getElementById(`tv-yt-container-${activePlayerIndex.current}`);
            const bufferContainer = document.getElementById(`tv-yt-container-${nextIndex}`);

            // Transición cruzada
            bufferContainer.style.opacity = '1';
            bufferContainer.style.zIndex = '2';
            
            activeContainer.style.opacity = '0';
            activeContainer.style.zIndex = '1';
            
            activeP.pauseVideo(); // Detener el viejo reproductor
            activePlayerIndex.current = nextIndex;
          }
        }
      };

      const onError = (event) => {
        // Errores de YouTube: 2, 5, 100, 101, 150 (bloqueos por derechos, incrustación, etc)
        console.warn('Error en reproductor esclavo:', event.data);
        // Regresamos a la pantalla de carga para ocultar el error visual feo de YouTube
        setCurrentVideoId(null);
        setStatus('Buscando alternativa...');
        
        // El Master se encargará de buscar el siguiente video y enviará el nuevo SYNC cuando lo encuentre.
      };

      player1Ref.current = new window.YT.Player('tv-youtube-player-1', {
        height: '100%', width: '100%', playerVars, events: { onReady, onStateChange, onError }
      });
      player2Ref.current = new window.YT.Player('tv-youtube-player-2', {
        height: '100%', width: '100%', playerVars, events: { onReady, onStateChange, onError }
      });
    }

    return () => {
      if (channelRef.current) channelRef.current.close();
      if (player1Ref.current) player1Ref.current.destroy();
      if (player2Ref.current) player2Ref.current.destroy();
    };
  }, []);

  const handleSync = (data) => {
    const activeP = getActivePlayer();
    const bufferP = getBufferPlayer();
    if (!activeP || !bufferP || typeof activeP.getPlayerState !== 'function') return;

    try {
      const isCurrentlyPlaying = activeP.getPlayerState() === window.YT.PlayerState.PLAYING;

      if (data.videoId && data.videoId !== currentVideoIdRef.current) {
        currentVideoIdRef.current = data.videoId;
        setCurrentVideoId(data.videoId);
        setStatus('');
        const bufferingOffset = 0.5; // Reducido gracias a la nueva precisión de tiempo verdadero
        const start = data.time ? data.time + bufferingOffset : 0;

        if (isCurrentlyPlaying && data.isPlaying) {
          // Modo Crossfade Suave
          isTransitioning.current = true;
          bufferP.loadVideoById({ videoId: data.videoId, startSeconds: start });
        } else {
          // Carga inicial o desde pausa
          isTransitioning.current = false;
          if (data.isPlaying) {
            activeP.loadVideoById({ videoId: data.videoId, startSeconds: start });
          } else {
            activeP.cueVideoById({ videoId: data.videoId, startSeconds: start });
          }
        }
        return;
      }

      if (data.type === 'SYNC') {
        if (data.isPlaying && !isCurrentlyPlaying) {
           activeP.playVideo();
        } else if (!data.isPlaying && isCurrentlyPlaying) {
           activeP.pauseVideo();
        }
      }

      if (data.type === 'SYNC_TIME' && data.time > 0 && !isTransitioning.current) {
        const currentTime = activeP.getCurrentTime();
        // Tolerancia estricta de 0.8s gracias a la nueva precisión del reloj del master
        if (currentTime !== undefined && Math.abs(currentTime - data.time) > 0.8) {
          activeP.seekTo(data.time, true);
        }
      }
    } catch (err) {
      console.error("Error sincronizando TV Display:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center overflow-hidden">
      
      {/* Reproductor 1 (Activo Inicial) */}
      <div 
        id="tv-yt-container-1"
        className="absolute inset-0 z-[2] flex items-center justify-center bg-black transition-opacity duration-1000 ease-in-out"
        style={{ width: '100vw', height: '100vh', opacity: 1 }}
      >
        <div id="tv-youtube-player-1"></div>
      </div>

      {/* Reproductor 2 (Buffer Secundario) */}
      <div 
        id="tv-yt-container-2"
        className="absolute inset-0 z-[1] flex items-center justify-center bg-black transition-opacity duration-1000 ease-in-out"
        style={{ width: '100vw', height: '100vh', opacity: 0 }}
      >
        <div id="tv-youtube-player-2"></div>
      </div>

      {/* Click-blocking overlay */}
      <div className="absolute inset-0 z-10 cursor-default"></div>
      
      {/* Overlay status if no video */}
      {!currentVideoId && (
        <div className="absolute inset-0 z-20 bg-black flex flex-col items-center justify-center gap-6 animate-pulse">
          <div className="bg-white/10 p-6 rounded-full backdrop-blur-sm border border-white/20">
            <Tv size={64} className="text-white opacity-80" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-3xl font-bold text-white tracking-wide">TV Display</h1>
            <div className="flex items-center gap-3 text-white/60">
              <Activity size={20} className="animate-spin-slow" />
              <p className="text-xl font-medium">{status}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
