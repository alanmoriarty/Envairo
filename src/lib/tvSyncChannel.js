// Shared reference to the active Supabase Realtime channel for TV sync.
// Set by useTVBroadcast on mount, consumed by useYouTubeSDK for DJ transitions.
// This avoids creating ephemeral Supabase channels that compete with the
// permanent one managed by useTVBroadcast.

let activeTvSyncChannel = null;

export function setTvSyncChannel(channel) {
  activeTvSyncChannel = channel;
}

export function getTvSyncChannel() {
  return activeTvSyncChannel;
}
