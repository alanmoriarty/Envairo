import { create } from 'zustand';

export const usePwaStore = create((set) => ({
  deferredPrompt: null,
  isInstallable: false,
  setDeferredPrompt: (prompt) => set({ deferredPrompt: prompt, isInstallable: !!prompt }),
  clearPrompt: () => set({ deferredPrompt: null, isInstallable: false }),
}));
