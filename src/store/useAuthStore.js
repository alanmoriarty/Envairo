import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
      activeInstanceId: generateUUID(), // Identificador único para esta pestaña/navegador

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: () => {
        set({ user: null, isAuthenticated: false });
      },
      // Permite regenerar la instancia si se cierra sesión y se vuelve a entrar
      resetInstanceId: () => set({ activeInstanceId: generateUUID() }),
    }),
    { 
      name: 'bq-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...persistedState,
        activeInstanceId: currentState.activeInstanceId, // Forzar uso de la nueva ID generada, ignorando caché viejo
      })
    }
  )
);
