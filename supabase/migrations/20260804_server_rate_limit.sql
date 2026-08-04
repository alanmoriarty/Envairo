-- =============================================================================
-- MIGRACION: Rate limiting server-side para peticiones de invitados
-- Fecha: 2026-08-04
-- Descripcion:
--   1. Crea la funcion RPC `submit_guest_request` con SECURITY DEFINER.
--      Esta funcion valida en el servidor antes de insertar una peticion,
--      cerrando la brecha donde un usuario podia bypassear las restricciones
--      llamando a `supabase.from('requests').insert()` directamente desde DevTools.
--   2. Elimina la policy publica de INSERT en `requests` para que solo el RPC
--      pueda insertar. Los SELECT publicos se mantienen (necesarios para el host).
-- =============================================================================

-- 1. Crear la funcion RPC con validaciones server-side
CREATE OR REPLACE FUNCTION submit_guest_request(
  p_session_id TEXT,
  p_track      JSONB,
  p_requester  TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_session        sessions%ROWTYPE;
  v_hourly_count   INTEGER;
  v_one_hour_ago   TIMESTAMPTZ;
  v_new_request    requests%ROWTYPE;
  v_requester_safe TEXT;
BEGIN
  -- 1. Verificar que la sesion existe y esta activa
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND'
      USING HINT = 'La sesion no existe o no esta activa';
  END IF;

  -- 2. Validar el limite global de requests por hora
  v_one_hour_ago := NOW() - INTERVAL '1 hour';
  SELECT COUNT(*) INTO v_hourly_count
    FROM requests
   WHERE session_id = p_session_id
     AND created_at > v_one_hour_ago;

  IF v_session.requests_per_hour > 0
     AND v_hourly_count >= v_session.requests_per_hour
  THEN
    RAISE EXCEPTION 'HOURLY_LIMIT_REACHED'
      USING HINT = 'Se alcanzo el limite de peticiones por hora';
  END IF;

  -- 3. Sanitizar el nombre del solicitante (max 100 caracteres, sin espacios extremos)
  v_requester_safe := left(trim(COALESCE(p_requester, 'Anonimo')), 100);
  IF v_requester_safe = '' THEN
    v_requester_safe := 'Anonimo';
  END IF;

  -- 4. Insertar la peticion
  INSERT INTO requests (session_id, track, requester, status)
  VALUES (p_session_id, p_track, v_requester_safe, 'pending')
  RETURNING * INTO v_new_request;

  RETURN to_jsonb(v_new_request);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Revocar la policy publica de INSERT directo en requests.
--    Ahora SOLO el RPC (que corre como SECURITY DEFINER) puede insertar.
--    Esto cierra el bypass de DevTools completamente.
DROP POLICY IF EXISTS "Anyone can insert a request." ON requests;

-- Nota: Las policies de SELECT se mantienen intactas para que el host
-- pueda leer las peticiones normalmente.
