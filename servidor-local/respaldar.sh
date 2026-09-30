#!/usr/bin/env bash
# IncubApp · servidor local — copia de seguridad (base de datos + fotos).
# La ejecuta todos los días a las 2:00 a. m. el temporizador incubapp-respaldo
# (lo instala 4-ACTIVAR-RESPALDO.bat). También se puede correr a mano.
# Destino por defecto: la carpeta de OneDrive de la empresa, que la sube a la nube.
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
LOGS="$AQUI/logs"; mkdir -p "$LOGS"
exec >> "$LOGS/respaldo.txt" 2>&1
SRV=/opt/incubapp/server
DEST="$(cat /opt/incubapp/respaldo-destino 2>/dev/null || true)"
[ -n "$DEST" ] || { echo "$(date -Is) ERROR: no hay destino configurado (/opt/incubapp/respaldo-destino)"; exit 2; }
DIAS=${DIAS_A_GUARDAR:-14}
HOY=$(date +%Y-%m-%d_%H%M)
echo "=== Respaldo $(date -Is) → $DEST ==="
mkdir -p "$DEST/base-de-datos" "$DEST/fotos" || { echo "ERROR: no puedo escribir en $DEST"; exit 3; }
cd "$SRV" || exit 4
PGPW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
ok=1

# 1) Base de datos: roles + base "postgres" completa (public, auth, storage...).
TMP=/opt/incubapp/respaldo-tmp; mkdir -p "$TMP"
if docker exec -e PGPASSWORD="$PGPW" supabase-db pg_dumpall -h localhost -U supabase_admin --globals-only --no-role-passwords > "$TMP/roles.sql" \
 && docker exec -e PGPASSWORD="$PGPW" supabase-db pg_dump -h localhost -U supabase_admin -d postgres -Fc -Z 6 > "$TMP/postgres.dump"; then
  tar -C "$TMP" -cf "$DEST/base-de-datos/incubapp-$HOY.tar" roles.sql postgres.dump
  echo "Base de datos: incubapp-$HOY.tar ($(du -h "$DEST/base-de-datos/incubapp-$HOY.tar" | cut -f1))"
else
  echo "ERROR al volcar la base de datos"; ok=0
fi
rm -rf "$TMP"
# Se guardan solo los últimos $DIAS días.
find "$DEST/base-de-datos" -name 'incubapp-*.tar' -mtime +"$DIAS" -print -delete

# 2) Fotos y archivos (Storage): copia incremental. Nunca borra en el destino,
#    así una foto borrada por error en la app sigue en el respaldo.
if rsync -a --no-perms --no-owner --no-group "$SRV/volumes/storage/" "$DEST/fotos/"; then
  echo "Fotos: $(du -sh "$DEST/fotos" | cut -f1) en total"
  # Storage guarda el tipo de cada archivo en atributos extendidos, que OneDrive
  # no conserva: se guardan aparte (restaurar con: setfattr --restore=archivo).
  (cd "$SRV/volumes" && getfattr -R -d -m - storage 2>/dev/null | gzip > "$DEST/fotos-atributos.txt.gz") || true
else
  echo "ERROR al copiar las fotos"; ok=0
fi

[ "$ok" = 1 ] && echo "RESPALDO OK $(date -Is)" || echo "RESPALDO CON ERRORES $(date -Is)"
date -Is > "$LOGS/ultimo-respaldo.txt"; [ "$ok" = 1 ] && echo OK >> "$LOGS/ultimo-respaldo.txt" || echo ERROR >> "$LOGS/ultimo-respaldo.txt"
