#!/usr/bin/env bash
# IncubApp · Respaldo automático a OneDrive
# Se ejecuta diariamente via Tarea Programada de Windows
# Henry Stark Desarrollador · 26-09-2026
set -euo pipefail

FECHA=$(date +%Y-%m-%d)
HORA=$(date +%H-%M)
LOG_DIR="/mnt/c/IncubApp/servidor-local/logs"
LOG="$LOG_DIR/respaldo-$FECHA.txt"
mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG") 2>&1

echo "=== Respaldo IncubApp $FECHA $HORA ==="

# Destino OneDrive (empresa si existe, si no personal)
ONEDRIVE_EMPRESA="/mnt/c/Users/Admin Mantenimiento/OneDrive - Antioqueña de Incubacion"
ONEDRIVE_PERSONAL="/mnt/c/Users/Admin Mantenimiento/OneDrive"

if [ -d "$ONEDRIVE_EMPRESA" ]; then
  DEST="$ONEDRIVE_EMPRESA/IncubApp-Respaldos"
elif [ -d "$ONEDRIVE_PERSONAL" ]; then
  DEST="$ONEDRIVE_PERSONAL/IncubApp-Respaldos"
else
  echo "ERROR: No se encontró carpeta de OneDrive."
  exit 1
fi

DEST_HOY="$DEST/$FECHA"
mkdir -p "$DEST_HOY"
echo "Destino: $DEST_HOY"

# 1. Backup de base de datos PostgreSQL
echo ""
echo "==> Exportando base de datos..."
PGPASSWORD=$(grep '^POSTGRES_PASSWORD=' /opt/incubapp/server/.env | cut -d= -f2-)
docker exec supabase-db pg_dump \
  -U postgres \
  --no-privileges \
  --no-owner \
  --compress=9 \
  -f /tmp/incubapp-db-$FECHA.sql.gz \
  postgres 2>/dev/null || \
docker exec supabase-db pg_dumpall \
  -U postgres \
  --globals-only \
  --compress=9 \
  -f /tmp/incubapp-db-$FECHA.sql.gz 2>/dev/null || true

# Intentar con pg_dump directo desde el host usando la contraseña
PGPASSWORD="$PGPASSWORD" docker exec supabase-db \
  pg_dump -U postgres postgres \
  | gzip > "/tmp/incubapp-db-$FECHA.sql.gz" 2>/dev/null || true

if [ -f "/tmp/incubapp-db-$FECHA.sql.gz" ]; then
  cp "/tmp/incubapp-db-$FECHA.sql.gz" "$DEST_HOY/"
  SIZE=$(du -sh "$DEST_HOY/incubapp-db-$FECHA.sql.gz" | cut -f1)
  echo "Base de datos exportada: $SIZE"
  rm -f "/tmp/incubapp-db-$FECHA.sql.gz"
else
  echo "ADVERTENCIA: No se pudo exportar la base de datos."
fi

# 2. Sync de archivos de Storage (solo archivos nuevos/modificados)
echo ""
echo "==> Sincronizando archivos de Storage..."
STORAGE_SRC="/opt/incubapp/server/volumes/storage"
STORAGE_DEST="$DEST/storage-sync"
mkdir -p "$STORAGE_DEST"

# rsync: solo copia lo que cambió, no duplica
if command -v rsync > /dev/null 2>&1; then
  rsync -a --delete --exclude=".gitkeep" --exclude="stub" \
    "$STORAGE_SRC/" "$STORAGE_DEST/"
  ARCHIVOS=$(find "$STORAGE_DEST" -type f | wc -l)
  echo "Storage sincronizado: $ARCHIVOS archivos en OneDrive"
else
  cp -ru "$STORAGE_SRC/." "$STORAGE_DEST/" 2>/dev/null || true
  echo "Storage copiado (sin rsync)"
fi

# 3. Limpiar respaldos de BD de más de 30 días
echo ""
echo "==> Limpiando respaldos antiguos (> 30 días)..."
find "$DEST" -maxdepth 1 -type d -name "20*" | sort | head -n -30 | while read -r dir; do
  echo "Eliminando: $dir"
  rm -rf "$dir"
done

# 4. Resumen
echo ""
TOTAL=$(du -sh "$DEST" 2>/dev/null | cut -f1)
echo "=== RESPALDO COMPLETO ==="
echo "Fecha: $FECHA $HORA"
echo "Tamaño total en OneDrive: $TOTAL"
echo "Ubicación: $DEST_HOY"
echo "Storage sync: $STORAGE_DEST"
echo "========================="
