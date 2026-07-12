import React, { useEffect } from 'react';
import { Toaster } from 'sonner';
import AppRouter from './router';
import { usePlayerStore } from './store/usePlayerStore';

export default function App() {
  // Sincronizar el estado entre pestañas (Host vs Guest local)
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'bq-player') {
        usePlayerStore.persist.rehydrate();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <>
      <AppRouter />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#161224',
            border: '1px solid rgba(157,78,221,0.3)',
            color: '#F1ECF9',
            borderRadius: '12px',
            fontFamily: 'Inter, sans-serif',
          },
          className: 'shadow-glow-sm',
        }}
        richColors
      />
    </>
  );
}
