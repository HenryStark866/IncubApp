-- =============================================================================
-- IncubApp · Corrección confirmada por planta (06-10-2026)
--
-- 1. Parejas de incubadoras con los lotes cruzados (bitácora §5 punto 7 y §9 punto 1).
--    Planta confirmó que el operario tenía razón (la información real está en el grupo
--    de WhatsApp): los mapas del 15-09 quedaron con la incubadora intercambiada al
--    deducirla por el contador de la pantalla. En cada pareja se intercambia la
--    incubadora de los dos mapas de cargue y de sus cargues (setter_loads) del ciclo:
--       INC-15 ↔ INC-21 (transferidas el 27-09): lc_mtq6mgr7_k2nswl · lc_mtqa2f9s_rxt2be
--       INC-24 ↔ INC-10 (transferidas el 27-09): lc_mtrjzx8f_je4efg · lc_mtrk7flx_j40bnw
--       INC-16 ↔ INC-12 (transferidas el 30-09): lc_mtuehqjf_uy7qvi · lc_mtuev8d6_kqrkga
--    Con el cambio, los lotes de cada incubadora coinciden con lo reportado en el chat.
--    Las transferencias importadas del chat quedan con la nota de la corrección.
--
-- 2. Cargues del 14-09-2026 registrados dos veces (bitácora §12 punto 8): se deja uno
--    por incubadora y lote. Antes de borrar se copian a incubapp_ops.setter_loads_borrados.
--
-- Idempotente: los mapas corregidos llevan payload->'correccionParejas'; los cargues
-- repetidos ya borrados no vuelven a aparecer.
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS incubapp_ops;

DO $corr$
DECLARE
  p record;
  m_a record;          -- mapa A (estaba en la incubadora X)
  m_b record;          -- mapa B (estaba en la incubadora Y)
  inc_x record;
  inc_y record;
  v_desde timestamptz;
  v_hasta timestamptz;
  ids_x uuid[];
  ids_y uuid[];
  v_nota text;
  v_hay_cargues boolean := to_regclass('public.setter_loads') IS NOT NULL;
  v_hay_transfers boolean := to_regclass('public.transfers') IS NOT NULL;
  v_hay_cruce boolean := to_regclass('incubapp_ops.cruce_transferencias_whatsapp') IS NOT NULL;
  v_tiene_origen boolean;
  v_tiene_mapa boolean;
