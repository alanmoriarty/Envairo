-- Eliminar tablas si existen (para facilitar reinicios)
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS sessions;

-- Crear tabla de Sesiones
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  host_secret UUID, -- Secreto de administración para el host
  active BOOLEAN DEFAULT true,
  mode TEXT DEFAULT 'party',
  blacklist_genres JSONB DEFAULT '[]',
  blacklist_songs JSONB DEFAULT '[]',
  blacklist_artists JSONB DEFAULT '[]',
  allow_repeats BOOLEAN DEFAULT true,
  cooldown_enabled BOOLEAN DEFAULT true,
  cooldown_minutes INTEGER DEFAULT 10,
  table_count INTEGER DEFAULT 0,
  requests_per_hour INTEGER DEFAULT 15,
  requests_per_guest INTEGER DEFAULT 0,
  queue JSONB DEFAULT '[]',
  current_queue_index INTEGER DEFAULT -1,
  current_track JSONB,
  play_history JSONB DEFAULT '[]',
  paired_tvs JSONB DEFAULT '[]',
  active_device_id TEXT,
  active_instance_id UUID, -- ID de la pestaña/navegador principal activo (para Kickout)
  supabase_user_id UUID, -- Enlace con Supabase Auth
  active_remote_id UUID, -- ID del control remoto activo (para kickout de remotos)
  playback_command JSONB, -- Comandos del control remoto: { action: 'play'|'pause'|'next'|'prev', ts: 1234 }
  volume INTEGER DEFAULT 70,
  playback_engine TEXT DEFAULT 'spotify', -- Motor activo: 'spotify' o 'youtube'
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Crear tabla de Peticiones (Requests)
CREATE TABLE requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  track JSONB NOT NULL,
  requester TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS (Row Level Security) para permitir que los invitados lean y escriban sin necesidad de iniciar sesión
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad (Restringidas para Producción)
CREATE POLICY "Public profiles are viewable by everyone." ON sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert a session." ON sessions FOR INSERT WITH CHECK (true);
-- Eliminada la política pública de UPDATE en sessions. Solo el Host actualizará mediante RPC.

CREATE POLICY "Public requests are viewable by everyone." ON requests FOR SELECT USING (true);
CREATE POLICY "Anyone can insert a request." ON requests FOR INSERT WITH CHECK (true);
-- Eliminadas las políticas públicas de UPDATE y DELETE en requests.

-- Funciones RPC Seguras para el Host (Bypass RLS si conocen el host_secret)

-- 1. Actualizar estado de la sesión (Bulletproof UPSERT)
CREATE OR REPLACE FUNCTION sync_host_config(p_session_id TEXT, p_secret UUID, p_updates JSONB)
RETURNS VOID AS $$
DECLARE
  v_real_secret UUID;
  v_exists BOOLEAN;
