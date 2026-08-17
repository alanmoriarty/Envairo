import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { usePlayerStore } from './usePlayerStore';
import { useSettingsStore } from './useSettingsStore';

function generateUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: async (skipDbUpdate = false) => {
        const { hostSecret } = useSettingsStore.getState();
        const currentUser = get().user;
        const sessionIdToClose = currentUser?.id || useSettingsStore.getState().sessionId;
        
        // Guardar el estado actual en la base de datos antes de salir
        if (sessionIdToClose && !skipDbUpdate) {
          try {
            const { supabase } = await import('../lib/supabase');
            const playerState = usePlayerStore.getState();
            const updates = { 
              queue: playerState.queue || [],
              current_queue_index: playerState.currentQueueIndex ?? -1,
              current_track: playerState.currentTrack || null,
              play_history: playerState.playHistory || [],
              active: true 
            };

            // 1. Intento directo con las credenciales de usuario autenticado
            const { error: directErr } = await supabase
              .from('sessions')
              .update(updates)
              .eq('id', sessionIdToClose);

            // 2. Si falla o si hay hostSecret, respaldar mediante RPC
            if (directErr && hostSecret) {
              await supabase.rpc('sync_host_config', { 
                p_session_id: sessionIdToClose, 
                p_secret: hostSecret, 
                p_updates: updates
              });
            }
            await supabase.auth.signOut({ scope: 'local' });
          } catch (err) {
            console.error('Error guardando sesión antes de salir:', err);
          }
        } else {
          try {
            const { supabase } = await import('../lib/supabase');
            await supabase.auth.signOut({ scope: 'local' });
          } catch (e) {
            console.error(e);
          }
        }

        set({ user: null, isAuthenticated: false });
        
        // Limpiar estado local del reproductor y configuración para evitar fugas entre cuentas
        usePlayerStore.getState().clearPlayerState();
        useSettingsStore.getState().clearSettingsState();
        
        // Limpiar credenciales sensibles y tokens de autenticación
        localStorage.removeItem('bq-auth');
        localStorage.removeItem('bq-player');
        localStorage.removeItem('bq-settings');
        
        // Asegurar que el token de Supabase se elimine localmente
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
            localStorage.removeItem(key);
          }
        });
        // Limpiar token OAuth de YouTube de sessionStorage
        sessionStorage.removeItem('youtube_access_token');
        sessionStorage.removeItem('youtube_token_expires_at');
      },
    }),
    { 
      name: 'bq-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated })
    }
  )
);
