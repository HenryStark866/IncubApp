#!/usr/bin/env bash
# IncubApp · servidor local — 8. Conecta un servidor de correo (SMTP) a Supabase para que
# «¿Olvidaste tu contraseña?» y las confirmaciones de cuenta puedan enviar su enlace.
# Uso: correo.sh <archivo-con-datos>   (lo llama 8-configurar-correo.ps1)
# El archivo trae HOST, PORT, USER, PASS, SENDER, NAME y URL; se borra al terminar.
# La contraseña queda solo en /opt/incubapp/server/.env (permisos 600).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
LOGS="$AQUI/logs"; mkdir -p "$LOGS"
exec > >(tee -a "$LOGS/8-correo.txt") 2>&1
DATOS="${1:?Falta el archivo con los datos del correo}"
# shellcheck disable=SC1090
. "$DATOS"
SRV=/opt/incubapp/server
cd "$SRV"
echo "=== Correo $(date -Is) → $HOST:$PORT como $SENDER ==="

set_env() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi; }
get_env() { grep "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"'; }

set_env SMTP_HOST "$HOST"
set_env SMTP_PORT "$PORT"
set_env SMTP_USER "$USER"
# La contraseña puede traer | o &: se escribe sin pasar por sed.
grep -v '^SMTP_PASS=' .env > .env.tmp && printf 'SMTP_PASS=%s\n' "$PASS" >> .env.tmp && cat .env.tmp > .env && rm -f .env.tmp
set_env SMTP_ADMIN_EMAIL "$SENDER"
set_env SMTP_SENDER_NAME "\"$NAME\""
chmod 600 .env

URL="${URL%/}"
if [ -n "$URL" ]; then
  set_env SITE_URL "$URL"
  # Supabase arma el enlace como API_EXTERNAL_URL + MAILER_URLPATHS_* (que ya empiezan
  # por /auth/v1). Si API_EXTERNAL_URL también termina en /auth/v1 el enlace queda
  # «/auth/v1/auth/v1/verify» y no abre.
  RUTA=$(get_env MAILER_URLPATHS_RECOVERY)
  case "$RUTA" in
    /auth/v1/*) set_env API_EXTERNAL_URL "$URL" ;;
    *) set_env API_EXTERNAL_URL "$URL/auth/v1" ;;
  esac
  ADIC=$(get_env ADDITIONAL_REDIRECT_URLS)
  case ",$ADIC," in *",$URL/**,"*) ;; *) set_env ADDITIONAL_REDIRECT_URLS "${ADIC:+$ADIC,}$URL,$URL/**" ;; esac
fi
grep -E '^(SITE_URL|API_EXTERNAL_URL|SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_ADMIN_EMAIL|SMTP_SENDER_NAME)=' .env

echo "==> Reiniciando el servicio de cuentas (auth)"
docker compose up -d --force-recreate --no-deps auth
sleep 8
docker compose ps auth --format 'table {{.Name}}\t{{.Status}}'

echo "==> Probando conexión con $HOST:$PORT desde el servidor"
if timeout 10 bash -c "</dev/tcp/$HOST/$PORT" 2>/dev/null; then
  echo "LISTO: el servidor alcanza el correo. Prueba «¿Olvidaste tu contraseña?» en la app."
else
  echo "ATENCIÓN: no se pudo abrir $HOST:$PORT. Revisa el servidor, el puerto o el firewall."
fi
docker compose logs --tail 15 auth | grep -iE "smtp|mail|error" || true
