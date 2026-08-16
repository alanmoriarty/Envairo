// Shared reference and dispatcher for Supabase Realtime session channel.
// Enables sub-50ms playback control from Admin Remotes to the Host.

import { supabase } from './supabase';
import { useSettingsStore } from '../store/useSettingsStore';

let activeSessionChannel = null;
let lastRemoteActionTs = 0;

export function setActiveSessionChannel(channel) {
  activeSessionChannel = channel;
}

export function getActiveSessionChannel() {
  return activeSessionChannel;
}

export function getLastRemoteActionTs() {
  return lastRemoteActionTs;
}

export function setLastRemoteActionTs(ts) {
  lastRemoteActionTs = ts;
}

/**
 * Sends a playback command from the remote to the host.
 * 1. Broadcasts immediately over WebSocket (<50ms execution on Host).
 * 2. Sets optimistic lock timestamp to prevent button flicker.
 * 3. Persists to PostgreSQL in background via sync_host_config RPC.
 */
export async function sendRemotePlaybackCommand(action, params = {}) {
  const ts = Date.now();
  lastRemoteActionTs = ts;

  const command = {
    action,
    ts,
    ...params
  };

  // 1. WebSocket Broadcast inmediato (<50ms)
  if (activeSessionChannel && activeSessionChannel.state === 'joined') {
    activeSessionChannel.send({
      type: 'broadcast',
      event: 'remote_command',
      payload: command
    }).catch(err => {
      console.warn('Error broadcasting remote command:', err);
    });
  }

  // 2. Persistencia en Base de Datos en segundo plano
  const { sessionId, hostSecret } = useSettingsStore.getState();
  if (sessionId && hostSecret) {
    supabase.rpc('sync_host_config', {
      p_session_id: sessionId,
      p_secret: hostSecret,
      p_updates: {
        playback_command: command
      }
    }).catch(err => {
      console.error('Error persisting remote command to DB:', err);
    });
  }
}
