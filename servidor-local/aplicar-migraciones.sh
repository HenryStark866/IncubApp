#!/usr/bin/env bash
# IncubApp · servidor local — aplica las migraciones de servidor-local/migraciones.txt
# que aún no estén en incubapp_ops.migraciones. Cada archivo corre en una transacción:
# si falla, no queda a medias y el script se detiene sin anotarlo.
# Uso: aplicar-migraciones.sh <carpeta raíz del repo>
set -euo pipefail
RAIZ="${1:?Falta la carpeta del repositorio}"
LISTA="$RAIZ/servidor-local/migraciones.txt"
SRV=/opt/incubapp/server
PGPW=$(grep '^POSTGRES_PASSWORD=' "$SRV/.env" | cut -d= -f2-)
psql_db() { docker exec -i -e PGPASSWORD="$PGPW" -e PGOPTIONS="-c client_min_messages=warning" supabase-db psql -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql_db <<'SQL'
CREATE SCHEMA IF NOT EXISTS incubapp_ops;
REVOKE ALL ON SCHEMA incubapp_ops FROM public;
CREATE TABLE IF NOT EXISTS incubapp_ops.migraciones (nombre text PRIMARY KEY, aplicada timestamptz NOT NULL DEFAULT now());
SQL

aplicadas=0
while IFS= read -r linea || [ -n "$linea" ]; do
  nombre="$(echo "$linea" | tr -d '\r' | sed 's/#.*//' | xargs)"
  [ -z "$nombre" ] && continue
  archivo="$RAIZ/supabase/migrations/$nombre"
  [ -f "$archivo" ] || { echo "No existe $nombre"; exit 1; }
  ya=$(psql_db -tA -c "SELECT 1 FROM incubapp_ops.migraciones WHERE nombre = '$nombre'")
  [ "$ya" = "1" ] && continue
  echo "Aplicando $nombre…"
  { echo 'BEGIN;'; cat "$archivo"; echo; echo "INSERT INTO incubapp_ops.migraciones(nombre) VALUES ('$nombre');"; echo 'COMMIT;'; } | psql_db
  aplicadas=$((aplicadas + 1))
done < "$LISTA"
echo "Migraciones nuevas aplicadas: $aplicadas"
