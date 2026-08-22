-- =============================================================================
-- MIGRACION: Expiración dinámica de sesión de invitados configurable por el anfitrión
-- Fecha: 2026-08-22
-- =============================================================================

-- 1. Añadir columna guest_session_expiry_hours en sessions si no existe
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS guest_session_expiry_hours INT DEFAULT 6;

-- 2. Actualizar submit_guest_request para respetar la duración configurada en la sesión
CREATE OR REPLACE FUNCTION submit_guest_request(
  p_session_id   TEXT,
  p_track        JSONB,
  p_requester    TEXT,
  p_guest_token  UUID DEFAULT NULL   -- token personal del invitado
)
RETURNS JSONB AS $$
DECLARE
  v_session        sessions%ROWTYPE;
  v_hourly_count   INTEGER;
  v_one_hour_ago   TIMESTAMPTZ;
  v_new_request    requests%ROWTYPE;
  v_requester_safe TEXT;
  v_expiry_hours   INT;
BEGIN
  -- 1. Verificar que la sesión existe y está activa
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  -- Determinar las horas de validez de la sesión (por defecto 6 horas si no se especificó)
  v_expiry_hours := COALESCE(v_session.guest_session_expiry_hours, 6);

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

    -- El token no debe exceder el tiempo de expiración configurado por el host
    IF NOT EXISTS (
      SELECT 1 FROM guest_access
      WHERE token = p_guest_token
        AND session_id = p_session_id
        AND created_at > NOW() - (v_expiry_hours || ' hours')::INTERVAL
    ) THEN
      -- Limpiar token expirado
      DELETE FROM guest_access WHERE token = p_guest_token;
      RAISE EXCEPTION 'TOKEN_EXPIRED'
        USING HINT = 'Tu acceso ha caducado. Escanea el QR nuevamente.';
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
