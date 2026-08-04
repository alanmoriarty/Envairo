-- =============================================================================
-- MIGRACION: Sistema de tokens de acceso por invitado (6h de validez personal)
-- Fecha: 2026-08-04 (v2 - corrige diseño anterior)
-- 
-- Diseño correcto:
--   - qr_token en sessions: "llave" permanente del QR del host.
--     NO expira por tiempo. Solo cambia cuando el host regenera el QR.
--   - guest_access: tabla de tokens por invitado. Cada vez que alguien
--     escanea el QR con un qr_token válido, obtiene su propio token de 6h.
--     Así el QR del host sigue funcionando indefinidamente.
-- =============================================================================

-- 1. Asegurarse de que qr_token y qr_issued_at existen en sessions
--    (pueden existir de la migración anterior)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS qr_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS qr_issued_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Tabla de accesos individuales por invitado
CREATE TABLE IF NOT EXISTS guest_access (
  token      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: solo accesible mediante RPCs con SECURITY DEFINER
ALTER TABLE guest_access ENABLE ROW LEVEL SECURITY;
-- Sin políticas públicas: nadie puede leer/escribir directamente

-- 3. RPC: canjear qr_token por un guest_access_token personal (6h de validez)
--    El invitado llama a esto una vez al llegar. El resultado se guarda en localStorage.
CREATE OR REPLACE FUNCTION create_guest_access(
  p_session_id TEXT,
  p_qr_token   UUID
)
RETURNS UUID AS $$
DECLARE
  v_new_token UUID;
BEGIN
  -- Verificar que el qr_token coincide con la sesión activa
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id
      AND active = true
      AND qr_token = p_qr_token
  ) THEN
    RAISE EXCEPTION 'INVALID_QR_TOKEN'
      USING HINT = 'El código QR no es válido para esta sesión';
  END IF;

  -- Emitir un token de acceso personal
  INSERT INTO guest_access (session_id)
  VALUES (p_session_id)
  RETURNING token INTO v_new_token;

  RETURN v_new_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: rotar el token QR del host (invalida nuevos accesos con el QR anterior,
--    pero NO revoca los guest_access ya emitidos: los invitados actuales mantienen su sesión)
CREATE OR REPLACE FUNCTION rotate_qr_token(p_session_id TEXT, p_secret UUID)
RETURNS UUID AS $$
DECLARE
  v_new_token UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id
      AND (host_secret = p_secret OR supabase_user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Invalid host secret';
  END IF;

  v_new_token := gen_random_uuid();
  UPDATE sessions
     SET qr_token = v_new_token,
         qr_issued_at = NOW()
   WHERE id = p_session_id;

  RETURN v_new_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Actualizar submit_guest_request para validar el guest_access_token individual
CREATE OR REPLACE FUNCTION submit_guest_request(
  p_session_id   TEXT,
  p_track        JSONB,
  p_requester    TEXT,
  p_guest_token  UUID DEFAULT NULL   -- token personal del invitado (6h desde escaneo)
)
RETURNS JSONB AS $$
DECLARE
  v_session        sessions%ROWTYPE;
  v_hourly_count   INTEGER;
  v_one_hour_ago   TIMESTAMPTZ;
  v_new_request    requests%ROWTYPE;
  v_requester_safe TEXT;
BEGIN
  -- 1. Verificar que la sesión existe y está activa
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  -- 2. Validar el token de acceso personal del invitado
  IF p_guest_token IS NOT NULL THEN
    -- El token debe existir y pertenecer a esta sesión
    IF NOT EXISTS (
      SELECT 1 FROM guest_access
      WHERE token = p_guest_token
        AND session_id = p_session_id
    ) THEN
      RAISE EXCEPTION 'INVALID_TOKEN'
        USING HINT = 'Token de invitado inválido. Escanea el QR nuevamente.';
    END IF;

    -- El token no debe tener más de 6 horas
    IF NOT EXISTS (
      SELECT 1 FROM guest_access
      WHERE token = p_guest_token
        AND session_id = p_session_id
        AND created_at > NOW() - INTERVAL '6 hours'
    ) THEN
      -- Limpiar token expirado
      DELETE FROM guest_access WHERE token = p_guest_token;
      RAISE EXCEPTION 'TOKEN_EXPIRED'
        USING HINT = 'Tu acceso expiró (6 horas). Escanea el QR nuevamente.';
    END IF;
  END IF;

  -- 3. Validar límite global de requests por hora
  v_one_hour_ago := NOW() - INTERVAL '1 hour';
  SELECT COUNT(*) INTO v_hourly_count
    FROM requests
   WHERE session_id = p_session_id
     AND created_at > v_one_hour_ago;

  IF v_session.requests_per_hour > 0
     AND v_hourly_count >= v_session.requests_per_hour
  THEN
    RAISE EXCEPTION 'HOURLY_LIMIT_REACHED';
  END IF;

  -- 4. Sanitizar nombre del solicitante
  v_requester_safe := left(trim(COALESCE(p_requester, 'Anónimo')), 100);
  IF v_requester_safe = '' THEN v_requester_safe := 'Anónimo'; END IF;

  -- 5. Insertar la petición
  INSERT INTO requests (session_id, track, requester, status)
  VALUES (p_session_id, p_track, v_requester_safe, 'pending')
  RETURNING * INTO v_new_request;

  RETURN to_jsonb(v_new_request);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Limpieza automática: borrar guest_access vencidos (opcional, mejora performance)
--    Puedes crear un cron job en Supabase para ejecutar esto periódicamente:
--    DELETE FROM guest_access WHERE created_at < NOW() - INTERVAL '7 hours';
