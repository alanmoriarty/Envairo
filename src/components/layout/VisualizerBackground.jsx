import React, { useEffect, useState, useRef } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { X } from 'lucide-react';

export function VisualizerBackground() {
  const { visualizerEnabled, visualizerUrl } = useSettingsStore();
  const [embedUrl, setEmbedUrl] = useState('');
  const wrapperRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!visualizerEnabled || !visualizerUrl) {
      setEmbedUrl('');
      return;
    }

    try {
      const listMatch = visualizerUrl.match(/[?&]list=([^&]+)/);
      const vMatch = visualizerUrl.match(/(?:v=|youtu\.be\/)([^&?]+)/);

      let url = '';
      if (listMatch) {
        url = `https://www.youtube.com/embed?listType=playlist&list=${listMatch[1]}&autoplay=1&mute=1&controls=0&loop=1&fs=0&iv_load_policy=3&modestbranding=1&rel=0`;
      } else if (vMatch) {
        url = `https://www.youtube.com/embed/${vMatch[1]}?autoplay=1&mute=1&controls=0&loop=1&playlist=${vMatch[1]}&fs=0&iv_load_policy=3&modestbranding=1&rel=0`;
      }
      setEmbedUrl(url);
    } catch (e) {
      setEmbedUrl('');
    }
  }, [visualizerEnabled, visualizerUrl]);

  useEffect(() => {
    const handleFsChange = () => {
      const fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
      setIsFullscreen(!!fsElement);
    };
    
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    events.forEach(event => document.addEventListener(event, handleFsChange));
    return () => events.forEach(event => document.removeEventListener(event, handleFsChange));
  }, []);

  if (!visualizerEnabled || !embedUrl) return null;

  return (
    <div 
      id="visualizer-wrapper"
      ref={wrapperRef}
      className={`fixed top-1/2 left-1/2 w-[100vw] h-[56.25vw] min-h-[100vh] min-w-[177.77vh] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-1000`}
      style={{
        zIndex: isFullscreen ? 9999 : -2,
        opacity: isFullscreen ? 1 : 0.5,
        filter: isFullscreen ? 'none' : 'blur(4px) saturate(1.5)',
        pointerEvents: isFullscreen ? 'auto' : 'none'
      }}
    >
      <iframe
        src={embedUrl}
        className="w-full h-full border-0"
        allow="autoplay; encrypted-media"
        style={{ pointerEvents: 'none' }} // Siempre none para evitar interacciones de YT
      />
      
      {/* Overlay para interacciones en fullscreen */}
      <div 
        className="absolute inset-0 z-10" 
        onDoubleClick={() => {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
        }}
        onClick={() => {
          if (document.fullscreenElement) {
            const state = usePlayerStore.getState();
            const { sessionId, hostSecret } = useSettingsStore.getState();
            if (state.isPlaying) {
              state.setIsPlaying(false);
              import('../../lib/supabase').then(m => m.supabase.rpc('sync_host_config', { p_session_id: sessionId, p_secret: hostSecret, p_updates: { playback_command: { action: 'pause', ts: Date.now() } } }).then());
            } else {
              state.setIsPlaying(true);
              import('../../lib/supabase').then(m => m.supabase.rpc('sync_host_config', { p_session_id: sessionId, p_secret: hostSecret, p_updates: { playback_command: { action: 'play', ts: Date.now() } } }).then());
            }
          }
        }}
      />
      
      {/* Botón flotante para salir de fullscreen (visible solo en fullscreen) */}
      {isFullscreen && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => {});
            }
          }}
          className="absolute top-6 right-6 z-20 w-11 h-11 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors border-none cursor-pointer"
        >
          <X size={24} />
        </button>
      )}
    </div>
  );
}
