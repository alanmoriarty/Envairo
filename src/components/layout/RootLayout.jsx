import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PersistentPlayer } from './PersistentPlayer';
import { useSpotifySDK } from '../../hooks/useSpotifySDK';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useQueueSync } from '../../hooks/useQueueSync';
import { supabase } from '../../lib/supabase';
import { Menu, Music2 } from 'lucide-react';
import { useEnairoSelector } from '../../hooks/useEnairoSelector';
import { useAutoQueue } from '../../hooks/useAutoQueue';

export function RootLayout() {
  const { controls } = useSpotifySDK();
  const { isAuthenticated, user } = useAuthStore();
  const { isAdminMode } = useSettingsStore();
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

  // Sincronizar configuraciones en tiempo real hacia Supabase desde cualquier pantalla
  useEffect(() => {
    const sessionId = useSettingsStore.getState().sessionId;
    if (!sessionId) return;

    const unsubSettings = useSettingsStore.subscribe((state, prevState) => {
      const relevantKeys = ['mode', 'whitelistGenres', 'blacklistGenres', 'blacklistSongs', 'blacklistArtists', 'allowRepeats', 'cooldownEnabled', 'cooldownMinutes', 'tableCount', 'requestsPerHour', 'requestsPerGuest'];
      const changed = relevantKeys.some(k => state[k] !== prevState[k]);
      if (changed) {
        supabase.from('sessions').update({
          mode: state.mode,
          whitelist_genres: state.whitelistGenres,
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
        }).eq('id', sessionId).then();
      }
    });
    return () => unsubSettings();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-bg-root overflow-hidden">
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Header */}
        <div className="md:hidden absolute top-0 left-0 right-0 h-16 bg-bg-card border-b border-white/5 flex items-center justify-between px-4 z-30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <Music2 size={16} className="text-accent" />
            </div>
            <span className="font-bold text-text-primary">Envairo</span>
          </div>
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-text-muted hover:text-white">
            <Menu size={24} />
          </button>
        </div>

        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
        <main className="flex-1 md:ml-64 mt-16 md:mt-0 overflow-y-auto flex flex-col relative">
          <div className="radial-gradient-bg flex-1 flex flex-col pb-6">
            <Outlet />
          </div>
        </main>
      </div>
      
      {/* Footer Player */}
      {!isAdminMode && <PersistentPlayer />}
    </div>
  );
}
