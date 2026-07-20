import React, { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PersistentPlayer } from './PersistentPlayer';
import { VisualizerBackground } from './VisualizerBackground';
import { useSpotifySDK } from '../../hooks/useSpotifySDK';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useQueueSync } from '../../hooks/useQueueSync';
import { supabase } from '../../lib/supabase';
import { Menu, Music2 } from 'lucide-react';
import { useEnairoSelector } from '../../hooks/useEnairoSelector';
import { useAutoQueue } from '../../hooks/useAutoQueue';
import { LanguageSelector } from '../ui/LanguageSelector';

export function RootLayout() {
  const { controls } = useSpotifySDK();
  const { isAuthenticated, user } = useAuthStore();
  const { isAdminMode, themeColor } = useSettingsStore();
  const location = useLocation();
  
  useQueueSync();
  useEnairoSelector();
  useAutoQueue();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const isPremium = user?.product === 'premium';

  if (!isAuthenticated && !isAdminMode) {
    return <Navigate to="/" replace />;
  }

  // Si no es premium y no es admin, forzar vista a métricas
  if (user && user.product !== 'premium' && location.pathname !== '/app/metrics') {
    return <Navigate to="/app/metrics" replace />;
  }

  useEffect(() => {
    // Unificar el sessionId en todos los dispositivos usando el ID de Spotify
    if (user?.id) {
      useSettingsStore.getState().setSessionId(user.id);
    }
    
    // Sincronizar configuraciones de la nube al montar
    const hydrateSettings = async () => {
      try {
        const { data: { user: sbUser } } = await supabase.auth.getUser();
        if (sbUser?.user_metadata?.host_settings) {
          const settingsObj = JSON.parse(sbUser.user_metadata.host_settings);
          const currentState = useSettingsStore.getState();
          const validSettings = {};
          Object.keys(settingsObj).forEach(key => {
            if (typeof currentState[key] !== 'function') {
              validSettings[key] = settingsObj[key];
            }
          });
          useSettingsStore.setState(validSettings);
        }
      } catch(e) {
        console.error('Error hydrating settings on mount:', e);
      }
    };
    hydrateSettings();

    // Si el usuario no tiene Premium, forzamos que su sesión sea inactiva
    // para que nadie pueda escanear su QR ni enviarle peticiones.
    if (!isPremium) {
      const sessionId = useSettingsStore.getState().sessionId;
      supabase.from('sessions').upsert({ id: sessionId, active: false }).then();
    }
    
    // Limpiar peticiones más antiguas a 3 horas cada minuto
    const interval = setInterval(() => {
      usePlayerStore.getState().cleanupOldRequests();
    }, 60000);
    
    // Ejecutar una vez al montar
    usePlayerStore.getState().cleanupOldRequests();
    
    return () => clearInterval(interval);
  }, [isPremium]);

  // Sincronizar configuraciones en tiempo real hacia Supabase Auth Metadata y sessions table
  useEffect(() => {
    let timeoutId;
    const unsubSettings = useSettingsStore.subscribe((state, prevState) => {
      const allKeys = ['enairoPrompt', 'enairoEnabled', 'enairoTestMode', 'whitelistGenres', 'mode', 'blacklistGenres', 'blacklistSongs', 'blacklistArtists', 'allowRepeats', 'cooldownEnabled', 'cooldownMinutes', 'tableCount', 'requestsPerHour', 'requestsPerGuest', 'explicitFilter'];
      const changed = allKeys.some(k => state[k] !== prevState[k]);
      
      if (changed) {
        // 1. Sync to user_metadata (for host persistence across devices)
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          const settingsObj = {};
          allKeys.forEach(k => { settingsObj[k] = state[k]; });
          
          supabase.auth.updateUser({
            data: { host_settings: JSON.stringify(settingsObj) }
          }).catch(console.error);
        }, 2000); // 2 second debounce

        // 2. Sync to sessions table (for Guest page validation)
        const dbKeys = ['mode', 'blacklistGenres', 'blacklistSongs', 'blacklistArtists', 'allowRepeats', 'cooldownEnabled', 'cooldownMinutes', 'tableCount', 'requestsPerHour', 'requestsPerGuest'];
        const dbChanged = dbKeys.some(k => state[k] !== prevState[k]);
        
        if (dbChanged) {
          const sessionId = state.sessionId;
          const hostSecret = state.hostSecret;
          if (sessionId && hostSecret) {
            supabase.rpc('update_session_state', {
              p_session_id: sessionId,
              p_secret: hostSecret,
              p_updates: {
                mode: state.mode,
                blacklist_genres: state.blacklistGenres,
                blacklist_songs: state.blacklistSongs,
                blacklist_artists: state.blacklistArtists,
                allow_repeats: state.allowRepeats,
                cooldown_enabled: state.cooldownEnabled,
                cooldown_minutes: state.cooldownMinutes,
                table_count: state.tableCount,
                requests_per_hour: state.requestsPerHour,
                requests_per_guest: state.requestsPerGuest,
                updated_at: new Date().toISOString()
              }
            }).catch(()=>{});
          }
        }
      }
    });
    return () => {
      clearTimeout(timeoutId);
      unsubSettings();
    };
  }, []);

  return (
    <div className={`h-[100dvh] flex flex-col overflow-hidden bg-transparent text-text-primary font-sans transition-colors duration-500 theme-${themeColor || 'default'}`}>
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Header */}
        <div className="md:hidden absolute top-0 left-0 right-0 h-16 bg-bg-card/70 backdrop-blur-lg border-b border-white/5 flex items-center justify-between px-4 z-30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shadow-glow-sm">
              <Music2 size={16} className="text-accent" />
            </div>
            <div className="leading-none">
              <span className="font-bold text-text-primary block leading-none">Envairo</span>
              <span className="text-[10px] text-accent font-semibold block mt-0.5">QR</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <button onClick={() => setSidebarOpen(true)} className="p-2 text-text-muted hover:text-white">
              <Menu size={24} />
            </button>
          </div>
        </div>

        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
        <main className="flex-1 md:ml-64 mt-16 md:mt-0 overflow-y-auto flex flex-col relative">
          <div className="radial-gradient-bg flex-1 flex flex-col pb-6">
            <Outlet />
          </div>
        </main>
      </div>
      
      {/* Visualizer Background */}
      <VisualizerBackground />

      {/* Footer Player */}
      {!isAdminMode && <PersistentPlayer />}
    </div>
  );
}
