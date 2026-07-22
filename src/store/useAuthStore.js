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
    (set) => ({
      user: null,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: () => {
        const { sessionId, hostSecret } = useSettingsStore.getState();
        const currentUser = set.name ? null : null; // Hack para acceder al state, mejor usamos el id directo
        
        // Disparar el apagado de la sesión en la base de datos de inmediato
        if (sessionId && hostSecret) {
          import('../lib/supabase').then(({ supabase }) => {
            supabase.rpc('update_session_state', { 
              p_session_id: sessionId, 
              p_secret: hostSecret, 
              p_updates: { active: false } 
            }).then().catch(console.error);
          });
        }

        set({ user: null, isAuthenticated: false });
        usePlayerStore.getState().clearPlayerState();
        useSettingsStore.getState().clearSettingsState();
      },
    }),
    { 
      name: 'bq-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated })
    }
  )
);
