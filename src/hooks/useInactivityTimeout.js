import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { toast } from 'sonner';

// 1 hora en milisegundos
const TIMEOUT_MS = 60 * 60 * 1000;

export function useInactivityTimeout() {
  const { user, logout } = useAuthStore();
  const { isPlaying } = usePlayerStore();
  const { isAdminMode } = useSettingsStore();
  const timerRef = useRef(null);

  useEffect(() => {
    // Si no hay un usuario autenticado, o es un control remoto, o es una vista de invitado (fuera de /app), no hacemos nada
    if (!user || isAdminMode || !window.location.pathname.startsWith('/app')) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const handleLogout = async () => {
      toast('Sesión cerrada por inactividad prolongada.', { icon: '💤' });
      
      try {
        const state = usePlayerStore.getState();
        if (state.youtubePlayer) state.youtubePlayer.pauseVideo();
      } catch (e) {}

      logout();
    };

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      
      // Si la música está sonando, no iniciamos el temporizador de cierre de sesión
      if (isPlaying) return;

      // Si no está sonando nada, iniciamos la cuenta regresiva de 1 hora
      timerRef.current = setTimeout(handleLogout, TIMEOUT_MS);
    };

    // Eventos que cuentan como "actividad"
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

    const handleActivity = () => resetTimer();

    // Agregar listeners
    events.forEach(event => window.addEventListener(event, handleActivity));

    // Iniciar temporizador por primera vez
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(event => window.removeEventListener(event, handleActivity));
    };
  }, [user, isPlaying, logout]);
}
