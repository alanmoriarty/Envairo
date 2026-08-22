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
        window._isEnvairoLoggingOut = true;
        const { hostSecret, isAdminMode, sessionId } = useSettingsStore.getState();
        const currentUser = get().user;
        const sessionIdToClose = currentUser?.id || sessionId;
        
        // Guardar el estado actual en la base de datos y apagar las peticiones antes de salir
        if (sessionIdToClose && !skipDbUpdate) {
          try {
            const { supabase } = await import('../lib/supabase');
            const playerState = usePlayerStore.getState();
            
            // Si es Control Remoto, solo libera el active_remote_id sin apagar la sala ni las peticiones
            // Si es el Anfitrión Principal, apaga la sala (active: false) exactamente como el botón de "Cerrar Peticiones"
            const updates = isAdminMode ? {
              active_remote_id: null,
              updated_at: new Date().toISOString()
            } : { 
              queue: playerState.queue || [],
              current_queue_index: playerState.currentQueueIndex ?? -1,
              current_track: playerState.currentTrack || null,
              play_history: playerState.playHistory || [],
              active_instance_id: null,
              active_device_id: null,
              active_remote_id: null,
              active: false,
              updated_at: new Date().toISOString()
            };

            // Ejecutar sync_host_config RPC directamente (SECURITY DEFINER garantiza el update)
            if (hostSecret) {
              await supabase.rpc('sync_host_config', { 
                p_session_id: sessionIdToClose, 
                p_secret: hostSecret, 
                p_updates: updates
              });
            } else {
              await supabase
                .from('sessions')
                .update(updates)
                .eq('id', sessionIdToClose);
            }

            // También actualizar host_settings en user_metadata para persistir alwaysAvailable: false
            if (!isAdminMode && currentUser) {
              const currentState = useSettingsStore.getState();
              const settingsObj = {};
              const allKeys = ['djName', 'djAvatar', 'enairoPrompt', 'enairoEnabled', 'enairoTestMode', 'whitelistGenres', 'mode', 'eventName', 'blacklistGenres', 'blacklistSongs', 'blacklistArtists', 'allowRepeats', 'repeatCooldown', 'alwaysAvailable', 'startTime', 'endTime', 'cooldownEnabled', 'cooldownMinutes', 'tableCount', 'requestsPerHour', 'requestsPerGuest', 'explicitFilter', 'partyRequestOffset'];
              allKeys.forEach(k => { settingsObj[k] = currentState[k]; });
              settingsObj.alwaysAvailable = false;

              await supabase.auth.updateUser({
                data: { host_settings: JSON.stringify(settingsObj) }
              }).catch(() => {});
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

        setTimeout(() => {
          window._isEnvairoLoggingOut = false;
        }, 500);
      },
    }),
    { 
      name: 'bq-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated })
    }
  )
);
