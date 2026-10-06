#!/usr/bin/env bash
# =============================================================================
# IncubApp · servidor local — 15. Verifica que la última actualización quedó completa:
# versión del código, migraciones aplicadas, resultado de la importación de
# transferencias del WhatsApp, inicios de ciclo dudosos y códigos de OT dañados.
# Autor: Henry Taborda — Ing. en desarrollo de software · 06-10-2026
# ES: Solo LEE. Deja el resultado en servidor-local/exportes/verificacion_<fecha>.txt
# EN: Read-only. Writes the result to servidor-local/exportes/verificacion_<date>.txt
# =============================================================================
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
mkdir -p "$AQUI/exportes"
SALIDA="$AQUI/exportes/verificacion_$(date +%Y%m%d_%H%M).txt"
exec > >(tee "$SALIDA") 2>&1
SRV=/opt/incubapp/server
PGPW=$(grep '^POSTGRES_PASSWORD=' "$SRV/.env" | cut -d= -f2-)
q() { docker exec -i -e PGPASSWORD="$PGPW" supabase-db psql -h localhost -U supabase_admin -d postgres -P pager=off "$@"; }

echo "=== Verificación del servidor IncubApp · $(date -Is) ==="
echo; echo "== 1. Versión del código"
git -C "$RAIZ" log -3 --format='   %h %ci %s'

echo; echo "== 2. Últimas líneas del registro de 7-ACTUALIZAR-APP"
tail -n 25 "$AQUI/logs/7-actualizar.txt" 2>/dev/null | sed 's/^/   /' || echo "   (sin registro)"

echo; echo "== 3. Migraciones listadas que AÚN NO están aplicadas"
pend=0
while IFS= read -r l; do
  n="$(echo "$l" | tr -d '\r' | sed 's/#.*//' | xargs)"; [ -z "$n" ] && continue
  ya=$(q -tA -c "SELECT 1 FROM incubapp_ops.migraciones WHERE nombre = '$n'" 2>/dev/null)
  [ "$ya" = "1" ] || { echo "   PENDIENTE: $n"; pend=$((pend+1)); }
done < "$AQUI/migraciones.txt"
[ "$pend" = 0 ] && echo "   Todas aplicadas."

q <<'SQL'
\echo
\echo == 4. Importación de transferencias del WhatsApp
SELECT count(*) AS transferencias_importadas FROM public.transfers WHERE origen->>'fuente' = 'whatsapp:Transferencias';
SELECT estado, count(*) FROM incubapp_ops.cruce_transferencias_whatsapp GROUP BY 1 ORDER BY 2 DESC;
\echo
\echo == 5. Cargues con inicio de ciclo antes del cargue o más de 2 días después (últimos 40 días)
SELECT m.code, s.lote, s.loaded_at AT TIME ZONE 'America/Bogota' AS cargue_bogota,
       s.cycle_start_at AT TIME ZONE 'America/Bogota' AS inicio_bogota,
       round(extract(epoch FROM s.cycle_start_at - s.loaded_at) / 3600, 1) AS horas
  FROM public.setter_loads s JOIN public.machines m ON m.id = s.machine_id
 WHERE s.loaded_at > now() - interval '40 days'
   AND (s.cycle_start_at < s.loaded_at - interval '1 hour' OR s.cycle_start_at > s.loaded_at + interval '2 days')
 ORDER BY s.loaded_at DESC;
\echo
\echo == 6. Órdenes de trabajo con código dañado (OT-#####)
SELECT count(*) AS ots_codigo_danado, min(created_at) AS desde FROM public.work_orders WHERE code LIKE '%#%';
SELECT max((regexp_match(code, '([0-9]+)$'))[1]::bigint) AS mayor_numero_ot FROM public.work_orders WHERE code ~ '[0-9]+$';
\echo -- Funciones que arman el código de la OT:
SELECT p.proname, pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname IN ('public', 'private') AND p.prokind = 'f'
   AND CASE WHEN p.prokind = 'f' THEN pg_get_functiondef(p.oid) ILIKE '%OT-%' ELSE false END;
\echo -- Disparadores de work_orders:
SELECT tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE t.tgrelid = 'public.work_orders'::regclass AND NOT t.tgisinternal;
SQL
echo; echo "Listo: $SALIDA"
