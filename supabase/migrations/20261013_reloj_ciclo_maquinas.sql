-- =============================================================================
-- IncubApp · Reloj del ciclo de cada máquina, leído de la pantalla · 13-10-2026
-- Cada pantallazo del bot de EagleTrax (y cada foto de ronda) muestra cuánto lleva el ciclo de
-- la incubadora («18d 20h 49'»). El lector lo guarda en machine_checks.cycle_age_minutes; con
-- eso la app sabe cuándo empezó de verdad cada ciclo (hora de la foto − reloj) y avisa los
-- cargues sin registrar y los días que no cuadran con lo registrado.
-- Idempotente.
-- =============================================================================
ALTER TABLE public.machine_checks ADD COLUMN IF NOT EXISTS cycle_age_minutes integer
  CHECK (cycle_age_minutes IS NULL OR cycle_age_minutes BETWEEN 0 AND 40000);
COMMENT ON COLUMN public.machine_checks.cycle_age_minutes IS
  'Tiempo de ciclo que mostraba la pantalla de la máquina en la foto (minutos). Lo llena el lector.';

CREATE OR REPLACE FUNCTION incubapp_bot.guardar_lectura(r jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  fila public.machine_checks%ROWTYPE;
  campo text;
  bot numeric;
  anterior numeric;
  estado text := coalesce(r->>'status', 'error');
  v_valores jsonb := CASE WHEN jsonb_typeof(r->'valores') = 'object' THEN r->'valores' ELSE '{}'::jsonb END;
  v_dudas jsonb := CASE WHEN jsonb_typeof(r->'discrepancias') = 'array' THEN r->'discrepancias' ELSE '[]'::jsonb END;
  v_cambios jsonb := '[]'::jsonb;
  previos text[];
  aplicados text[] := '{}';
  quitar text[] := '{}';
  nuevos jsonb := '{}'::jsonb;
BEGIN
  IF estado NOT IN ('aplicada', 'revisar', 'sin_lecturas', 'error') THEN estado := 'error'; END IF;
  IF estado = 'revisar' THEN estado := 'aplicada'; END IF;   -- ya no existe «revisar»
  SELECT * INTO fila FROM public.machine_checks WHERE id = (r->>'check_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no-existe'; END IF;
  SELECT coalesce(a.campos_aplicados, '{}') INTO previos FROM public.machine_check_ai_readings a WHERE a.check_id = fila.id;
  previos := coalesce(previos, '{}');

  IF estado = 'aplicada' THEN
    FOR campo IN SELECT unnest(ARRAY['temp_ovoscan', 'temp_air', 'humidity', 'co2', 'turn_count']) LOOP
      anterior := (to_jsonb(fila)->>campo)::numeric;
      IF v_valores ? campo AND jsonb_typeof(v_valores->campo) = 'number' THEN
        bot := (v_valores->>campo)::numeric;
        IF anterior IS NULL OR anterior <> bot THEN
          nuevos := nuevos || jsonb_build_object(campo, bot);
          aplicados := aplicados || campo;
          IF anterior IS NOT NULL THEN
            v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
              'campo', campo, 'tipo', 'corregido_por_foto', 'antes', anterior, 'foto', bot));
          END IF;
        ELSE
          aplicados := aplicados || campo;     -- ya estaba bien: sigue siendo del lector
        END IF;
      ELSIF anterior IS NOT NULL AND v_valores <> '{}'::jsonb AND (
              campo = ANY (previos)
              -- Número corrido de campo: lo guardado aquí es lo que la foto muestra en OTRO campo.
              OR anterior IN (SELECT (e.value)::numeric FROM jsonb_each_text(v_valores) e
                              WHERE e.key <> campo AND e.value ~ '^-?[0-9.]+$')) THEN
        quitar := quitar || campo;
        v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
          'campo', campo, 'tipo', 'quitado_por_relectura', 'antes', anterior));
      END IF;
    END LOOP;
  END IF;

  IF cardinality(aplicados) > 0 OR cardinality(quitar) > 0 THEN
    UPDATE public.machine_checks SET
      temp_ovoscan = CASE WHEN nuevos ? 'temp_ovoscan' THEN (nuevos->>'temp_ovoscan')::numeric
                          WHEN 'temp_ovoscan' = ANY (quitar) THEN NULL ELSE temp_ovoscan END,
      temp_air     = CASE WHEN nuevos ? 'temp_air' THEN (nuevos->>'temp_air')::numeric
                          WHEN 'temp_air' = ANY (quitar) THEN NULL ELSE temp_air END,
      humidity     = CASE WHEN nuevos ? 'humidity' THEN (nuevos->>'humidity')::numeric
                          WHEN 'humidity' = ANY (quitar) THEN NULL ELSE humidity END,
      co2          = CASE WHEN nuevos ? 'co2' THEN (nuevos->>'co2')::numeric
                          WHEN 'co2' = ANY (quitar) THEN NULL ELSE co2 END,
      turn_count   = CASE WHEN nuevos ? 'turn_count' THEN (nuevos->>'turn_count')::smallint
                          WHEN 'turn_count' = ANY (quitar) THEN NULL ELSE turn_count END
    WHERE id = fila.id;
  END IF;

  -- 13-10-2026: reloj del ciclo que muestra la pantalla («18d 20h 49'»), en minutos
  IF estado = 'aplicada' AND v_valores ? 'cycle_age_minutes' AND jsonb_typeof(v_valores->'cycle_age_minutes') = 'number' THEN
    UPDATE public.machine_checks SET cycle_age_minutes = (v_valores->>'cycle_age_minutes')::integer WHERE id = fila.id;
    aplicados := aplicados || 'cycle_age_minutes'::text;
  END IF;

  UPDATE public.machine_check_ai_readings SET
    status = estado,
    valores = v_valores,
    campos_aplicados = aplicados,
    discrepancias = v_dudas || v_cambios,
    motivo = left(r->>'motivo', 2000),
    etiqueta_pantalla = left(r->>'etiqueta_pantalla', 120),
    lecturas = r->'lecturas',
    modelo = left(r->>'modelo', 80),
    intentos = CASE WHEN estado = 'error' AND r->>'reintentar' = 'true' THEN greatest(intentos - 1, 0) ELSE intentos END,
    procesada_at = now()
  WHERE check_id = fila.id;
  RETURN estado;
END $function$;

NOTIFY pgrst, 'reload schema';
