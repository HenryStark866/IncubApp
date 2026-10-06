/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/generarMigracionSql.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Genera la migración SQL que el servidor aplica al actualizar la app
 *     (servidor-local/7-ACTUALIZAR-APP.bat → aplicar-migraciones.sh). La migración:
 *       1. Busca la planta de Incubant, las incubadoras (INC-xx) y nacedoras (NAC-xx).
 *       2. Cruza cada transferencia con los cargues reales de la base (setter_loads):
 *          lotes, lote de aves (batch), inicio de ciclo y recargues posteriores.
 *       3. Inserta en public.transfers solo las que no existan (idempotente).
 *       4. Deja el resultado del cruce en incubapp_ops.cruce_transferencias_whatsapp.
 * EN: Builds the SQL migration the server applies when updating the app
 *     (servidor-local/7-ACTUALIZAR-APP.bat → aplicar-migraciones.sh). The migration:
 *       1. Finds the Incubant plant, its setters (INC-xx) and hatchers (NAC-xx).
 *       2. Cross-checks every transfer against the real loads in the database
 *          (setter_loads): lots, flock batch, cycle start and later reloads.
 *       3. Inserts into public.transfers only the ones not already there (idempotent).
 *       4. Stores the cross-check result in incubapp_ops.cruce_transferencias_whatsapp.
 */
import { escaparSql } from './escaparSql.mjs'

// ES: Planta de Incubant (id real tomado de los mapas de cargue exportados).
// EN: Incubant plant (real id taken from the exported load maps).
export const PLANTA_INCUBANT = 'ea0d6e60-928a-4e47-84f9-504bf217136b'

/**
 * @param {object[]} filas ES: transferencias listas para la base. EN: transfers ready for the DB.
 * @param {string} fecha ES: fecha de generación (AAAA-MM-DD). EN: generation date (YYYY-MM-DD).
 * @returns {string} ES: contenido del archivo .sql. EN: .sql file content.
 */
