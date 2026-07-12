import { useEffect } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';

const AUTO_DJ_TRACKS = [
  {
    id: 'auto-1',
    uri: 'spotify:track:3n3Ppam7vgaVa1iaRUIOKE',
    name: 'Mr. Brightside',
    artists: 'The Killers',
    album: 'Hot Fuss',
    image: 'https://i.scdn.co/image/ab67616d0000b2737ae7c9745d79e0e63a20b6b0',
    duration_ms: 222973,
    genre: 'indie rock',
  },
  {
    id: 'auto-2',
    uri: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
    name: 'Shape of You',
    artists: 'Ed Sheeran',
    album: '÷ (Divide)',
    image: 'https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96',
    duration_ms: 233713,
    genre: 'pop',
  },
  {
    id: 'auto-3',
    uri: 'spotify:track:7qiZfU4dY1lWllzX7mPBI3',
    name: 'Shape of My Heart',
    artists: 'Sting',
    album: 'Ten Summoner\'s Tales',
    image: 'https://i.scdn.co/image/ab67616d0000b2732a038d3bf875d23e4aeaa84e',
    duration_ms: 270613,
    genre: 'pop',
  },
];

export function useAutoDJ(controls) {
  const { autoDJ, whitelistGenres } = useSettingsStore();
  const { queue, isPlaying, currentTrack, addToQueue } = usePlayerStore();

  useEffect(() => {
    if (!autoDJ) return;
    if (queue.length > 0) return;
    if (!currentTrack) return; // player not started yet

    // Pick a random auto-DJ track compatible with whitelist
    const candidates =
      whitelistGenres.length === 0
        ? AUTO_DJ_TRACKS
        : AUTO_DJ_TRACKS.filter((t) =>
            whitelistGenres.some((g) =>
              t.genre?.toLowerCase().includes(g.toLowerCase())
            )
          );

    const fallback = candidates.length ? candidates : AUTO_DJ_TRACKS;
    const track = fallback[Math.floor(Math.random() * fallback.length)];

    // Add with a slight delay for UX
    const timer = setTimeout(() => {
      addToQueue({ ...track, queueId: `autodj-${Date.now()}`, requestedBy: '🤖 Auto-DJ' });
      
      // Si el reproductor está completamente inactivo, arrancar
      const state = usePlayerStore.getState();
      if (!state.currentTrack && state.deviceId) {
        const nextTrack = usePlayerStore.getState().shiftQueue();
        if (nextTrack) {
          import('../lib/spotifyApi')
            .then(({ playTrack }) => playTrack(state.deviceId, [nextTrack.uri]))
            .catch(console.error);
        }
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [autoDJ, queue.length, currentTrack]);
}
