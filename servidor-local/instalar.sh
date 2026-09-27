#!/usr/bin/env bash
# IncubApp · servidor local — 2. Instala Docker y Supabase dentro de Ubuntu (WSL).
# Lo llama 2-INSTALAR-SERVIDOR.bat. Se puede repetir: lo que ya existe no se toca.
# Los secretos quedan SOLO en /opt/incubapp/server/.env (dentro de Ubuntu).
# Henry Stark Desarrollador · 23-09-2026
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
LOGS="$AQUI/logs"; mkdir -p "$LOGS"
exec 3>&1
exec > >(tee -a "$LOGS/2-instalar.txt") 2>&1
echo "=== Instalación $(date -Is) ==="
VERSION=self-hosted/v0.8.2
BASE=/opt/incubapp
SRV=$BASE/server

paso() { printf '\n==> %s\n' "$*"; }

paso "Paquetes básicos"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl jq gzip >/dev/null

paso "Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
docker --version; docker compose version

paso "Supabase ($VERSION)"
mkdir -p "$BASE"; cd "$BASE"
if [ ! -d supabase-src ]; then
  git clone --depth 1 --branch "$VERSION" https://github.com/supabase/supabase supabase-src
fi
if [ ! -f "$SRV/docker-compose.yml" ]; then
  mkdir -p "$SRV"; cp -rf supabase-src/docker/. "$SRV"
fi
cd "$SRV"

set_env() {
  local k="$1" v="$2"
  if grep -q "^$k=" .env; then sed -i "s|^$k=.*|$k=$v|" .env; else printf '%s=%s\n' "$k" "$v" >> .env; fi
}

if [ ! -f .env ]; then
  paso "Claves nuevas (secretas, solo en este equipo)"
  cp .env.example .env
  sh utils/generate-keys.sh --update-env >/dev/null
  rm -f .env.old
  chmod 600 .env
fi

paso "Configuración de IncubApp"
IP_LAN=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
PUBLICA="${INCUBAPP_URL:-http://${IP_LAN:-localhost}:8000}"
set_env DASHBOARD_USERNAME incubapp
set_env STUDIO_DEFAULT_ORGANIZATION Incubant
set_env STUDIO_DEFAULT_PROJECT IncubApp
set_env SUPABASE_PUBLIC_URL "$PUBLICA"
set_env API_EXTERNAL_URL "$PUBLICA/auth/v1"
set_env SITE_URL "${INCUBAPP_SITE:-$PUBLICA}"
set_env ADDITIONAL_REDIRECT_URLS "https://incubapp.cdhmaker.com,https://incubapp.cdhmaker.com/**,https://incubant-app.vercel.app,https://incubant-app.vercel.app/**,http://localhost:5173/**"
# Sin servidor de correo todavía: las cuentas nuevas quedan confirmadas y la
# empresa aprueba el acceso en la app (is_approved), como siempre.
set_env ENABLE_EMAIL_AUTOCONFIRM true
set_env PGRST_DB_MAX_ROWS 1000
grep -E '^(SUPABASE_PUBLIC_URL|API_EXTERNAL_URL|SITE_URL|DASHBOARD_USERNAME)=' .env

paso "Descargando imágenes (la primera vez tarda: son varios GB)"
docker compose pull -q

paso "Arrancando"
docker compose up -d --wait || { docker compose ps; echo "Algún servicio no quedó sano; revisa arriba"; }
docker compose ps --format 'table {{.Name}}\t{{.Status}}'

paso "Datos públicos para la app (sin secretos)"
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
{
  echo "# Generado $(date -Is). La clave anon es pública (va dentro de la app)."
  echo "VITE_SUPABASE_URL=$PUBLICA"
  echo "VITE_SUPABASE_KEY=$ANON"
  echo "IP_LAN=$IP_LAN"
} > "$AQUI/logs/publico.env"
cat "$AQUI/logs/publico.env"

paso "Prueba de salud"
curl -s -o /dev/null -w "auth: %{http_code}\n" -H "apikey: $ANON" http://localhost:8000/auth/v1/health || true
curl -s -o /dev/null -w "rest: %{http_code}\n" -H "apikey: $ANON" http://localhost:8000/rest/v1/ || true

# La contraseña va solo a la pantalla (descriptor 3), nunca al registro.
{
  echo
  echo "================================================================"
  echo " Panel de administración (Studio): http://localhost:8000"
  echo " Usuario: incubapp"
  echo " Contraseña: $(grep '^DASHBOARD_PASSWORD=' .env | cut -d= -f2-)"
  echo " >>> Anótala en un lugar seguro. No la compartas por chat. <<<"
  echo "================================================================"
} >&3
echo "LISTO. Siguiente paso: 3-RESTAURAR-BACKUP.bat"
