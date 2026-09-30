-- IncubApp: bot de lecturas (n8n). Lee la pantalla de cada foto de ronda de
-- incubadoras y nacedoras y llena las lecturas del FOMAT04 / control diario en
-- machine_checks. Reglas que no se negocian:
--   · solo llena columnas VACÍAS: nunca pisa lo que digitó el turnero;
--   · solo llena un campo si dos lecturas independientes de la foto coinciden
--     y el valor es físicamente posible (eso lo decide n8n antes de llamar aquí);
--   · si el turnero digitó otra cosa, o la foto parece de otra máquina, la
--     ronda queda «revisar» para el líder, sin tocar nada.
-- Todo lo que hizo el bot queda en machine_check_ai_readings (qué leyó, qué
-- aplicó y por qué). n8n entra con el rol bot_lecturas, que solo puede
-- ejecutar las dos funciones de incubapp_bot (el instalador le pone clave).
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.machine_check_ai_readings (
  check_id uuid PRIMARY KEY REFERENCES public.machine_checks (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  machine_id uuid NOT NULL REFERENCES public.machines (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'procesando'
    CHECK (status IN ('procesando', 'aplicada', 'revisar', 'sin_lecturas', 'error')),
  valores jsonb NOT NULL DEFAULT '{}'::jsonb,        -- lo que ambas lecturas confirmaron
  campos_aplicados text[] NOT NULL DEFAULT '{}'::text[],
  discrepancias jsonb NOT NULL DEFAULT '[]'::jsonb,   -- turnero vs foto, lecturas que no coinciden
  motivo text,
  etiqueta_pantalla text,
  lecturas jsonb,                                     -- respuesta completa de cada lectura
  modelo text,
  intentos smallint NOT NULL DEFAULT 0,
  reclamada_at timestamptz,
  procesada_at timestamptz
);
CREATE INDEX IF NOT EXISTS machine_check_ai_readings_org_idx
  ON public.machine_check_ai_readings (org_id, status);

ALTER TABLE public.machine_check_ai_readings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS machine_check_ai_readings_select ON public.machine_check_ai_readings;
CREATE POLICY machine_check_ai_readings_select ON public.machine_check_ai_readings
  FOR SELECT TO authenticated
  USING (private.is_platform_admin() OR private.is_org_member(org_id));
REVOKE INSERT, UPDATE, DELETE ON public.machine_check_ai_readings FROM anon, authenticated;
GRANT SELECT ON public.machine_check_ai_readings TO authenticated;

CREATE SCHEMA IF NOT EXISTS incubapp_bot;
REVOKE ALL ON SCHEMA incubapp_bot FROM public;

-- Desde cuándo procesa fotos. El instalador lo deja en «ahora»: las fotos
-- viejas solo se procesan si alguien corre el llenado histórico a propósito.
CREATE TABLE IF NOT EXISTS incubapp_bot.config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  desde timestamptz NOT NULL DEFAULT now()
);
INSERT INTO incubapp_bot.config (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Reclama hasta `limite` fotos pendientes y devuelve lo que n8n necesita.
-- Reclamar evita que dos corridas seguidas lean la misma foto; si una corrida
-- se cae, la foto se vuelve a ofrecer a los 20 minutos (máximo 3 intentos).
CREATE OR REPLACE FUNCTION incubapp_bot.lecturas_pendientes(limite integer DEFAULT 10)
RETURNS TABLE (
  check_id uuid, photo_path text, machine_code text, machine_name text, machine_type text,
  temp_ovoscan numeric, temp_air numeric, humidity numeric, co2 numeric, turn_count smallint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE desde_cfg timestamptz;
BEGIN
  SELECT c.desde INTO desde_cfg FROM incubapp_bot.config c;
  RETURN QUERY
  WITH elegidas AS (
    SELECT k.id, k.org_id, k.machine_id
    FROM public.machine_checks k
    JOIN public.machines m ON m.id = k.machine_id
    LEFT JOIN public.machine_check_ai_readings a ON a.check_id = k.id
    WHERE k.photo_path IS NOT NULL
      AND k.condition <> 'off'
      AND m.type IN ('setter', 'hatcher')
      AND k.taken_at >= desde_cfg
      AND (a.check_id IS NULL
           OR (a.status IN ('procesando', 'error') AND a.intentos < 3
               AND a.reclamada_at < now() - interval '20 minutes'))
    ORDER BY k.taken_at DESC
    LIMIT greatest(1, least(coalesce(limite, 10), 50))
    FOR UPDATE OF k SKIP LOCKED
  ), reclamadas AS (
    INSERT INTO public.machine_check_ai_readings AS r (check_id, org_id, machine_id, status, intentos, reclamada_at)
    SELECT e.id, e.org_id, e.machine_id, 'procesando', 1, now() FROM elegidas e
    ON CONFLICT ON CONSTRAINT machine_check_ai_readings_pkey DO UPDATE
      SET status = 'procesando', intentos = r.intentos + 1, reclamada_at = now()
    RETURNING r.check_id
  )
  SELECT k.id, k.photo_path, m.code, m.name, m.type::text,
         k.temp_ovoscan, k.temp_air, k.humidity, k.co2, k.turn_count
  FROM reclamadas r
  JOIN public.machine_checks k ON k.id = r.check_id
  JOIN public.machines m ON m.id = k.machine_id;
END $$;

-- Guarda el resultado de n8n y llena el formato. `r` trae:
--   check_id, status ('aplicada' | 'revisar' | 'sin_lecturas' | 'error'),
--   valores {campo: número} ya confirmados por las dos lecturas,
--   discrepancias [...], motivo, etiqueta_pantalla, lecturas, modelo.
-- Aquí se compara contra lo que hay en la fila EN ESTE MOMENTO: lo que el
-- turnero ya digitó no se toca, y si no coincide con la foto se anota.
CREATE OR REPLACE FUNCTION incubapp_bot.guardar_lectura(r jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  fila public.machine_checks%ROWTYPE;
  campo text;
  bot numeric;
  turnero numeric;
  estado text := coalesce(r->>'status', 'error');
  v_valores jsonb := CASE WHEN jsonb_typeof(r->'valores') = 'object' THEN r->'valores' ELSE '{}'::jsonb END;
  v_discrep jsonb := CASE WHEN jsonb_typeof(r->'discrepancias') = 'array' THEN r->'discrepancias' ELSE '[]'::jsonb END;
  aplicados text[] := '{}';
  nuevos jsonb := '{}'::jsonb;
BEGIN
  IF estado NOT IN ('aplicada', 'revisar', 'sin_lecturas', 'error') THEN estado := 'error'; END IF;
  SELECT * INTO fila FROM public.machine_checks WHERE id = (r->>'check_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no-existe'; END IF;

  FOR campo IN SELECT unnest(ARRAY['temp_ovoscan', 'temp_air', 'humidity', 'co2', 'turn_count']) LOOP
    CONTINUE WHEN NOT v_valores ? campo OR jsonb_typeof(v_valores->campo) <> 'number';
    bot := (v_valores->>campo)::numeric;
    turnero := (to_jsonb(fila)->>campo)::numeric;
    IF turnero IS NULL THEN
      IF estado IN ('aplicada', 'revisar') THEN
        nuevos := nuevos || jsonb_build_object(campo, bot);
        aplicados := aplicados || campo;
      END IF;
    ELSIF turnero <> bot THEN
      v_discrep := v_discrep || jsonb_build_array(jsonb_build_object(
        'campo', campo, 'tipo', 'turnero_vs_foto', 'turnero', turnero, 'foto', bot));
    END IF;
  END LOOP;

  IF cardinality(aplicados) > 0 THEN
    -- coalesce: si el turnero guardó algo entre la lectura y este momento, gana lo suyo.
    UPDATE public.machine_checks SET
      temp_ovoscan = coalesce(temp_ovoscan, (nuevos->>'temp_ovoscan')::numeric),
      temp_air     = coalesce(temp_air,     (nuevos->>'temp_air')::numeric),
      humidity     = coalesce(humidity,     (nuevos->>'humidity')::numeric),
      co2          = coalesce(co2,          (nuevos->>'co2')::numeric),
      turn_count   = coalesce(turn_count,   (nuevos->>'turn_count')::smallint)
    WHERE id = fila.id;
  END IF;

  IF estado = 'aplicada' AND jsonb_array_length(v_discrep) > 0 THEN estado := 'revisar'; END IF;

  UPDATE public.machine_check_ai_readings SET
    status = estado,
    valores = v_valores,
    campos_aplicados = aplicados,
    discrepancias = v_discrep,
    motivo = left(r->>'motivo', 2000),
    etiqueta_pantalla = left(r->>'etiqueta_pantalla', 120),
    lecturas = r->'lecturas',
    modelo = left(r->>'modelo', 80),
    -- Falla de conexión o de cuenta: no cuenta como intento de esa foto.
    intentos = CASE WHEN estado = 'error' AND r->>'reintentar' = 'true' THEN greatest(intentos - 1, 0) ELSE intentos END,
    procesada_at = now()
  WHERE check_id = fila.id;
  RETURN estado;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA incubapp_bot FROM public;
REVOKE ALL ON ALL TABLES IN SCHEMA incubapp_bot FROM public;

-- Rol de n8n: sin tablas, solo las dos funciones. La clave la pone el instalador.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_lecturas') THEN
    CREATE ROLE bot_lecturas LOGIN NOINHERIT;
  END IF;
END $$;
GRANT USAGE ON SCHEMA incubapp_bot TO bot_lecturas;
GRANT EXECUTE ON FUNCTION incubapp_bot.lecturas_pendientes(integer) TO bot_lecturas;
GRANT EXECUTE ON FUNCTION incubapp_bot.guardar_lectura(jsonb) TO bot_lecturas;
