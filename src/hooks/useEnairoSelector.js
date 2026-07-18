import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { supabase } from '../lib/supabase';
import { searchTracks } from '../lib/spotifyApi';
import { toast } from 'sonner';

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

      // Evitar llamadas múltiples o spam
      if (isThinking || (now - enairoLastRunAt < 30000)) return;
      
      // La IA trabajará por lotes:
      // Solo se llama a la IA si:
      // 1. La cola se está quedando vacía (<= 10 canciones)
      // 2. O si acaba de ser activado manualmente (hace menos de 5 segundos)
      // 3. O si ya pasó 1 hora desde la última revisión (3600000 ms)
      const justStarted = enairoStartedAt && (now - enairoStartedAt < 5000);
      const isQueueLow = queue.length <= 10;
      const hourPassed = (now - enairoLastRunAt >= 3600000);
      
      if (!justStarted && !isQueueLow && !hourPassed) return;
      
      setIsThinking(true);
      // Se setea primero un timestamp temporal de 30 segundos para evitar spam si hay errores
      setEnairoLastRunAt(now - 3600000 + 30000); 

      
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
              const results = await searchTracks(query, 1);
              if (results && results.tracks && results.tracks.items && results.tracks.items.length > 0) {
                const spotifyTrack = results.tracks.items[0];
                // Formatear la canción para el store interno
                const track = {
                  id: spotifyTrack.id,
                  name: spotifyTrack.name,
                  artists: spotifyTrack.artists.map(a => a.name).join(', '),
                  image: spotifyTrack.album?.images?.[0]?.url || '',
                  duration_ms: spotifyTrack.duration_ms,
                  uri: spotifyTrack.uri,
                  addedBy: 'EnvAIro Selector'
                };
                addToQueue(track);
              }
            } catch (err) {
              console.error("Error buscando canción recomendada por EnvAIro:", query, err);
            }
          }
          toast.success(`EnvAIro añadió ${tracksToAdd.length} canciones al ambiente.`);
        }
        
        // Exito total, actualizar timestamp
        setEnairoLastRunAt(Date.now());
        
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