BEGIN
  IF to_regclass('public.load_maps') IS NULL OR to_regclass('public.machines') IS NULL THEN
    RAISE NOTICE 'Sin load_maps / machines: nada que corregir';
    RETURN;
  END IF;
  v_tiene_origen := v_hay_transfers AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transfers' AND column_name = 'origen');
  v_tiene_mapa := v_hay_transfers AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transfers' AND column_name = 'load_map_id');

  FOR p IN
    SELECT * FROM (VALUES
      ('lc_mtq6mgr7_k2nswl', 'lc_mtqa2f9s_rxt2be', 'INC-15', 'INC-21', timestamptz '2026-09-27 06:08-05'),
      ('lc_mtrjzx8f_je4efg', 'lc_mtrk7flx_j40bnw', 'INC-24', 'INC-10', timestamptz '2026-09-27 06:11-05'),
      ('lc_mtuehqjf_uy7qvi', 'lc_mtuev8d6_kqrkga', 'INC-16', 'INC-12', timestamptz '2026-09-30 07:05-05')
    ) AS t(mapa_a, mapa_b, cod_x, cod_y, transferida)
  LOOP
    SELECT id, machine_id, payload INTO m_a FROM public.load_maps WHERE id = p.mapa_a;
    SELECT id, machine_id, payload INTO m_b FROM public.load_maps WHERE id = p.mapa_b;
    IF m_a.id IS NULL OR m_b.id IS NULL THEN
      RAISE NOTICE 'Pareja % / %: falta algún mapa (% / %), se omite', p.cod_x, p.cod_y, p.mapa_a, p.mapa_b;
      CONTINUE;
    END IF;
    IF m_a.payload ? 'correccionParejas' OR m_b.payload ? 'correccionParejas' THEN
      RAISE NOTICE 'Pareja % / %: ya corregida', p.cod_x, p.cod_y;
      CONTINUE;
    END IF;
    SELECT id, code, name, plant_id INTO inc_x FROM public.machines WHERE id = m_a.machine_id;
    SELECT id, code, name, plant_id INTO inc_y FROM public.machines WHERE id = m_b.machine_id;
    -- Solo si siguen como quedaron el 15-09 (A en X y B en Y)
    IF inc_x.id IS NULL OR inc_y.id IS NULL
       OR inc_x.code !~* ('^INC-?0*' || regexp_replace(p.cod_x, '\D', '', 'g') || '$')
       OR inc_y.code !~* ('^INC-?0*' || regexp_replace(p.cod_y, '\D', '', 'g') || '$') THEN
      RAISE NOTICE 'Pareja % / %: los mapas ya no están en esas incubadoras (% / %), se omite',
        p.cod_x, p.cod_y, inc_x.code, inc_y.code;
      CONTINUE;
    END IF;
    v_nota := format('06-10-2026: planta confirmó que el operario tenía razón (grupo de WhatsApp). '
                     'Se intercambió la incubadora de los mapas %s (%s → %s) y %s (%s → %s) y de sus cargues.',
                     p.mapa_a, inc_x.code, inc_y.code, p.mapa_b, inc_y.code, inc_x.code);

    -- 1a. Mapas de cargue
    UPDATE public.load_maps
       SET machine_id = inc_y.id,
           machine_name = format('%s (%s)', inc_y.name, inc_y.code),
           payload = coalesce(payload, '{}'::jsonb)
             || jsonb_build_object('machineId', inc_y.id, 'machineName', format('%s (%s)', inc_y.name, inc_y.code),
                                   'correccionParejas', jsonb_build_object('de', inc_x.code, 'a', inc_y.code, 'nota', v_nota))
     WHERE id = p.mapa_a;
    UPDATE public.load_maps
       SET machine_id = inc_x.id,
           machine_name = format('%s (%s)', inc_x.name, inc_x.code),
           payload = coalesce(payload, '{}'::jsonb)
             || jsonb_build_object('machineId', inc_x.id, 'machineName', format('%s (%s)', inc_x.name, inc_x.code),
                                   'correccionParejas', jsonb_build_object('de', inc_y.code, 'a', inc_x.code, 'nota', v_nota))
     WHERE id = p.mapa_b;

    -- 1b. Cargues del ciclo transferido (14 a 25 días antes de la transferencia), como la importación
    IF v_hay_cargues THEN
      v_desde := p.transferida - interval '25 days';
      v_hasta := p.transferida - interval '14 days';
      SELECT array_agg(id) INTO ids_x FROM public.setter_loads WHERE machine_id = inc_x.id AND loaded_at BETWEEN v_desde AND v_hasta;
      SELECT array_agg(id) INTO ids_y FROM public.setter_loads WHERE machine_id = inc_y.id AND loaded_at BETWEEN v_desde AND v_hasta;
      UPDATE public.setter_loads SET machine_id = inc_y.id WHERE id = ANY (coalesce(ids_x, '{}'));
      UPDATE public.setter_loads SET machine_id = inc_x.id WHERE id = ANY (coalesce(ids_y, '{}'));
      RAISE NOTICE '% ↔ %: % y % cargues intercambiados', inc_x.code, inc_y.code,
        coalesce(cardinality(ids_x), 0), coalesce(cardinality(ids_y), 0);
    END IF;

    -- 1c. Transferencias de esas incubadoras en esa fecha
    IF v_hay_transfers THEN
      -- registradas en la app con el mapa: el mapa correcto ahora es el de la pareja
      IF v_tiene_mapa THEN
        UPDATE public.transfers SET load_map_id = p.mapa_b
         WHERE load_map_id = p.mapa_a AND source_machine_id = inc_x.id;
        UPDATE public.transfers SET load_map_id = p.mapa_a
         WHERE load_map_id = p.mapa_b AND source_machine_id = inc_y.id;
      END IF;
      -- importadas del chat: queda la nota de la corrección
      IF v_tiene_origen THEN
        UPDATE public.transfers t
           SET origen = jsonb_set(t.origen, '{observaciones}',
                 coalesce(t.origen->'observaciones', '[]'::jsonb) || to_jsonb(v_nota))
         WHERE t.origen IS NOT NULL
           AND t.source_machine_id IN (inc_x.id, inc_y.id)
           AND abs(extract(epoch FROM t.transferred_at - p.transferida)) < 2 * 86400
           AND NOT (coalesce(t.origen->'observaciones', '[]'::jsonb) @> to_jsonb(v_nota));
      END IF;
    END IF;
    IF v_hay_cruce THEN
      UPDATE incubapp_ops.cruce_transferencias_whatsapp
         SET observaciones = array_append(observaciones, v_nota),
             estado = 'corregida_por_planta'
       WHERE incubadora IN (inc_x.code, inc_y.code, p.cod_x, p.cod_y)
         AND abs(extract(epoch FROM transferido_en - p.transferida)) < 2 * 86400
         AND NOT (v_nota = ANY (observaciones));
    END IF;
  END LOOP;
END $corr$;

-- 2. Cargues del 14-09-2026 repetidos: uno por incubadora y lote
DO $dup$
DECLARE
  n int;
BEGIN
  IF to_regclass('public.setter_loads') IS NULL THEN
    RETURN;
  END IF;
  CREATE TABLE IF NOT EXISTS incubapp_ops.setter_loads_borrados (LIKE public.setter_loads);
  ALTER TABLE incubapp_ops.setter_loads_borrados ADD COLUMN IF NOT EXISTS borrado_en timestamptz DEFAULT now();
  ALTER TABLE incubapp_ops.setter_loads_borrados ADD COLUMN IF NOT EXISTS motivo text;

  CREATE TEMP TABLE _repetidos ON COMMIT DROP AS
  SELECT id FROM (
    SELECT s.id,
           row_number() OVER (
             PARTITION BY s.machine_id, lower(btrim(coalesce(s.lote, '')))
             -- Queda el de inicio de ciclo coherente (no antes de 2 días del cargue ni después
             -- de 1 día), luego el registrado primero.
             ORDER BY (s.cycle_start_at IS NOT NULL
                       AND s.cycle_start_at BETWEEN s.loaded_at - interval '2 days' AND s.loaded_at + interval '1 day') DESC,
                      s.created_at ASC NULLS LAST, s.id
           ) AS orden
      FROM public.setter_loads s
     WHERE (s.loaded_at AT TIME ZONE 'America/Bogota')::date = date '2026-09-14'
  ) x
  WHERE orden > 1;

  INSERT INTO incubapp_ops.setter_loads_borrados
  SELECT s.*, now(), 'Cargue del 14-09-2026 registrado dos veces (corrección 06-10-2026)'
    FROM public.setter_loads s
   WHERE s.id IN (SELECT id FROM _repetidos);
  DELETE FROM public.setter_loads WHERE id IN (SELECT id FROM _repetidos);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Cargues repetidos del 14-09 borrados: % (copia en incubapp_ops.setter_loads_borrados)', n;
END $dup$;
