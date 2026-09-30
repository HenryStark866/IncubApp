#!/usr/bin/env bash
# IncubApp · servidor local — 8. Conecta un servidor de correo (SMTP) a Supabase para que
# «¿Olvidaste tu contraseña?» y las confirmaciones de cuenta puedan enviar su enlace.
# Uso: correo.sh <archivo-con-datos>   (lo llama 8-configurar-correo.ps1)
#      correo.sh --probar <correo>       manda un correo de prueba (recuperar contraseña)
# El archivo trae HOST, PORT, USER, PASS, SENDER, NAME y URL; se borra al terminar.
# La contraseña queda solo en /opt/incubapp/server/.env (permisos 600).
# 01-10-2026: los correos salen en español con la marca de Incubant (plantillas en
# public/correo/ de la app, asuntos en docker-compose.override.yml de Supabase).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
LOGS="$AQUI/logs"; mkdir -p "$LOGS"
exec > >(tee -a "$LOGS/8-correo.txt") 2>&1
SRV=/opt/incubapp/server

# Prueba real: pide a Supabase un correo de «recuperar contraseña» para ese correo
# (debe ser de una cuenta que exista) y muestra lo que respondió el servicio de cuentas.
probar() {
  local correo="$1" anon code
  cd "$SRV"
  anon=$(grep '^ANON_KEY=' .env | cut -d= -f2- | tr -d '"')
  echo "==> Enviando correo de prueba (recuperar contraseña) a $correo"
  code=$(curl -s -o /tmp/correo-prueba.json -w '%{http_code}' -m 40 \
    -H "apikey: $anon" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$correo\"}" http://127.0.0.1:8000/auth/v1/recover || true)
  echo "Respuesta del servidor: HTTP $code $(head -c 300 /tmp/correo-prueba.json 2>/dev/null)"
  rm -f /tmp/correo-prueba.json
  sleep 3
  docker compose logs --since 2m auth 2>/dev/null | grep -iE "smtp|mail|recover|error" | tail -8 || true
  if [ "$code" = 200 ]; then
    echo "LISTO: el correo salió. Revise la bandeja de $correo (y la de spam)."
  else
    echo "ATENCIÓN: no salió. Revise arriba el error (usuario, contraseña de aplicación o puerto)."
  fi
}
if [ "${1:-}" = "--probar" ]; then
  probar "${2:?Falta el correo de prueba}"
  exit 0
fi

DATOS="${1:?Falta el archivo con los datos del correo}"
# shellcheck disable=SC1090
. "$DATOS"
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

# Correos en español con la marca de Incubant. Supabase (GoTrue) lee cada plantilla por
# URL: se sirven desde la misma app (public/correo/). Si una plantilla no carga, Supabase
# usa la suya en inglés: el enlace funciona igual.
OVR="$SRV/docker-compose.override.yml"
if [ -f "$OVR" ] && ! grep -q 'IncubApp: correos' "$OVR"; then
  echo "Aviso: $OVR ya existe y no es de IncubApp; no se tocan plantillas ni asuntos."
else
  PLANT="${URL:-https://incubapp.cdhmaker.com}/correo"
  cat > "$OVR" <<YML
# IncubApp: correos en español (lo escribe servidor-local/correo.sh; se puede volver a generar).
services:
  auth:
    environment:
      GOTRUE_MAILER_SUBJECTS_RECOVERY: "IncubApp · Cambie su contraseña"
      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: "IncubApp · Confirme su correo"
      GOTRUE_MAILER_SUBJECTS_INVITE: "IncubApp · Lo invitaron a IncubApp"
      GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE: "IncubApp · Confirme su nuevo correo"
      GOTRUE_MAILER_SUBJECTS_MAGIC_LINK: "IncubApp · Su enlace para entrar"
      GOTRUE_MAILER_TEMPLATES_RECOVERY: "$PLANT/recuperar.html"
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: "$PLANT/confirmar.html"
      GOTRUE_MAILER_TEMPLATES_INVITE: "$PLANT/invitacion.html"
      GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: "$PLANT/cambio-correo.html"
      GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: "$PLANT/enlace-acceso.html"
YML
  echo "Plantillas en español: $PLANT/…"
fi

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
if [ -n "${PRUEBA:-}" ]; then probar "$PRUEBA"; fi
