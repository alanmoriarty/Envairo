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
        if (sessionIdToClose && hostSecret && !skipDbUpdate) {
          try {
            const { supabase } = await import('../lib/supabase');
            const playerState = usePlayerStore.getState();
            await supabase.rpc('sync_host_config', { 
              p_session_id: sessionIdToClose, 
              p_secret: hostSecret, 
              p_updates: { 
                queue: playerState.queue,
                current_queue_index: playerState.currentQueueIndex,
                current_track: playerState.currentTrack,
                play_history: playerState.playHistory,
                active: true 
              } 
            });
            await supabase.auth.signOut({ scope: 'local' });
          } catch (err) {
            console.error(err);
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
        
        // Mantener la cola y el historial guardados localmente para cuando vuelva a iniciar sesión
        // Limpiar únicamente credenciales sensibles y tokens de autenticación
        localStorage.removeItem('bq-auth');
        
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
