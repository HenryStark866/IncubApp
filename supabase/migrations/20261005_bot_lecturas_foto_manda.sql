-- IncubApp: en las rondas, la FOTO manda (05-10-2026).
--
-- Antes: el formulario de la ronda llenaba las lecturas con las de la ronda anterior y
-- esos valores viejos contaban como «digitados por el turnero». El lector de fotos nunca
-- los reemplazaba y, como no coincidían con la foto, la lectura quedaba en «revisar»
-- (509 de 529 en la semana del 28-09 al 05-10). El usuario revisó y las lecturas de las
-- fotos estaban bien.
--
-- Ahora: si el lector leyó un campo CON CERTEZA, ese valor queda en la ronda aunque ya
-- hubiera otro; el valor anterior se anota en discrepancias como 'corregido_por_foto'
-- (auditoría). Lo que el lector leyó con duda NO se toca y la lectura sigue quedando en
-- «revisar» para el líder. El formulario ya no rellena valores viejos (SupervisionPanel).
-- Idempotente (CREATE OR REPLACE). Misma firma y permisos que 20260930_bot_lecturas_fotos.

CREATE OR REPLACE FUNCTION incubapp_bot.guardar_lectura(r jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  fila public.machine_checks%ROWTYPE;
  campo text;
  bot numeric;
  anterior numeric;
  estado text := coalesce(r->>'status', 'error');
  v_valores jsonb := CASE WHEN jsonb_typeof(r->'valores') = 'object' THEN r->'valores' ELSE '{}'::jsonb END;
  -- Lo que llega del lector son solo las dudas de lectura (lectura_dudosa).
  v_dudas jsonb := CASE WHEN jsonb_typeof(r->'discrepancias') = 'array' THEN r->'discrepancias' ELSE '[]'::jsonb END;
  v_cambios jsonb := '[]'::jsonb;
  aplicados text[] := '{}';
  nuevos jsonb := '{}'::jsonb;
BEGIN
  IF estado NOT IN ('aplicada', 'revisar', 'sin_lecturas', 'error') THEN estado := 'error'; END IF;
  SELECT * INTO fila FROM public.machine_checks WHERE id = (r->>'check_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no-existe'; END IF;

  IF estado IN ('aplicada', 'revisar') THEN
    FOR campo IN SELECT unnest(ARRAY['temp_ovoscan', 'temp_air', 'humidity', 'co2', 'turn_count']) LOOP
      -- Solo los campos leídos con certeza traen número en «valores».
      CONTINUE WHEN NOT v_valores ? campo OR jsonb_typeof(v_valores->campo) <> 'number';
      bot := (v_valores->>campo)::numeric;
      anterior := (to_jsonb(fila)->>campo)::numeric;
      IF anterior IS NULL OR anterior <> bot THEN
        nuevos := nuevos || jsonb_build_object(campo, bot);
        aplicados := aplicados || campo;
        IF anterior IS NOT NULL THEN
          v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
            'campo', campo, 'tipo', 'corregido_por_foto', 'antes', anterior, 'foto', bot));
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF cardinality(aplicados) > 0 THEN
    UPDATE public.machine_checks SET
      temp_ovoscan = CASE WHEN nuevos ? 'temp_ovoscan' THEN (nuevos->>'temp_ovoscan')::numeric ELSE temp_ovoscan END,
      temp_air     = CASE WHEN nuevos ? 'temp_air'     THEN (nuevos->>'temp_air')::numeric     ELSE temp_air END,
      humidity     = CASE WHEN nuevos ? 'humidity'     THEN (nuevos->>'humidity')::numeric     ELSE humidity END,
      co2          = CASE WHEN nuevos ? 'co2'          THEN (nuevos->>'co2')::numeric          ELSE co2 END,
      turn_count   = CASE WHEN nuevos ? 'turn_count'   THEN (nuevos->>'turn_count')::smallint  ELSE turn_count END
    WHERE id = fila.id;
  END IF;

  -- «revisar» solo si quedó alguna lectura dudosa; una corrección por foto no es una duda.
  IF estado = 'aplicada' AND jsonb_array_length(v_dudas) > 0 THEN estado := 'revisar'; END IF;
  IF estado = 'revisar' AND jsonb_array_length(v_dudas) = 0 THEN estado := 'aplicada'; END IF;

  UPDATE public.machine_check_ai_readings SET
    status = estado,
    valores = v_valores,
    campos_aplicados = aplicados,
    discrepancias = v_dudas || v_cambios,
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

REVOKE ALL ON FUNCTION incubapp_bot.guardar_lectura(jsonb) FROM public;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_lecturas') THEN
    GRANT EXECUTE ON FUNCTION incubapp_bot.guardar_lectura(jsonb) TO bot_lecturas;
  END IF;
END $$;
