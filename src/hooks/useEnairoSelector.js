import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { supabase } from '../lib/supabase';
import { searchSpotifyTracks } from '../lib/spotifyApi';
import toast from 'react-hot-toast';

export function useEnairoSelector() {
  const { 
    enairoEnabled, 
    setEnairoEnabled,
    enairoStartedAt,
    enairoLastRunAt,
    setEnairoLastRunAt,
    enairoPrompt, 
    whitelistGenres, 
    blacklistGenres 
  } = useSettingsStore();
  const { queue, playHistory, addToQueue, removeFromQueue, reorderQueue } = usePlayerStore();
  
  const [isThinking, setIsThinking] = useState(false);
  
  useEffect(() => {
    if (!enairoEnabled) return;
    
    const runEnairo = async () => {
      const now = Date.now();

      // Apagado automático de seguridad: Si han pasado más de 3 horas (10800000 ms)
      if (enairoStartedAt && (now - enairoStartedAt) > 10800000) {
        setEnairoEnabled(false);
        toast('EnvAIro Selector se ha desactivado automáticamente tras 3 horas continuas.', { icon: '🤖' });
        return;
      }

      // Evitar llamadas múltiples (esperar al menos 30 segundos entre chequeos por seguridad)
      if (now - enairoLastRunAt < 30000 || isThinking) return;
      
      // La IA trabajará de manera eficiente (por lotes):
      // Solo se llama a la IA si han pasado 60 minutos (3600000 ms) desde la última vez,
      // O si la cola se está quedando vacía (<= 3 canciones).
      if (queue.length > 3 && now - enairoLastRunAt < 3600000) return;
      
      setEnairoLastRunAt(now);
      setIsThinking(true);
      
      try {
        const { data, error } = await supabase.functions.invoke('enairo-selector', {
          body: {
            history: playHistory.slice(0, 5), // últimas 5 canciones
            queue: queue,
            settings: {
              enairoPrompt,
              whitelistGenres,
              blacklistGenres
            }
          }
        });

        if (error) throw error;
        
        const { tracksToAdd = [], actions = [], reasoning } = data;
        
        if (reasoning) {
          console.log("EnvAIro Selector Reasoning:", reasoning);
        }

        // Ejecutar Acciones (Reorder / Remove)
        if (actions.length > 0) {
          actions.forEach(action => {
            if (action.type === 'remove' && action.queueId) {
              removeFromQueue(action.queueId);
              toast.success(`EnvAIro eliminó una canción por no encajar.`);
            } else if (action.type === 'reorder' && action.queueId && typeof action.newIndex === 'number') {
              // Encontrar el índice actual
              const currentQueue = usePlayerStore.getState().queue;
              const oldIndex = currentQueue.findIndex(t => t.queueId === action.queueId);
              if (oldIndex !== -1 && oldIndex !== action.newIndex && action.newIndex < currentQueue.length) {
                reorderQueue(oldIndex, action.newIndex);
              }
            }
          });
        }
        
        // Agregar nuevas canciones
        if (tracksToAdd.length > 0) {
          for (const query of tracksToAdd) {
            try {
              const results = await searchSpotifyTracks(query, 1);
              if (results && results.length > 0) {
                // Añadir a la cola con una marca de que fue agregada por IA
                const track = { ...results[0], addedBy: 'EnvAIro Selector' };
                addToQueue(track);
              }
            } catch (err) {
              console.error("Error buscando canción recomendada por EnvAIro:", query, err);
            }
          }
          toast.success(`EnvAIro añadió ${tracksToAdd.length} canciones al ambiente.`);
        }
        
      } catch (err) {
        console.error("Error en EnvAIro Selector:", err);
      } finally {
        setIsThinking(false);
      }
    };

    // Revisar inmediatamente si se cumplen las condiciones
    runEnairo();
    
    // Y configurar un intervalo de polling cada 15 segundos (la función de arriba controla los límites de tiempo reales)
    const interval = setInterval(runEnairo, 15000);
    return () => clearInterval(interval);
    
  }, [enairoEnabled, enairoStartedAt, setEnairoEnabled, enairoLastRunAt, setEnairoLastRunAt, queue.length, playHistory.length, isThinking, enairoPrompt, whitelistGenres, blacklistGenres]);

  return { isThinking };
}