export function generarMigracionSql(filas, fecha) {
  // ES: JSON de datos, una transferencia por línea. EN: Data JSON, one transfer per line.
  const datos = escaparSql(filas)
  return `-- =============================================================================
-- IncubApp · Transferencias reportadas por WhatsApp (13-07-2026 a 05-10-2026)
-- IncubApp · Transfers reported over WhatsApp (2026-07-13 to 2026-10-05)
-- Autor / Author: Henry Taborda — Ing. en desarrollo de software
-- Generado / Generated: ${fecha} por scripts/transferencias_whatsapp/principal.mjs
--   (no editar a mano: corregir los datos y volver a generar)
--   (do not edit by hand: fix the data and regenerate)
--
-- ES: Registra en public.transfers las ${filas.length} transferencias de incubadora a
--     nacedoras que planta reportó por el grupo de WhatsApp «Transferencias», ya
--     cruzadas con los mapas de cargue reales (ver docs/Cruce_Transferencias_WhatsApp.md).
--     Al aplicarse vuelve a cruzar cada una con los cargues de la base (setter_loads).
-- EN: Records in public.transfers the ${filas.length} setter-to-hatcher transfers that
--     the plant reported in the «Transferencias» WhatsApp group, already cross-checked
--     against the real load maps (see docs/Cruce_Transferencias_WhatsApp.md). When
--     applied it cross-checks each one again against the loads in the DB (setter_loads).
--
-- Idempotente / Idempotent: cada transferencia lleva origen->>'clave'; si ya existe
--   (importada o registrada en la app ±3 días por la misma incubadora) no se repite.
-- Reporte / Report:
--   SELECT * FROM incubapp_ops.cruce_transferencias_whatsapp ORDER BY transferido_en;
-- =============================================================================

-- ES: Esquema interno de operación (lo crea aplicar-migraciones.sh; se asegura aquí).
-- EN: Internal ops schema (created by aplicar-migraciones.sh; ensured here).
CREATE SCHEMA IF NOT EXISTS incubapp_ops;

-- ES: Tabla con el resultado del cruce, una fila por transferencia del chat.
-- EN: Table with the cross-check result, one row per chat transfer.
CREATE TABLE IF NOT EXISTS incubapp_ops.cruce_transferencias_whatsapp (
  clave          text PRIMARY KEY,           -- ES: clave estable / EN: stable key
  incubadora     text NOT NULL,              -- ES: INC-xx de origen / EN: source INC-xx
  salon          int,                        -- ES: salón de nacedoras / EN: hatcher room
  reportado_en   timestamptz,                -- ES: hora del mensaje / EN: message time
  transferido_en timestamptz,                -- ES: hora registrada / EN: recorded time
  reportado_por  text,                       -- ES: quién lo reportó / EN: reporter
  lotes_chat     text[],                     -- ES: lotes del mensaje / EN: message lots
  lotes_bd       text[],                     -- ES: lotes cargados según la base / EN: loaded lots per DB
  estado         text NOT NULL,              -- ES: resultado / EN: outcome
  observaciones  text[] NOT NULL DEFAULT '{}',
  transfer_id    uuid,                       -- ES: fila creada o existente / EN: created or existing row
  aplicado_en    timestamptz NOT NULL DEFAULT now()
);

DO $migracion$
DECLARE
  -- ES: Transferencias del chat ya normalizadas y cruzadas con los mapas.
  -- EN: Chat transfers already normalized and cross-checked with the maps.
  v_datos jsonb := $datos$${datos}$datos$::jsonb;
  r              jsonb;        -- ES: transferencia en curso / EN: current transfer
  v_plant        uuid;         -- ES: planta / EN: plant
  v_org          uuid;         -- ES: organización / EN: organization
  v_autor        uuid;         -- ES: usuario que firma la importación / EN: user signing the import
  v_foto         text;         -- ES: valor de photo_path / EN: photo_path value
  v_hay_cargues  boolean := to_regclass('public.setter_loads') IS NOT NULL;
  v_inc          uuid;         -- ES: incubadora de origen / EN: source setter
  v_t            timestamptz;  -- ES: hora de la transferencia / EN: transfer time
  v_recargue     timestamptz;  -- ES: recargue posterior / EN: later reload
  v_lotes        text[];       -- ES: lotes del chat / EN: chat lots
  v_lotes_bd     text[];       -- ES: lotes de la base / EN: DB lots
  v_batch        uuid;         -- ES: lote de aves único / EN: single flock batch
  v_ciclo        timestamptz;  -- ES: inicio de ciclo / EN: cycle start
  v_nacs         uuid[];       -- ES: nacedoras en orden / EN: ordered hatchers
  v_salas        uuid[];       -- ES: salas de esas nacedoras / EN: rooms of those hatchers
  v_alloc        jsonb;        -- ES: reparto por nacedora / EN: per-hatcher allocation
  v_etiqueta     text;         -- ES: «41 + 43» / EN: "41 + 43"
  v_existente    uuid;         -- ES: transferencia ya registrada / EN: already recorded transfer
  v_id           uuid;         -- ES: transferencia creada / EN: created transfer
  v_estado       text;
  v_obs          text[];
  v_candidatas   text;
  n_nuevas int := 0; n_existian int := 0; n_ajustadas int := 0; n_distintas int := 0; n_error int := 0;
  v_primer_error text;
BEGIN
  -- ES: Sin tabla de transferencias no hay nada que hacer. EN: No transfers table, nothing to do.
  IF to_regclass('public.transfers') IS NULL OR to_regclass('public.machines') IS NULL THEN
    RAISE NOTICE 'Sin public.transfers / public.machines: nada que importar';
    RETURN;
  END IF;

  -- ES: Columnas de la transferencia por incubadora (20260930) y del origen de la importación.
  -- EN: Per-setter transfer columns (20260930) and the import origin column.
  ALTER TABLE public.transfers
    ADD COLUMN IF NOT EXISTS source_machine_id uuid,
    ADD COLUMN IF NOT EXISTS hatcher_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    ADD COLUMN IF NOT EXISTS allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS load_map_id text,
    ADD COLUMN IF NOT EXISTS origen jsonb;
  COMMENT ON COLUMN public.transfers.origen IS
    'Origen de una transferencia importada (p. ej. reporte de WhatsApp): clave, quien reporto, texto original y cruce. NULL si se registro en la app.';
  CREATE INDEX IF NOT EXISTS transfers_origen_clave_idx ON public.transfers ((origen->>'clave')) WHERE origen IS NOT NULL;

  -- ES: Planta de Incubant; si cambió el id, la que más incubadoras INC-xx tenga.
  -- EN: Incubant plant; if its id changed, the one with the most INC-xx setters.
  SELECT p.id, p.org_id INTO v_plant, v_org FROM public.plants p WHERE p.id = '${PLANTA_INCUBANT}';
  IF v_plant IS NULL THEN
    SELECT m.plant_id, p.org_id INTO v_plant, v_org
      FROM public.machines m JOIN public.plants p ON p.id = m.plant_id
     WHERE m.code ~* '^INC-?[0-9]+$'
     GROUP BY m.plant_id, p.org_id ORDER BY count(*) DESC LIMIT 1;
  END IF;
  IF v_plant IS NULL THEN
    RAISE NOTICE 'No se encontró la planta con incubadoras INC-xx: nada que importar';
    RETURN;
  END IF;

  -- ES: Autor: Henry Taborda (quien transcribió el chat); si no, quien más cargues registró.
  -- EN: Author: Henry Taborda (who transcribed the chat); otherwise the top load recorder.
  BEGIN
    EXECUTE $q$SELECT id FROM public.profiles WHERE full_name ILIKE '%Henry%Taborda%' LIMIT 1$q$ INTO v_autor;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_autor := NULL;
  END;
  IF v_autor IS NULL AND v_hay_cargues THEN
    SELECT created_by INTO v_autor FROM public.setter_loads
     WHERE org_id = v_org AND created_by IS NOT NULL GROUP BY created_by ORDER BY count(*) DESC LIMIT 1;
  END IF;

  -- ES: photo_path: NULL si la columna lo permite; si no, una marca de importación.
  -- EN: photo_path: NULL if the column allows it; otherwise an import marker.
  SELECT CASE WHEN is_nullable = 'NO' THEN 'importado/whatsapp' END INTO v_foto
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'transfers' AND column_name = 'photo_path';

  FOR r IN SELECT * FROM jsonb_array_elements(v_datos) LOOP
    v_obs := '{}'; v_estado := NULL; v_id := NULL; v_existente := NULL;
    v_lotes := ARRAY(SELECT jsonb_array_elements_text(r->'lotes'));
    v_lotes_bd := NULL; v_batch := NULL; v_ciclo := NULL; v_recargue := NULL;
    v_t := (r->>'transferidoEn')::timestamptz;

    -- ES: ¿Ya se importó en una corrida anterior? EN: Already imported in a previous run?
    SELECT id INTO v_existente FROM public.transfers WHERE origen->>'clave' = r->>'clave' LIMIT 1;
    IF v_existente IS NOT NULL THEN
      v_estado := 'ya_importada';
    END IF;

    -- ES: Incubadora de origen por código (INC-08, INC-8 o INC08). EN: Source setter by code.
    SELECT id INTO v_inc FROM public.machines
     WHERE plant_id = v_plant AND code ~* ('^INC-?0*' || (r->>'numeroIncubadora') || '$')
     ORDER BY (status = 'decommissioned') NULLS FIRST LIMIT 1;
    IF v_estado IS NULL AND v_inc IS NULL THEN
      v_estado := 'sin_incubadora';
      v_obs := array_append(v_obs, format('No existe %s en la planta', r->>'incubadora'));
    END IF;

    IF v_estado IS NULL AND v_hay_cargues THEN
      -- ES: Recargue de la misma incubadora entre el ciclo y la hora reportada: la
      --     transferencia tuvo que ser antes (si no, el huevo nuevo quedaría «transferido»).
      -- EN: Same-setter reload between the cycle and the reported time: the transfer
      --     must have been earlier (otherwise the new eggs would look "transferred").
      SELECT min(loaded_at) INTO v_recargue FROM public.setter_loads
       WHERE machine_id = v_inc AND loaded_at > v_t - interval '14 days' AND loaded_at <= v_t;
      IF v_recargue IS NOT NULL THEN
        v_obs := array_append(v_obs, format('Hora ajustada: la base tiene un cargue de %s el %s, antes de la hora reportada %s',
                                 r->>'incubadora', to_char(v_recargue AT TIME ZONE 'America/Bogota', 'DD-MM-YYYY HH24:MI'),
                                 to_char(v_t AT TIME ZONE 'America/Bogota', 'DD-MM-YYYY HH24:MI')));
        v_t := v_recargue - interval '1 hour';
        n_ajustadas := n_ajustadas + 1;
      END IF;

      -- ES: Cargues del ciclo transferido (14 a 25 días antes): lotes, batch e inicio.
      -- EN: Loads of the transferred cycle (14 to 25 days before): lots, batch and start.
      SELECT ARRAY(SELECT DISTINCT x[1] FROM public.setter_loads s, regexp_matches(coalesce(s.lote, ''), '[0-9]+', 'g') AS x
                    WHERE s.machine_id = v_inc AND s.loaded_at BETWEEN v_t - interval '25 days' AND v_t - interval '14 days'
                    ORDER BY 1),
             (SELECT CASE WHEN count(DISTINCT s.batch_id) = 1 THEN min(s.batch_id::text)::uuid END FROM public.setter_loads s
               WHERE s.machine_id = v_inc AND s.loaded_at BETWEEN v_t - interval '25 days' AND v_t - interval '14 days'),
             (SELECT min(coalesce(s.cycle_start_at, s.loaded_at)) FROM public.setter_loads s
               WHERE s.machine_id = v_inc AND s.loaded_at BETWEEN v_t - interval '25 days' AND v_t - interval '14 days')
        INTO v_lotes_bd, v_batch, v_ciclo;
      IF cardinality(v_lotes_bd) = 0 THEN v_lotes_bd := NULL; END IF;

      IF v_lotes_bd IS NULL THEN
        v_obs := array_append(v_obs, 'Sin cargue de esa incubadora en la base para ese ciclo: se registra lo reportado');
      ELSIF (r->>'loteInferido')::boolean THEN
        -- ES: El chat no dio el lote: manda la base. EN: The chat gave no lot: the DB wins.
        v_obs := array_append(v_obs, format('Lote tomado de la base (%s) porque el mensaje no lo traía', array_to_string(v_lotes_bd, ', ')));
        v_lotes := v_lotes_bd;
      ELSIF NOT (v_lotes <@ v_lotes_bd) THEN
        -- ES: Lotes del chat que no estaban cargados en esa incubadora. EN: Chat lots not loaded in that setter.
        SELECT string_agg(DISTINCT m.code, ', ') INTO v_candidatas
          FROM public.machines m
         WHERE m.plant_id = v_plant AND m.id <> v_inc AND m.code ~* '^INC'
           AND v_lotes <@ ARRAY(SELECT x[1] FROM public.setter_loads s, regexp_matches(coalesce(s.lote, ''), '[0-9]+', 'g') AS x
                                 WHERE s.machine_id = m.id AND s.loaded_at BETWEEN v_t - interval '25 days' AND v_t - interval '14 days'
                                   -- ES: cargada el mismo día (las que se pudieron confundir) / EN: loaded the same day
                                   AND (v_ciclo IS NULL OR abs(extract(epoch FROM coalesce(s.cycle_start_at, s.loaded_at) - v_ciclo)) <= 1.5 * 86400));
        v_obs := array_append(v_obs, format('Lotes del chat (%s) distintos a los cargados en %s según la base (%s)%s',
                                 array_to_string(v_lotes, ', '), r->>'incubadora', array_to_string(v_lotes_bd, ', '),
                                 CASE WHEN v_candidatas IS NOT NULL THEN '; esos lotes estaban en ' || v_candidatas ELSE '' END));
        n_distintas := n_distintas + 1;
      END IF;
    END IF;

    IF v_estado IS NULL THEN
      -- ES: Nacedoras (en el orden del turnero) y sus salas. EN: Hatchers (operator order) and rooms.
      SELECT array_agg(m.id ORDER BY (e->>'orden')::int),
             ARRAY(SELECT DISTINCT x FROM unnest(array_agg(m.room_id)) AS x WHERE x IS NOT NULL),
             jsonb_agg(jsonb_build_object(
               'order', (e->>'orden')::int,
               'hatcher_id', m.id,
               'carts', '[]'::jsonb,
               'lots', CASE WHEN (r->>'loteInferido')::boolean AND v_lotes_bd IS NOT NULL
                            THEN (SELECT jsonb_agg(jsonb_build_object('lot', l, 'trays', NULL)) FROM unnest(v_lotes_bd) AS l)
                            ELSE e->'lotes' END,
               'trays', e->'bandejas',
               'eggs', NULL,
               'carros', e->'carros') ORDER BY (e->>'orden')::int)
        INTO v_nacs, v_salas, v_alloc
        FROM jsonb_array_elements(r->'nacedoras') AS e
        JOIN public.machines m
          ON m.plant_id = v_plant AND m.code ~* ('^NAC-?0*' || (e->>'numero') || '$');
      IF coalesce(cardinality(v_nacs), 0) < jsonb_array_length(r->'nacedoras') THEN
        v_obs := array_append(v_obs, 'Alguna nacedora del reporte no existe en la planta');
      END IF;
      v_etiqueta := array_to_string(v_lotes, ' + ');

      -- ES: ¿Ya está registrada en la app? Misma incubadora ±3 días, o (transferencia
      --     antigua sin incubadora) misma sala ±2 días con algún lote en común.
      -- EN: Already recorded in the app? Same setter ±3 days, or (old transfer without
      --     setter) same room ±2 days sharing a lot.
      SELECT t.id INTO v_existente FROM public.transfers t
       WHERE t.org_id = v_org AND t.origen IS NULL
         AND ((t.source_machine_id = v_inc AND abs(extract(epoch FROM t.transferred_at - v_t)) < 3 * 86400)
           OR (t.source_machine_id IS NULL AND t.room_ids && v_salas
               AND abs(extract(epoch FROM t.transferred_at - v_t)) < 2 * 86400
               AND ARRAY(SELECT x[1] FROM regexp_matches(coalesce(t.lote, ''), '[0-9]+', 'g') AS x) && v_lotes))
       ORDER BY abs(extract(epoch FROM t.transferred_at - v_t)) LIMIT 1;
      IF v_existente IS NOT NULL THEN
        v_estado := 'ya_registrada_en_app';
        n_existian := n_existian + 1;
      END IF;
    END IF;

    IF v_estado IS NULL THEN
      BEGIN
        INSERT INTO public.transfers (
          org_id, plant_id, batch_id, lote, mode, room_ids, weight_diff, cycle_start_at, transferred_at,
          photo_path, created_by, source_machine_id, hatcher_ids, allocations, load_map_id, origen)
        VALUES (
          v_org, v_plant, v_batch, v_etiqueta,
          CASE WHEN cardinality(v_salas) > 1 THEN 'double' ELSE 'single' END,
          coalesce(v_salas, '{}'), NULL, v_ciclo, v_t,
          v_foto, v_autor, v_inc, coalesce(v_nacs, '{}'), coalesce(v_alloc, '[]'::jsonb), NULL,
          jsonb_build_object(
            'clave', r->>'clave', 'fuente', 'whatsapp:Transferencias',
            'reportado_en', r->>'reportadoEn', 'reportado_por', r->>'reportadoPor',
            'hora_estimada', (r->>'horaEstimada')::boolean, 'texto', r->>'texto',
            'correccion', r->'correccion', 'cruce_mapa', r->'cruceMapa',
            'observaciones', to_jsonb(v_obs), 'importado_en', now()))
        RETURNING id INTO v_id;
        v_estado := CASE WHEN cardinality(v_obs) > 0 THEN 'importada_con_observaciones' ELSE 'importada' END;
        n_nuevas := n_nuevas + 1;
      EXCEPTION WHEN OTHERS THEN
        -- ES: Se anota y se aborta al final (no queda a medias). EN: Logged; aborted at the end (no half state).
        v_estado := 'error';
        v_obs := array_append(v_obs, SQLERRM);
        n_error := n_error + 1;
        v_primer_error := coalesce(v_primer_error, format('%s: %s', r->>'clave', SQLERRM));
      END;
    END IF;

    -- ES: Si ya se importó antes, su fila del reporte se deja como quedó. EN: Already imported: keep its report row.
    CONTINUE WHEN v_estado = 'ya_importada';

    -- ES: Fila del reporte de cruce (se actualiza si ya existía). EN: Report row (updated if present).
    INSERT INTO incubapp_ops.cruce_transferencias_whatsapp AS c
      (clave, incubadora, salon, reportado_en, transferido_en, reportado_por, lotes_chat, lotes_bd, estado, observaciones, transfer_id, aplicado_en)
    VALUES (r->>'clave', r->>'incubadora', (r->>'salon')::int, (r->>'reportadoEn')::timestamptz, v_t, r->>'reportadoPor',
            v_lotes, v_lotes_bd, v_estado,
            v_obs || ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'notasCruce', '[]'::jsonb))),
            coalesce(v_id, v_existente), now())
    ON CONFLICT (clave) DO UPDATE SET
      transferido_en = EXCLUDED.transferido_en, lotes_chat = EXCLUDED.lotes_chat, lotes_bd = EXCLUDED.lotes_bd,
      estado = EXCLUDED.estado, observaciones = EXCLUDED.observaciones, transfer_id = EXCLUDED.transfer_id,
      aplicado_en = now();
  END LOOP;

  -- ES: Si alguna falló, se revierte todo para que se reintente al corregir.
  -- EN: If any failed, roll everything back so it is retried once fixed.
  IF n_error > 0 THEN
    RAISE EXCEPTION 'Transferencias WhatsApp: % con error. Primera: %', n_error, v_primer_error;
  END IF;

  -- ES: Resumen visible en el registro de 7-ACTUALIZAR-APP. EN: Summary shown in the update log.
  RAISE WARNING 'Transferencias WhatsApp: % nuevas, % ya estaban en la app, % con hora ajustada por recargue, % con lotes distintos a la base. Detalle: SELECT * FROM incubapp_ops.cruce_transferencias_whatsapp',
    n_nuevas, n_existian, n_ajustadas, n_distintas;
END
$migracion$;

-- ES: Que la API vea la columna nueva. EN: Let the API see the new column.
NOTIFY pgrst, 'reload schema';
`
}
