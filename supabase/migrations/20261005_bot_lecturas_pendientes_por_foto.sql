-- IncubApp: corrige las lecturas que quedaron en «revisar» ANTES del cambio «la foto
-- manda» (20261005_bot_lecturas_foto_manda.sql). Autorizado por el usuario el 05-10-2026:
-- revisó las lecturas de las fotos y estaban bien.
--
-- Para cada lectura en «revisar» vuelve a pasar lo que el lector leyó (valores = lo leído
-- con certeza) por incubapp_bot.guardar_lectura: el valor de la foto queda en la ronda y el
-- anterior se anota como 'corregido_por_foto'. Las dudas de lectura (lectura_dudosa) se
-- conservan: esas lecturas siguen en «revisar» solo por sus campos dudosos.
-- Se conservan la fecha original de proceso (procesada_at) y los campos que ya se habían
-- aplicado antes. Solo toca las que están en «revisar»: correrla otra vez no cambia nada más.

DO $$
DECLARE
  l record;
  previos text[];
  dudas jsonb;
BEGIN
  FOR l IN SELECT * FROM public.machine_check_ai_readings WHERE status = 'revisar' ORDER BY procesada_at LOOP
    previos := coalesce(l.campos_aplicados, '{}');
    SELECT coalesce(jsonb_agg(d), '[]'::jsonb) INTO dudas
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.discrepancias) = 'array' THEN l.discrepancias ELSE '[]'::jsonb END) d
     WHERE d->>'tipo' = 'lectura_dudosa';
    PERFORM incubapp_bot.guardar_lectura(jsonb_build_object(
      'check_id', l.check_id,
      'status', 'aplicada',
      'valores', CASE WHEN jsonb_typeof(l.valores) = 'object' THEN l.valores ELSE '{}'::jsonb END,
      'discrepancias', dudas,
      'motivo', l.motivo,
      'modelo', l.modelo,
      'lecturas', l.lecturas,
      'etiqueta_pantalla', l.etiqueta_pantalla));
    UPDATE public.machine_check_ai_readings
       SET procesada_at = l.procesada_at,
           campos_aplicados = ARRAY(SELECT DISTINCT unnest(previos || coalesce(campos_aplicados, '{}')))
     WHERE check_id = l.check_id;
  END LOOP;
END $$;
