-- =============================================================================
-- MIGRACION: Blindaje Integral de Seguridad en Servidor para Peticiones de Invitados
-- Fecha: 2026-08-22
-- =============================================================================

-- 1. Añadir columna last_request_at en guest_access para controlar enfriamiento en servidor
ALTER TABLE guest_access
  ADD COLUMN IF NOT EXISTS last_request_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Añadir columna guest_token en requests para controlar límite de peticiones por invitado
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS guest_token UUID DEFAULT NULL;

-- 3. Actualizar la función RPC submit_guest_request con validaciones obligatorias en servidor
CREATE OR REPLACE FUNCTION submit_guest_request(
  p_session_id   TEXT,
  p_track        JSONB,
  p_requester    TEXT,
  p_guest_token  UUID   -- Obligatorio: debe ser un UUID emitido al escanear el QR
)
RETURNS JSONB AS $$
DECLARE
  v_session           sessions%ROWTYPE;
  v_guest_access      guest_access%ROWTYPE;
  v_hourly_count      INTEGER;
  v_guest_req_count   INTEGER;
  v_one_hour_ago      TIMESTAMPTZ;
  v_new_request       requests%ROWTYPE;
  v_requester_safe    TEXT;
  v_expiry_hours      INT;
  v_cooldown_minutes  INT;
  v_remaining_seconds INT;
BEGIN
  -- 1. Validar que se suministró el token de invitado
  IF p_guest_token IS NULL THEN
    RAISE EXCEPTION 'MISSING_GUEST_TOKEN'
      USING HINT = 'Debes escanear el código QR para enviar peticiones a esta fiesta.';
  END IF;

  -- 2. Verificar que la sesión existe y está activa
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND'
      USING HINT = 'La sesión no existe o las peticiones se encuentran cerradas por el anfitrión.';
  END IF;

  -- Determinar las horas de validez de la sesión (por defecto 6 horas si no se especificó)
  v_expiry_hours := COALESCE(v_session.guest_session_expiry_hours, 6);

  -- 3. Validar que el token existe en la tabla guest_access y pertenece a esta sesión
  SELECT * INTO v_guest_access
    FROM guest_access
   WHERE token = p_guest_token
     AND session_id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_TOKEN'
      USING HINT = 'Token de invitado no válido. Por favor, escanea el código QR nuevamente.';
  END IF;

  -- 4. Validar expiración del token según la duración configurada
  IF v_guest_access.created_at <= NOW() - (v_expiry_hours || ' hours')::INTERVAL THEN
    -- Limpiar token expirado
    DELETE FROM guest_access WHERE token = p_guest_token;
    RAISE EXCEPTION 'TOKEN_EXPIRED'
      USING HINT = 'Tu acceso ha caducado. Escanea el código QR nuevamente para continuar.';
  END IF;

  -- 5. Validar Enfriamiento por Usuario en Servidor (cooldown_minutes)
  v_cooldown_minutes := COALESCE(v_session.cooldown_minutes, 0);
  IF v_session.cooldown_enabled = true AND v_cooldown_minutes > 0 AND v_guest_access.last_request_at IS NOT NULL THEN
    IF v_guest_access.last_request_at > NOW() - (v_cooldown_minutes || ' minutes')::INTERVAL THEN
      v_remaining_seconds := EXTRACT(EPOCH FROM (v_guest_access.last_request_at + (v_cooldown_minutes || ' minutes')::INTERVAL - NOW()))::INT;
      RAISE EXCEPTION 'COOLDOWN_ACTIVE'
        USING HINT = 'Debes esperar antes de enviar otra petición (' || CEIL(v_remaining_seconds / 60.0) || ' min restantes).';
    END IF;
  END IF;

  -- 6. Validar Límite de Peticiones por Invitado en Servidor (requests_per_guest)
  IF COALESCE(v_session.requests_per_guest, 0) > 0 THEN
    SELECT COUNT(*) INTO v_guest_req_count
      FROM requests
     WHERE session_id = p_session_id
       AND guest_token = p_guest_token;

    IF v_guest_req_count >= v_session.requests_per_guest THEN
      RAISE EXCEPTION 'GUEST_LIMIT_REACHED'
        USING HINT = 'Has alcanzado el límite máximo de peticiones permitidas por persona en este evento.';
    END IF;
  END IF;

  -- 7. Validar Límite Global de Peticiones por Hora en Servidor (requests_per_hour)
  v_one_hour_ago := NOW() - INTERVAL '1 hour';
  SELECT COUNT(*) INTO v_hourly_count
    FROM requests
   WHERE session_id = p_session_id
     AND created_at > v_one_hour_ago;

  IF COALESCE(v_session.requests_per_hour, 0) > 0
     AND v_hourly_count >= v_session.requests_per_hour
  THEN
    RAISE EXCEPTION 'HOURLY_LIMIT_REACHED'
      USING HINT = 'Se ha alcanzado el límite por hora de peticiones en este evento. Intenta más tarde.';
  END IF;

  -- 8. Sanitizar nombre del solicitante
  v_requester_safe := left(trim(COALESCE(p_requester, 'Anónimo')), 100);
  IF v_requester_safe = '' THEN v_requester_safe := 'Anónimo'; END IF;

  -- 9. Insertar la petición vinculando el token del invitado
  INSERT INTO requests (session_id, track, requester, status, guest_token)
  VALUES (p_session_id, p_track, v_requester_safe, 'pending', p_guest_token)
  RETURNING * INTO v_new_request;

  -- 10. Actualizar la marca de tiempo del último envío del invitado
  UPDATE guest_access
     SET last_request_at = NOW()
   WHERE token = p_guest_token;

  RETURN to_jsonb(v_new_request);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
