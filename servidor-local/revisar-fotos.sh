#!/usr/bin/env bash
# IncubApp · servidor local — 12. Revisa por qué una foto no se guarda en un depósito.
#
# 01-10-2026: las fotos de calibración al depósito wo-evidence devolvían una página en vez
# de guardarse («Respuesta no válida del servidor»); la app ahora las manda a
# machine-checks, que sí funciona. Este script busca la causa de fondo:
#   1. qué depósitos existen en Supabase y si son públicos;
#   2. sube un archivo de prueba (100 KB y 2 MB) a wo-evidence y a machine-checks,
#      directo a Supabase (puerto 8000) y por el nginx de la app (puerto 80, el camino
#      del celular), y muestra el código HTTP y el tipo de respuesta;
#   3. borra los archivos de prueba.
# Usa la clave de servicio del .env de Supabase (no sale de este equipo). No cambia nada más.
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
LOGS="$AQUI/logs"; mkdir -p "$LOGS"
exec > >(tee -a "$LOGS/12-fotos.txt") 2>&1
SRV=/opt/incubapp/server
cd "$SRV" || { echo "No existe $SRV"; exit 1; }
KEY=$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2- | tr -d '"')
[ -n "$KEY" ] || { echo "No se encontró SERVICE_ROLE_KEY en $SRV/.env"; exit 1; }
H=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY")
echo "=== Revisión de depósitos de fotos $(date -Is) ==="

echo "==> 1/3 Depósitos en Supabase"
curl -s -m 15 "${H[@]}" http://127.0.0.1:8000/storage/v1/bucket \
  | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin)
  for b in d: print("   ", b.get("id"), "· público" if b.get("public") else "· privado", "· límite", b.get("file_size_limit") or "sin límite")
except Exception as e: print("   No se pudo leer la lista:", e)'

TMP=$(mktemp -d)
head -c 100000 /dev/urandom > "$TMP/chica.jpg"
head -c 2000000 /dev/urandom > "$TMP/grande.jpg"
TS=$(date +%s)

subir() { # base depósito archivo
  local base="$1" bucket="$2" f="$3" ruta="_diagnostico/prueba-$TS-$(basename "$f")" code ct
  read -r code ct < <(curl -s -m 60 -o "$TMP/resp" -w '%{http_code} %{content_type}\n' "${H[@]}" \
    -H 'Content-Type: image/jpeg' -H 'x-upsert: true' --data-binary @"$f" "$base/storage/v1/object/$bucket/$ruta")
  printf '   %-14s %-11s %-6s HTTP %s  %s  %s\n' "$bucket" "$(basename "$f")" "$4" "$code" "${ct:-—}" "$(head -c 120 "$TMP/resp" | tr '\n' ' ')"
  curl -s -m 15 -o /dev/null "${H[@]}" -X DELETE "$base/storage/v1/object/$bucket/$ruta" || true
}

echo "==> 2/3 Subidas de prueba (directo a Supabase y por la app)"
for bucket in wo-evidence machine-checks; do
  for f in "$TMP/chica.jpg" "$TMP/grande.jpg"; do
    subir http://127.0.0.1:8000 "$bucket" "$f" directo
    subir http://127.0.0.1 "$bucket" "$f" app
  done
done

echo "==> 3/3 Lectura"
echo "   HTTP 200/201 = se guarda. 400 «Bucket not found» = el depósito no existe."
echo "   403 = permisos. 413 = archivo muy grande. text/html = la respuesta la dio nginx o"
echo "   Cloudflare, no Supabase: mande esta salida a soporte."
rm -rf "$TMP"
