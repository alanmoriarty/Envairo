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