BEGIN
  -- Verificar si la sesión existe
  SELECT host_secret INTO v_real_secret FROM sessions WHERE id = p_session_id;
  
  IF v_real_secret IS NULL THEN
    -- Si no existe, la creamos (UPSERT)
    INSERT INTO sessions (id, host_secret, supabase_user_id, active)
    VALUES (p_session_id, COALESCE(p_secret, gen_random_uuid()), auth.uid(), true);
    
    v_real_secret := p_secret;
  END IF;

  -- Validar secreto (O si somos el dueño autenticado, forzamos bypass)
  IF p_secret = v_real_secret OR p_session_id = auth.uid()::text THEN
    UPDATE sessions SET
      active = COALESCE((p_updates->>'active')::BOOLEAN, active),
      mode = COALESCE((p_updates->>'mode')::TEXT, mode),
      blacklist_genres = COALESCE(p_updates->'blacklist_genres', blacklist_genres),
      blacklist_songs = COALESCE(p_updates->'blacklist_songs', blacklist_songs),
      blacklist_artists = COALESCE(p_updates->'blacklist_artists', blacklist_artists),
      allow_repeats = COALESCE((p_updates->>'allow_repeats')::BOOLEAN, allow_repeats),
      cooldown_enabled = COALESCE((p_updates->>'cooldown_enabled')::BOOLEAN, cooldown_enabled),
      cooldown_minutes = COALESCE((p_updates->>'cooldown_minutes')::INTEGER, cooldown_minutes),
      table_count = COALESCE((p_updates->>'table_count')::INTEGER, table_count),
      requests_per_hour = COALESCE((p_updates->>'requests_per_hour')::INTEGER, requests_per_hour),
      requests_per_guest = COALESCE((p_updates->>'requests_per_guest')::INTEGER, requests_per_guest),
      queue = COALESCE(p_updates->'queue', queue),
      current_queue_index = COALESCE((p_updates->>'current_queue_index')::INTEGER, current_queue_index),
      current_track = COALESCE(p_updates->'current_track', current_track),
      play_history = COALESCE(p_updates->'play_history', play_history),
      paired_tvs = COALESCE(p_updates->'paired_tvs', paired_tvs),
      active_device_id = COALESCE((p_updates->>'active_device_id')::TEXT, active_device_id),
      active_remote_id = COALESCE((p_updates->>'active_remote_id')::UUID, active_remote_id),
      playback_command = COALESCE(p_updates->'playback_command', playback_command),
      volume = COALESCE((p_updates->>'volume')::INTEGER, volume),
      playback_engine = COALESCE((p_updates->>'playback_engine')::TEXT, playback_engine),
      updated_at = COALESCE((p_updates->>'updated_at')::TIMESTAMP WITH TIME ZONE, updated_at)
    WHERE id = p_session_id;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1.5 Toma de control por el Host Autenticado
CREATE OR REPLACE FUNCTION host_takeover_session(p_session_id TEXT, p_active_instance_id UUID, p_secret UUID DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  v_secret UUID;
BEGIN
  -- Verificar si el usuario está autenticado y es el dueño de la sesión
  -- Permitir si id coincide con auth.uid(), supabase_user_id coincide, O si se provee el secreto correcto
  UPDATE sessions 
  SET active_instance_id = p_active_instance_id,
      active_device_id = NULL, -- Reseteamos el reproductor de Spotify para que el nuevo dispositivo lo reclame
      supabase_user_id = COALESCE(supabase_user_id, auth.uid()), -- Auto-corregir el supabase_user_id faltante en sesiones antiguas
      host_secret = COALESCE(host_secret, gen_random_uuid()) -- Auto-generar host_secret si estaba vacío en sesiones antiguas
  WHERE id = p_session_id AND (
    supabase_user_id = auth.uid() OR 
    id = auth.uid()::text OR 
    (p_secret IS NOT NULL AND host_secret = p_secret) OR
    (supabase_user_id IS NULL AND auth.uid() IS NOT NULL) -- Si era huérfana, el primero autenticado se la queda
  )
  RETURNING host_secret INTO v_secret;
  
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'No autorizado o sesión no encontrada';
  END IF;

  RETURN v_secret;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Manejar peticiones (Aprobar/Rechazar)
CREATE OR REPLACE FUNCTION manage_request(p_request_id UUID, p_session_id TEXT, p_secret UUID, p_new_status TEXT)
RETURNS VOID AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND (host_secret IS NULL OR host_secret = p_secret)) THEN
    UPDATE requests SET status = p_new_status WHERE id = p_request_id AND session_id = p_session_id;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Invalid host secret';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Habilitar REALTIME para que la app se actualice instantáneamente sin recargar la página
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE requests;
ALTER PUBLICATION supabase_realtime ADD TABLE playlists;

-- Crear tabla de Listas de Reproducción (Playlists)
CREATE TABLE IF NOT EXISTS playlists (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  images JSONB DEFAULT '[]',
  is_custom BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, id)
);

ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own playlists" 
ON playlists FOR ALL 
USING (auth.uid() = user_id);
