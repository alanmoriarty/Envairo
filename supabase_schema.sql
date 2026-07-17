-- Eliminar tablas si existen (para facilitar reinicios)
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS sessions;

-- Crear tabla de Sesiones
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  active BOOLEAN DEFAULT true,
  mode TEXT DEFAULT 'party',
  blacklist_genres JSONB DEFAULT '[]',
  whitelist_artists JSONB DEFAULT '[]',
  blacklist_artists JSONB DEFAULT '[]',
  allow_repeats BOOLEAN DEFAULT true,
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

-- Políticas ultra-permisivas para prototipo rápido (Cualquiera puede leer y escribir)
-- IMPORTANTE: En producción real, se pueden ajustar para que los invitados solo escriban y el host administre.
CREATE POLICY "Public profiles are viewable by everyone." ON sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert a session." ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update a session." ON sessions FOR UPDATE USING (true);

CREATE POLICY "Public requests are viewable by everyone." ON requests FOR SELECT USING (true);
CREATE POLICY "Anyone can insert a request." ON requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update a request." ON requests FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete a request." ON requests FOR DELETE USING (true);

-- Habilitar REALTIME para que la app se actualice instantáneamente sin recargar la página
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE requests;
