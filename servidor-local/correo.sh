#!/usr/bin/env bash
# IncubApp · servidor local — 8. Conecta un servidor de correo (SMTP) a Supabase para que
# «¿Olvidaste tu contraseña?» y las confirmaciones de cuenta puedan enviar su enlace.
# Uso: correo.sh <archivo-con-datos>   (lo llama 8-configurar-correo.ps1)
#      correo.sh --probar <correo>       revisa plantilla y servidor de correo, y manda una prueba
# El archivo trae HOST, PORT, USER, PASS, SENDER, NAME y URL; se borra al terminar.
# La contraseña queda solo en /opt/incubapp/server/.env (permisos 600).
# 01-10-2026: los correos salen en español con la marca de Incubant (plantillas en
# public/correo/ de la app, asuntos en docker-compose.override.yml de Supabase).
# 01-10-2026 (tarde): la primera prueba dio HTTP 504 «context deadline exceeded»: el
# servicio de cuentas buscaba la plantilla en https://incubapp.cdhmaker.com (salía a
# internet y volvía por Cloudflare) y se pasaba de sus 10 segundos. Ahora la lee del
# nginx de la app en este mismo equipo (host.docker.internal), y la prueba revisa por
# separado la plantilla y el servidor de correo para decir cuál falla.
# 01-10-2026 (noche): host.docker.internal tampoco llegaba desde el contenedor. Las
# plantillas las sirve ahora un contenedor mínimo (busybox httpd, «correo-plantillas»)
# en la MISMA red de Supabase, leyendo public/correo/ de la app: no depende de la red
# de Windows ni de internet. Y si el servidor de correo no responde, la prueba mira qué
# puertos de correo sí están abiertos desde este equipo.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
LOGS="$AQUI/logs"; mkdir -p "$LOGS"
exec > >(tee -a "$LOGS/8-correo.txt") 2>&1
SRV=/opt/incubapp/server
PLANT_LOCAL='http://correo-plantillas'
# Copia dentro de Ubuntu (no se monta C:\ en el contenedor: al encender puede no estar lista).
DIR_PLANT="$SRV/correo-plantillas"

# Correos en español con la marca de Incubant. Supabase (GoTrue) lee cada plantilla por
# URL; las sirve el contenedor «correo-plantillas» en la misma red de Supabase.
# Devuelve 0 si el archivo cambió (hay que reiniciar auth).
escribir_plantillas() {
  local ovr="$SRV/docker-compose.override.yml" nuevo
  mkdir -p "$DIR_PLANT" && cp -f "$AQUI/../public/correo/"*.html "$DIR_PLANT/"
  if [ -f "$ovr" ] && ! grep -q 'IncubApp: correos' "$ovr"; then
    echo "Aviso: $ovr ya existe y no es de IncubApp; no se tocan plantillas ni asuntos."
    return 1
  fi
  nuevo=$(cat <<YML
# IncubApp: correos en español (lo escribe servidor-local/correo.sh; se puede volver a generar).
services:
  correo-plantillas:
    image: busybox:1.36
    restart: unless-stopped
    command: ["httpd", "-f", "-p", "80", "-h", "/www"]
    volumes:
      - "$DIR_PLANT:/www:ro"
  auth:
    environment:
      GOTRUE_MAILER_SUBJECTS_RECOVERY: "IncubApp · Cambie su contraseña"
      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: "IncubApp · Confirme su correo"
      GOTRUE_MAILER_SUBJECTS_INVITE: "IncubApp · Lo invitaron a IncubApp"
      GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE: "IncubApp · Confirme su nuevo correo"
      GOTRUE_MAILER_SUBJECTS_MAGIC_LINK: "IncubApp · Su enlace para entrar"
      GOTRUE_MAILER_TEMPLATES_RECOVERY: "$PLANT_LOCAL/recuperar.html"
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: "$PLANT_LOCAL/confirmar.html"
      GOTRUE_MAILER_TEMPLATES_INVITE: "$PLANT_LOCAL/invitacion.html"
      GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: "$PLANT_LOCAL/cambio-correo.html"
      GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: "$PLANT_LOCAL/enlace-acceso.html"
YML
)
  if [ -f "$ovr" ] && [ "$(cat "$ovr")" = "$nuevo" ]; then return 1; fi
  printf '%s\n' "$nuevo" > "$ovr"
  echo "Plantillas en español: $PLANT_LOCAL/… (contenedor correo-plantillas)"
  return 0
}

# Docker solo carga docker-compose.override.yml solo con ciertos nombres del archivo
# principal; en el Lenovo no lo cargaba («no such service: correo-plantillas»,
# 01-10-2026). Se declara en COMPOSE_FILE del .env de Supabase, que leen TODOS los
# «docker compose» de esa carpeta (arranque, vigilante, actualizaciones).
usar_override() {
  local principal f actual nuevo
  cd "$SRV"
  for f in compose.yaml compose.yml docker-compose.yaml docker-compose.yml; do
    [ -f "$f" ] && { principal=$f; break; }
  done
  [ -n "${principal:-}" ] || { echo "Aviso: no se encontró el docker-compose de Supabase en $SRV"; return 0; }
  actual=$(grep '^COMPOSE_FILE=' .env | head -1 | cut -d= -f2- | tr -d '"' || true)
  case ":$actual:" in *":docker-compose.override.yml:"*) return 0 ;; esac
  # Si ya había un COMPOSE_FILE (con otros archivos), se le agrega el de correos.
  nuevo="${actual:-$principal}:docker-compose.override.yml"
  grep -v '^COMPOSE_FILE=' .env > .env.tmp && printf 'COMPOSE_FILE=%s\n' "$nuevo" >> .env.tmp \
    && cat .env.tmp > .env && rm -f .env.tmp && chmod 600 .env
  echo "COMPOSE_FILE=$nuevo (Supabase usa el ajuste de correos)"
}

