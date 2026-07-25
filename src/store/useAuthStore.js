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
        
        // Disparar el apagado de la sesión en la base de datos de inmediato
        if (sessionIdToClose && hostSecret && !skipDbUpdate) {
          try {
            const { supabase } = await import('../lib/supabase');
            await supabase.rpc('sync_host_config', { 
              p_session_id: sessionIdToClose, 
              p_secret: hostSecret, 
              p_updates: { active: false, secret: 'logged_out' } 
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
        usePlayerStore.getState().clearPlayerState();
        useSettingsStore.getState().clearSettingsState();
        
        // Limpiar el almacenamiento local explícitamente para evitar cualquier fuga de estado
        localStorage.removeItem('bq-player');
        localStorage.removeItem('bq-settings');
        localStorage.removeItem('bq-auth');
        
        // Asegurar que el token de Supabase se elimine localmente, incluso si signOut falló
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
            localStorage.removeItem(key);
          }
        });
      },
    }),
    { 
      name: 'bq-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated })
    }
  )
);
