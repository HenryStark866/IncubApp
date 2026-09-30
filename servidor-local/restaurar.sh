#!/usr/bin/env bash
# IncubApp · servidor local — 3. Restaura el backup de Supabase (db_cluster-*.backup.gz).
# Uso: restaurar.sh /ruta/al/db_cluster-....backup.gz   (FORZAR=1 para repetir sobre datos)
# Henry Stark Desarrollador · 23-09-2026
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
LOGS="$AQUI/logs"; mkdir -p "$LOGS"
exec > >(tee -a "$LOGS/3-restaurar.txt") 2>&1
echo "=== Restauración $(date -Is) ==="
SRV=/opt/incubapp/server
WORK=/opt/incubapp/restore; mkdir -p "$WORK"
BK="${1:-}"
[ -f "$BK" ] || { echo "No encuentro el backup: '$BK'"; exit 2; }
cd "$SRV" 2>/dev/null && command -v docker >/dev/null && [ -f .env ] || { echo "DETENIDO: el servidor no está instalado todavía (paso 2)."; exit 4; }
PGPW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
psqlq() { docker exec -i -e PGPASSWORD="$PGPW" supabase-db psql -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=0 "$@"; }

echo "Backup: $BK ($(du -h "$BK" | cut -f1))"
TABLAS=$(psqlq -tAc "select count(*) from information_schema.tables where table_schema='public'")
echo "Tablas en public antes: $TABLAS"
if [ "${TABLAS:-0}" -gt 0 ] && [ "${FORZAR:-0}" != "1" ]; then
  echo "La base ya tiene datos. Para repetir la restauración ejecuta con FORZAR=1."; exit 3
fi

echo "==> Preparando el archivo (sin contraseñas de la nube, sin disparadores al cargar)"
zcat "$BK" \
  | sed -E '/^\\(un)?restrict /d' \
  | sed -E "s/ PASSWORD '[^']*'//" \
  | sed -E 's/^(\\connect .*)$/\1\nSET session_replication_role = replica;/' \
  > "$WORK/dump.sql"
sed -i '1i SET session_replication_role = replica;' "$WORK/dump.sql"
wc -c "$WORK/dump.sql"

echo "==> Deteniendo servicios (queda solo la base)"
docker compose stop auth rest realtime storage functions meta studio supavisor 2>/dev/null

echo "==> Cargando (tarda unos minutos)"
psqlq -q < "$WORK/dump.sql" > "$WORK/psql.log" 2>&1
echo "Errores de carga: $(grep -c 'ERROR' "$WORK/psql.log") (la mayoría son 'ya existe', normales)"
grep 'ERROR' "$WORK/psql.log" | grep -v 'already exists' | sort | uniq -c | sort -rn | head -40 > "$LOGS/3-errores-relevantes.txt"
echo "Errores distintos de 'ya existe' (resumen en logs/3-errores-relevantes.txt):"; head -20 "$LOGS/3-errores-relevantes.txt"

echo "==> Tablas que no cargaron completas: recarga por columnas comunes"
python3 "$AQUI/rescatar_copias.py" "$WORK/dump.sql" "$WORK/rescate" > "$WORK/bloques.tsv"
while IFS=$'\t' read -r tabla filas archivo cols; do
  [ -z "$tabla" ] && continue
  hay=$(psqlq -tAc "select count(*) from $tabla" 2>/dev/null | tr -d '[:space:]')
  if [ "${hay:-x}" = "0" ] && [ "$filas" -gt 0 ]; then
    echo "  $tabla: 0 de $filas → rescatando"
    psqlq -q -c "create schema if not exists restore_tmp; drop table if exists restore_tmp.t; create table restore_tmp.t ($(echo "$cols" | sed -E 's/([^,]+)/"\1" text/g'))"
    { echo "COPY restore_tmp.t ($(echo "$cols" | sed -E 's/([^,]+)/"\1"/g')) FROM stdin;"; cat "$archivo"; echo '\.'; } | psqlq -q
    esquema=${tabla%%.*}; nombre=${tabla#*.}
    psqlq -q <<SQL
set session_replication_role = replica;
do \$\$
declare comunes text; valores text;
begin
  select string_agg(format('%I', c.column_name), ','), string_agg(format('%I::%s', c.column_name, format_type(a.atttypid, a.atttypmod)), ',')
    into comunes, valores
  from information_schema.columns c
  join pg_attribute a on a.attrelid = '$tabla'::regclass and a.attname = c.column_name
  where c.table_schema = '$esquema' and c.table_name = '$nombre'
    and c.column_name in (select column_name from information_schema.columns where table_schema='restore_tmp' and table_name='t')
    and c.is_generated = 'NEVER' and a.attidentity = '';
  execute format('insert into $tabla (%s) select %s from restore_tmp.t on conflict do nothing', comunes, valores);
end \$\$;
SQL
    echo "    ahora: $(psqlq -tAc "select count(*) from $tabla" | tr -d '[:space:]')"
  fi
done < "$WORK/bloques.tsv"
psqlq -q -c "drop schema if exists restore_tmp cascade"

echo "==> Contraseñas de los roles internos = las de este servidor"
for r in authenticator pgbouncer supabase_admin supabase_auth_admin supabase_storage_admin supabase_functions_admin supabase_replication_admin supabase_read_only_user postgres; do
  psqlq -q -c "alter role $r with password '$PGPW'" 2>/dev/null
done

echo "==> Arrancando todo"
docker compose up -d --wait || docker compose ps
docker compose stop studio supavisor imgproxy || true

echo "==> Resumen"
psqlq -tA <<'SQL'
select 'usuarios (auth.users): ' || count(*) from auth.users;
select 'tablas en public: ' || count(*) from information_schema.tables where table_schema='public';
select 'buckets de archivos: ' || coalesce(string_agg(id, ', '), 'ninguno') from storage.buckets;
select 'archivos registrados (storage.objects): ' || count(*) from storage.objects;
SQL
for t in organizations profiles organization_members plants rooms machines machine_checks work_orders machine_calibrations setter_loads transfers load_maps; do
  echo "  $t: $(psqlq -tAc "select count(*) from public.$t" 2>/dev/null | tr -d '[:space:]')"
done
echo "LISTO."