reiniciar_auth() {
  echo "==> Reiniciando el servicio de cuentas (auth) y las plantillas"
  usar_override
  (cd "$SRV" && docker compose up -d correo-plantillas) || echo "Aviso: no subió correo-plantillas; los correos saldrán con la plantilla de Supabase."
  (cd "$SRV" && docker compose up -d --force-recreate --no-deps auth)
  sleep 8
  (cd "$SRV" && docker compose ps auth --format 'table {{.Name}}\t{{.Status}}')
}

# Revisa por separado lo que necesita el envío: la plantilla y el servidor de correo.
diagnostico() {
  local host port tls
  cd "$SRV"
  host=$(grep '^SMTP_HOST=' .env | cut -d= -f2- | tr -d '"')
  port=$(grep '^SMTP_PORT=' .env | cut -d= -f2- | tr -d '"')
  echo "==> 1/2 Plantilla desde el servicio de cuentas"
  docker compose up -d correo-plantillas >/dev/null 2>&1 || true
  # Desde un contenedor de paso en la misma red de Supabase (el de cuentas puede no traer wget).
  if docker compose run --rm --no-deps -T correo-plantillas wget -q -T 5 -O /dev/null "$PLANT_LOCAL/recuperar.html" >/dev/null 2>&1; then
    echo "   OK: la plantilla carga."
  else
    echo "   FALLA: no carga $PLANT_LOCAL/recuperar.html. Estado del contenedor:"
    docker compose ps correo-plantillas --format '     {{.Name}} {{.Status}}' 2>/dev/null || true
  fi
  echo "==> 2/2 Servidor de correo $host:$port"
  tls='-starttls smtp'
  [ "$port" = 465 ] && tls=''
  # shellcheck disable=SC2086
  if timeout 12 openssl s_client $tls -connect "$host:$port" -servername "$host" -brief </dev/null >/tmp/correo-tls.txt 2>&1 \
     && grep -qiE 'Protocol version|CONNECTION ESTABLISHED' /tmp/correo-tls.txt; then
    echo "   OK: el servidor de correo responde y abre la conexión segura."
  else
    echo "   FALLA: $host:$port no respondió a tiempo (servidor, puerto o firewall). Detalle:"
    head -5 /tmp/correo-tls.txt 2>/dev/null | sed 's/^/     /' || true
    echo "   Puertos de correo abiertos desde este equipo (para elegir otro servicio):"
    local h p
    # «abierto» solo si contesta un servidor de correo de verdad (saludo 220): en el
    # puerto 80 un firewall puede aceptar la conexión sin dejarla pasar. 465 abre con
    # TLS directo y no saluda en claro: ahí basta con que abra.
    # 01-10-2026: en la planta salían cerrados TODOS los de Gmail, Brevo y Office 365;
    # SMTP2GO también recibe por 80 y 8025, que los firewalls suelen dejar pasar.
    local hp
    for hp in smtp.gmail.com:587 smtp.gmail.com:465 smtp-relay.brevo.com:587 smtp-relay.brevo.com:2525 \
      smtp.office365.com:587 mail.smtp2go.com:2525 mail.smtp2go.com:8025 mail.smtp2go.com:80; do
      h=${hp%:*}; p=${hp#*:}
      if [ "$p" = 465 ]; then
        if timeout 6 bash -c "</dev/tcp/$h/$p" 2>/dev/null; then echo "     abierto  $hp"; else echo "     cerrado  $hp"; fi
      elif timeout 8 bash -c "exec 3<>/dev/tcp/$h/$p; head -c 3 <&3" 2>/dev/null | grep -q '^220'; then
        echo "     abierto  $hp"
      else
        echo "     cerrado  $hp"
      fi
    done
    if timeout 8 bash -c "</dev/tcp/www.google.com/443" 2>/dev/null; then
      echo "   (La salida web por 443 sí funciona: el firewall de la red bloquea solo el correo.)"
    fi
  fi
  rm -f /tmp/correo-tls.txt
}

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
  docker compose logs --since 2m auth 2>/dev/null | grep -iE "smtp|mail|recover|error" | grep -v 'MAILER_EXTERNAL_HOSTS' | tail -8 || true
  if [ "$code" = 200 ]; then
    echo "LISTO: el correo salió. Revise la bandeja de $correo (y la de spam)."
  else
    echo "ATENCIÓN: no salió. Revise arriba cuál de los dos pasos falló y el error del servicio de cuentas."
    echo "(Supabase deja pedir un correo de recuperación por cuenta cada 60 segundos: espere 1 minuto entre pruebas.)"
  fi
}

if [ "${1:-}" = "--probar" ]; then
  if escribir_plantillas || ! grep -q '^COMPOSE_FILE=.*override' "$SRV/.env"; then reiniciar_auth; fi
  diagnostico
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

escribir_plantillas || true
reiniciar_auth

diagnostico
if [ -n "${PRUEBA:-}" ]; then probar "$PRUEBA"; fi
