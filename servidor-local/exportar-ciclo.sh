#!/usr/bin/env bash
# =============================================================================
# IncubApp · servidor local — 14. Exporta todo lo registrado de unas máquinas en un
# periodo (rondas con lecturas, lecturas del bot, OTs, calibraciones, cargues, mapas de
# cargue, transferencias y nacimientos) a un solo archivo JSON para analizarlo.
# Autor: Henry Taborda — Ing. en desarrollo de software · 06-10-2026
#
# ES: Solo LEE la base: no cambia nada. Las fotos no se incluyen (solo su ruta).
# EN: Read-only: changes nothing. Photos are not included (only their path).
#
# Uso / Usage:
#   exportar-ciclo.sh <códigos separados por coma> <desde AAAA-MM-DD> <hasta AAAA-MM-DD>
#   (sin argumentos: INC-05, INC-23 y NAC-07..12 del 12-09-2026 al 06-10-2026)
# Salida / Output: servidor-local/exportes/ciclo_<desde>_<hasta>.json
# =============================================================================
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
CODIGOS="${1:-INC-05,INC-23,NAC-07,NAC-08,NAC-09,NAC-10,NAC-11,NAC-12}"
DESDE="${2:-2026-09-12}"
HASTA="${3:-2026-10-06}"
# ES: Solo se aceptan códigos y fechas con formato esperado (nada de SQL suelto).
# EN: Only well-formed codes and dates are accepted (no loose SQL).
[[ "$CODIGOS" =~ ^[A-Za-z0-9,-]+$ ]] || { echo "Códigos inválidos: $CODIGOS"; exit 1; }
[[ "$DESDE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && "$HASTA" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "Fechas inválidas"; exit 1; }
mkdir -p "$AQUI/exportes"
SALIDA="$AQUI/exportes/ciclo_${DESDE}_${HASTA}.json"
SRV=/opt/incubapp/server
PGPW=$(grep '^POSTGRES_PASSWORD=' "$SRV/.env" | cut -d= -f2-)
LISTA="'$(echo "$CODIGOS" | sed "s/,/','/g")'"

echo "Exportando $CODIGOS del $DESDE al $HASTA…"
docker exec -i -e PGPASSWORD="$PGPW" supabase-db psql -h localhost -U supabase_admin -d postgres -qAt -v ON_ERROR_STOP=1 > "$SALIDA" <<SQL
-- ES: Ejecuta una consulta y devuelve sus filas como JSON; si la tabla o columna no
--     existe en este servidor, devuelve [] en vez de fallar.
-- EN: Runs a query and returns its rows as JSON; missing table/column → [] instead of failing.
CREATE OR REPLACE FUNCTION pg_temp.filas(consulta text) RETURNS jsonb LANGUAGE plpgsql AS \$f\$
DECLARE r jsonb;
BEGIN
  EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM (' || consulta || ') x' INTO r;
  RETURN r;
EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
  RETURN jsonb_build_array(jsonb_build_object('no_disponible', SQLERRM));
END \$f\$;

CREATE TEMP TABLE maq AS SELECT id, code, name, type, room_id, plant_id FROM public.machines WHERE code IN ($LISTA);

SELECT jsonb_pretty(jsonb_build_object(
  'exportado_en', now(),
  'parametros', jsonb_build_object('codigos', '$CODIGOS', 'desde', '$DESDE', 'hasta', '$HASTA'),
  'maquinas', pg_temp.filas('SELECT * FROM maq'),
  'salas', pg_temp.filas('SELECT r.* FROM public.rooms r WHERE r.id IN (SELECT room_id FROM maq)'),
  'rondas', pg_temp.filas(\$q\$SELECT m.code, c.* FROM public.machine_checks c JOIN maq m ON m.id = c.machine_id
      WHERE c.taken_at >= '$DESDE'::date - 2 AND c.taken_at < '$HASTA'::date + 1 ORDER BY m.code, c.taken_at\$q\$),
  'lecturas_bot', pg_temp.filas(\$q\$SELECT m.code, a.* FROM public.machine_check_ai_readings a JOIN maq m ON m.id = a.machine_id
      JOIN public.machine_checks c ON c.id = a.check_id
      WHERE c.taken_at >= '$DESDE'::date - 2 AND c.taken_at < '$HASTA'::date + 1\$q\$),
  'ordenes_trabajo', pg_temp.filas(\$q\$SELECT m.code, w.* FROM public.work_orders w JOIN maq m ON m.id = w.machine_id
      WHERE w.created_at >= '$DESDE'::date - 15 AND w.created_at < '$HASTA'::date + 1 ORDER BY w.created_at\$q\$),
  'calibraciones', pg_temp.filas(\$q\$SELECT m.code, k.* FROM public.machine_calibrations k JOIN maq m ON m.id = k.machine_id
      WHERE k.created_at >= '$DESDE'::date - 15 AND k.created_at < '$HASTA'::date + 1\$q\$),
  'cargues', pg_temp.filas(\$q\$SELECT m.code, s.* FROM public.setter_loads s JOIN maq m ON m.id = s.machine_id
      WHERE s.loaded_at >= '$DESDE'::date - 30 AND s.loaded_at < '$HASTA'::date + 1\$q\$),
  'mapas_cargue', pg_temp.filas(\$q\$SELECT l.* FROM public.load_maps l
      WHERE (to_jsonb(l)->>'machine_id' IN (SELECT id::text FROM maq) OR l.payload->>'machineId' IN (SELECT id::text FROM maq))
        AND l.created_at >= '$DESDE'::date - 30\$q\$),
  'transferencias', pg_temp.filas(\$q\$SELECT t.* FROM public.transfers t
      WHERE t.transferred_at >= '$DESDE'::date - 5 AND t.transferred_at < '$HASTA'::date + 1
        AND (t.source_machine_id IN (SELECT id FROM maq) OR t.hatcher_ids && ARRAY(SELECT id FROM maq)
             OR t.room_ids && ARRAY(SELECT room_id FROM maq WHERE room_id IS NOT NULL))\$q\$),
  'nacimientos', pg_temp.filas(\$q\$SELECT h.* FROM public.hatch_events h
      WHERE coalesce(h.started_at, h.scheduled_at, h.created_at) >= '$DESDE'::date AND coalesce(h.started_at, h.scheduled_at, h.created_at) < '$HASTA'::date + 2\$q\$),
  'actividades_turno', pg_temp.filas(\$q\$SELECT a.* FROM public.shift_activities a
      WHERE a.created_at >= '$DESDE'::date AND a.created_at < '$HASTA'::date + 1
        AND (to_jsonb(a)->>'machine_id' IN (SELECT id::text FROM maq) OR to_jsonb(a)::text ~* '(INC-0?5|INC-23|NAC-(0?[7-9]|1[0-2]))[^0-9]')\$q\$),
  'perfiles', pg_temp.filas('SELECT id, full_name FROM public.profiles')
));
SQL
echo "Listo: $SALIDA ($(du -h "$SALIDA" | cut -f1))"
python3 - "$SALIDA" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
for k, v in d.items():
    if isinstance(v, list): print(f"   {k}: {len(v)}")
PY
