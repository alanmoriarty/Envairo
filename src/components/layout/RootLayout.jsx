import React, { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PersistentPlayer } from './PersistentPlayer';
import { VisualizerBackground } from './VisualizerBackground';

import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useQueueSync } from '../../hooks/useQueueSync';
import { supabase } from '../../lib/supabase';
import { Menu, Music2, AlertCircle } from 'lucide-react';
import { useEnairoSelector } from '../../hooks/useEnairoSelector';
import { useAutoQueue } from '../../hooks/useAutoQueue';

import { LanguageSelector } from '../ui/LanguageSelector';
import { isWithinInterval, parse, addDays, isBefore } from 'date-fns';

export function RootLayout() {

  const { isAuthenticated, user } = useAuthStore();
  const { isAdminMode, themeColor } = useSettingsStore();
  const location = useLocation();
  
  useQueueSync();
  useEnairoSelector();
  useAutoQueue();

  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [kickedOut, setKickedOut] = useState(false);

  useEffect(() => {
    // Evitar múltiples pestañas
    const channel = new BroadcastChannel('envairo_app_tabs');
    const myTabId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString();

    channel.onmessage = (event) => {
      if (event.data.type === 'NEW_TAB_OPENED' && event.data.tabId !== myTabId) {
        setKickedOut(true);
      }
    };

    channel.postMessage({ type: 'NEW_TAB_OPENED', tabId: myTabId });

    return () => {
      channel.close();
    };
  }, []);



  useEffect(() => {
    // Unificar el sessionId en todos los dispositivos usando el ID de Spotify
    if (user?.id) {
      useSettingsStore.getState().setSessionId(user.id);
    }
    
    // Sincronizar configuraciones e historial de la nube al montar
    const hydrateSettings = async () => {
      try {
        const { data: { user: sbUser } } = await supabase.auth.getUser();
        if (!sbUser) return;

        // 1. Hidratar configuraciones
        if (sbUser.user_metadata?.host_settings) {
          const settingsObj = JSON.parse(sbUser.user_metadata.host_settings);
          const currentState = useSettingsStore.getState();
          const validSettings = {};
          Object.keys(settingsObj).forEach(key => {
            if (typeof currentState[key] !== 'function') {
              validSettings[key] = settingsObj[key];
            }
          });
          useSettingsStore.setState(validSettings);
          
          const allKeys = ['enairoPrompt', 'enairoEnabled', 'enairoTestMode', 'whitelistGenres', 'mode', 'eventName', 'blacklistGenres', 'blacklistSongs', 'blacklistArtists', 'allowRepeats', 'repeatCooldown', 'alwaysAvailable', 'startTime', 'endTime', 'cooldownEnabled', 'cooldownMinutes', 'tableCount', 'requestsPerHour', 'requestsPerGuest', 'explicitFilter'];
          const newSettingsObj = {};
          allKeys.forEach(k => { newSettingsObj[k] = validSettings[k] ?? currentState[k]; });
          useSettingsStore.getState().setLastSavedSignature(JSON.stringify(newSettingsObj));
        } else {
          // Nueva cuenta o sin configuraciones previas: limpiamos el estado local heredado de otra cuenta
          useSettingsStore.getState().clearSettingsState();
        }

        // 2. Hidratar Cola e Historial (host_state)
        const { data: hostState, error: hsError } = await supabase
          .from('host_state')
          .select('queue, play_history')
          .eq('user_id', sbUser.id)
          .maybeSingle();
          
        if (!hsError && hostState) {
          usePlayerStore.setState({
            queue: hostState.queue || [],
            playHistory: hostState.play_history || []
          });
        } else if (!hsError && !hostState) {
          // Nueva cuenta sin host_state: limpiamos la cola heredada
          usePlayerStore.getState().clearPlayerState();
        }
        
        // Fetch global blocked YouTube IDs at startup
        usePlayerStore.getState().fetchGlobalBlockedYouTubeIds();
      } catch(e) {
        console.error('Error hydrating settings on mount:', e);
      }
    };
    hydrateSettings();


    
    // Limpiar peticiones antiguas y actualizar estado de disponibilidad cada minuto
    let lastActiveState = null;
    
    const checkAndUpdateStatus = () => {
      const state = useSettingsStore.getState();
      usePlayerStore.getState().cleanupOldRequests?.();
      
      let currentActive = state.alwaysAvailable;

      if (lastActiveState !== currentActive) {
        lastActiveState = currentActive;
        if (state.sessionId && state.hostSecret) {
          supabase.rpc('update_session_state', {
            p_session_id: state.sessionId,
            p_secret: state.hostSecret,
            p_updates: { active: currentActive }
          }).then();
        }
      }
    };

    const interval = setInterval(checkAndUpdateStatus, 60000);
    
    // Ejecutar una vez al montar
    checkAndUpdateStatus();
    
    return () => {
      clearInterval(interval);
      // Desactivar peticiones por defecto al cerrar la sesión/app
      const state = useSettingsStore.getState();
      if (state.sessionId && state.hostSecret) {
        supabase.rpc('update_session_state', {
          p_session_id: state.sessionId,
          p_secret: state.hostSecret,
          p_updates: { active: false }
        }).then();
      }
    };
  }, []);

  // Sincronizar configuraciones en tiempo real hacia Supabase Auth Metadata y sessions table
  useEffect(() => {
    let timeoutId;
    let prevState = useSettingsStore.getState();
    const unsubSettings = useSettingsStore.subscribe((state) => {
      // Auto-sync solo para opciones rápidas y estado crítico
      const autoSyncKeys = ['mode', 'enairoEnabled', 'enairoTestMode', 'alwaysAvailable', 'sessionId'];
      const changed = autoSyncKeys.some(k => state[k] !== prevState[k]);
      
      if (changed) {
        // 1. Sync to user_metadata (for host persistence across devices)
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          const settingsObj = {};
          // Guardar estado de todas las llaves en metadatos (aunque el auto-sync sea solo por los toggles)
          const allKeys = ['enairoPrompt', 'enairoEnabled', 'enairoTestMode', 'whitelistGenres', 'mode', 'eventName', 'blacklistGenres', 'blacklistSongs', 'blacklistArtists', 'allowRepeats', 'repeatCooldown', 'alwaysAvailable', 'startTime', 'endTime', 'cooldownEnabled', 'cooldownMinutes', 'tableCount', 'requestsPerHour', 'requestsPerGuest', 'explicitFilter'];
          allKeys.forEach(k => { settingsObj[k] = state[k]; });
          
          supabase.auth.updateUser({
            data: { host_settings: JSON.stringify(settingsObj) }
          }).catch(console.error);
        }, 2000); // 2 second debounce

        // 2. Sync to sessions table (for Guest page validation)
        const dbKeys = ['mode', 'alwaysAvailable', 'sessionId']; // Sync crítico para Guests
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
                event_name: state.eventName,
                blacklist_genres: state.blacklistGenres,
                blacklist_songs: state.blacklistSongs,
                blacklist_artists: state.blacklistArtists,
                allow_repeats: state.allowRepeats,
                repeat_cooldown: state.repeatCooldown,
                cooldown_enabled: state.cooldownEnabled,
                cooldown_minutes: state.cooldownMinutes,
                table_count: state.tableCount,
                requests_per_hour: state.requestsPerHour,
                requests_per_guest: state.requestsPerGuest,
                active: state.alwaysAvailable,
                updated_at: new Date().toISOString()
              }
            }).then(() => {
              // Direct update fallback in case RPC doesn't support 'mode' column
              return supabase.from('sessions').update({ mode: state.mode }).eq('id', sessionId);
            }).catch(()=>{});
          }
        }
      }
      prevState = { ...state };
    });
    return () => {
      clearTimeout(timeoutId);
      unsubSettings();
    };
  }, []);

  // Sincronizar Cola e Historial a la base de datos host_state
  useEffect(() => {
    let playerTimeoutId;
    let prevPlayerState = usePlayerStore.getState();
    const unsubPlayer = usePlayerStore.subscribe((state) => {
      const dbKeys = ['queue', 'playHistory'];
      const changed = dbKeys.some(k => state[k] !== prevPlayerState[k]);
      
      if (changed) {
        clearTimeout(playerTimeoutId);
        playerTimeoutId = setTimeout(async () => {
          const { data: { user: sbUser } } = await supabase.auth.getUser();
          if (sbUser) {
            await supabase.from('host_state').upsert({
              user_id: sbUser.id,
              queue: state.queue,
              play_history: state.playHistory
            });
          }
        }, 3000); // 3 seconds debounce for queue/history
      }
      prevPlayerState = state;
    });

    return () => {
      clearTimeout(playerTimeoutId);
      unsubPlayer();
    };
  }, []);

  if (!isAuthenticated && !isAdminMode) {
    return <Navigate to="/" replace />;
  }

  if (kickedOut) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-bg-root text-text-primary p-6 text-center z-[9999] relative">
        <AlertCircle size={64} className="text-danger mb-6" />
        <h1 className="text-3xl font-bold mb-4">Sesión Abierta en Otra Pestaña</h1>
        <p className="text-text-muted max-w-md">
          Has abierto el reproductor de Envairo en otra pestaña de este navegador. Para evitar conflictos, esta pestaña ha sido desconectada.
        </p>
        <button onClick={() => window.location.reload()} className="mt-8 btn-primary px-8 py-3">
          Reconectar aquí
        </button>
      </div>
    );
  }

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
