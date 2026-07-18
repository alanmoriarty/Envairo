-- Eliminar tablas si existen (para facilitar reinicios)
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS sessions;

-- Crear tabla de Sesiones
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  active BOOLEAN DEFAULT true,
  mode TEXT DEFAULT 'party',
  blacklist_genres JSONB DEFAULT '[]',
  blacklist_songs JSONB DEFAULT '[]',
  blacklist_artists JSONB DEFAULT '[]',
  allow_repeats BOOLEAN DEFAULT true,
  cooldown_enabled BOOLEAN DEFAULT true,
  cooldown_minutes INTEGER DEFAULT 10,
  table_count INTEGER DEFAULT 0,
  requests_per_guest INTEGER DEFAULT 0,
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
-- Eliminada la política pública de UPDATE en sessions. Solo el Host debe empujar actualizaciones.
-- (En un entorno con Auth completo, aquí iría: ON sessions FOR UPDATE USING (auth.uid() = host_id))

CREATE POLICY "Public requests are viewable by everyone." ON requests FOR SELECT USING (true);
CREATE POLICY "Anyone can insert a request." ON requests FOR INSERT WITH CHECK (true);
-- Eliminadas las políticas públicas de UPDATE y DELETE en requests para evitar manipulación por parte de invitados maliciosos.

-- Habilitar REALTIME para que la app se actualice instantáneamente sin recargar la página
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE requests;
