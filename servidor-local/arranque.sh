#!/usr/bin/env bash
# IncubApp · servidor local — arranque automático y vigilante.
#
#   arranque.sh             levanta todo (Docker, Supabase, app, túnel) y espera a que responda
#   arranque.sh --vigia     revisión de cada minuto: si algo no responde, lo vuelve a levantar
#   arranque.sh --instalar  deja el arranque y el vigilante como servicios de Ubuntu (systemd)
#
# Por qué existe (30-09-2026): tras reiniciar el Lenovo, Cloudflare daba 502. Docker
# arrancaba, pero nadie volvía a levantar Supabase ni el contenedor de la app si fallaban
# al primer intento (p. ej. el puerto 80 todavía ocupado). Ahora systemd lo hace al
# encender Ubuntu y lo revisa cada minuto, sin que nadie tenga que iniciar sesión.
set -uo pipefail

APP=/mnt/c/IncubApp
SRV=/opt/incubapp/server
LOG=/var/log/incubapp-arranque.log
# Servicios de Supabase que no hacen falta en producción (tunel.sh ya los detenía).
SOBRAN='^(studio|supavisor|imgproxy)$'

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

instalar() {
  local yo
  yo="$(readlink -f "$0")"
  cat > /etc/systemd/system/incubapp-arranque.service <<UNIT
[Unit]
Description=IncubApp: levanta Supabase, la app y el túnel al encender
After=docker.service network-online.target
Wants=docker.service network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/env bash $yo
TimeoutStartSec=15min
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNIT
  cat > /etc/systemd/system/incubapp-vigia.service <<UNIT
[Unit]
Description=IncubApp: revisa que la app responda y levanta lo que se haya caído
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/env bash $yo --vigia
TimeoutStartSec=10min
UNIT
  cat > /etc/systemd/system/incubapp-vigia.timer <<UNIT
[Unit]
Description=IncubApp: vigilante cada minuto

[Timer]
OnBootSec=3min
OnUnitActiveSec=1min
AccuracySec=10s

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable docker >/dev/null 2>&1
  systemctl enable incubapp-arranque.service incubapp-vigia.timer
  systemctl start incubapp-vigia.timer
  log "Servicios instalados: incubapp-arranque (al encender) e incubapp-vigia (cada minuto)."
}

esperar_docker() {
  systemctl start docker >/dev/null 2>&1 || service docker start >/dev/null 2>&1 || true
  for _ in $(seq 1 60); do
    docker info >/dev/null 2>&1 && return 0
    sleep 2
  done
  log "Docker no respondió en 2 minutos."
  return 1
}

# ¿Responde la app de punta a punta? (nginx de la app + API de Supabase detrás)
# El túnel a veces queda «Up» pero sin ninguna conexión con Cloudflare (la red corta
# y cloudflared no se recupera): desde internet sale 502 / Error 1033. Su /ready lo
# dice; si falla dos veces seguidas (o el contenedor viejo no tiene métricas), se
# recrea con tunel_crear, que además usa HTTP/2 (TCP) en vez de QUIC (UDP).
tunel_listo() {
  docker exec incubapp-incubapp-1 wget -q -T 5 -O /dev/null http://incubapp-tunel:2000/ready 2>/dev/null
}
tunel_crear() {
  [ -f /opt/incubapp/tunel.env ] || return 0
  local red
  red=$(docker inspect incubapp-tunel -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print $1}')
  docker rm -f incubapp-tunel >/dev/null 2>&1 || true
  docker run -d --name incubapp-tunel --restart unless-stopped --network "${red:-supabase_default}"     --env-file /opt/incubapp/tunel.env --memory 96m     cloudflare/cloudflared:latest tunnel --no-autoupdate --protocol http2 --metrics 0.0.0.0:2000 run >/dev/null
}
revisar_tunel() {
  # Los cortes cortos del internet (10-30 s) los recupera cloudflared solo; recrearlo
  # en medio los alarga. Solo se recrea tras 4 revisiones seguidas (≈4 min) sin conexión.
  local cuenta=/run/incubapp-tunel-fallas n
  docker inspect incubapp-tunel >/dev/null 2>&1 || return 0
  if tunel_listo; then rm -f "$cuenta"; return 0; fi
  n=$(( $(cat "$cuenta" 2>/dev/null || echo 0) + 1 ))
  echo "$n" > "$cuenta"
  [ "$n" -ge 4 ] || return 0
  rm -f "$cuenta"
  log "Vigilante: el túnel lleva 4 minutos sin conexión con Cloudflare; se recrea."
  tunel_crear
}

# Docker no reinicia un contenedor «unhealthy» (vivo pero sin responder): se reinicia aquí.
# Los que sobran en producción (studio, supavisor/pooler, imgproxy) no se tocan.
revisar_enfermos() {
  local n
  for n in $(docker ps --filter health=unhealthy --format '{{.Names}}'); do
    case "$n" in *studio*|*pooler*|*imgproxy*) continue;; esac
    log "Vigilante: $n no responde (unhealthy); se reinicia."
    docker restart "$n" >/dev/null 2>&1 || true
  done
}
revisar_asistente() {
  docker inspect incubapp-asistente >/dev/null 2>&1 || return 0
  docker exec incubapp-incubapp-1 wget -q -T 5 -O /dev/null http://incubapp-asistente:8080/ 2>/dev/null && return 0
  log "Vigilante: el asistente no responde; se reinicia."
  docker restart incubapp-asistente >/dev/null 2>&1 || true
}

# Algún servicio de Supabase o de la app detenido (aunque la página principal responda).
falta_servicio() {
  local quiere corren
  [ -d "$SRV" ] || return 1
  quiere=$(cd "$SRV" && docker compose config --services 2>/dev/null | grep -Ev "$SOBRAN" | sort)
  corren=$(cd "$SRV" && docker compose ps --status running --services 2>/dev/null | sort)
  [ -n "$(comm -23 <(echo "$quiere") <(echo "$corren"))" ]
}

responde() {
  local app api
  app=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1/ || true)
  api=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1/auth/v1/health || true)
  # /auth/v1/health responde 200 (o 401 si pide apikey): ambos significan que Supabase está vivo.
  [ "$app" = 200 ] && { [ "$api" = 200 ] || [ "$api" = 401 ]; }
}

# Contenedores que un arranque fallido dejó rotos (29-09-2026: con el puerto ocupado,
# envoy quedó "arriba" pero SIN red y la API daba 502; `up --no-recreate` no lo arregla).
# Se recrean con compose, que vuelve a armar sus redes. Los apagados a mano (código 0/143,
# sin error) no se tocan.
reparar_rotos() {
  local c nombre estado error codigo modo redes proyecto servicio dir archivos f args
  for c in $(docker ps -aq); do
    case "$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$c")" in always|unless-stopped) ;; *) continue ;; esac
    nombre=$(docker inspect -f '{{.Name}}' "$c" | sed 's#^/##')
    estado=$(docker inspect -f '{{.State.Status}}' "$c")
    error=$(docker inspect -f '{{.State.Error}}' "$c")
    codigo=$(docker inspect -f '{{.State.ExitCode}}' "$c")
    modo=$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$c")
    redes=$(docker inspect -f '{{len .NetworkSettings.Networks}}' "$c")
    case "$estado" in
      running) [ "$redes" = 0 ] && [ "$modo" != host ] && [ "$modo" != none ] || continue ;;
      exited|dead) [ -n "$error" ] || { [ "$codigo" != 0 ] && [ "$codigo" != 143 ]; } || continue ;;
      *) continue ;;
    esac
    proyecto=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$c")
    servicio=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$c")
    dir=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$c")
    archivos=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$c")
    log "Reparando $nombre ($estado, redes=$redes${error:+, $error})"
    if [ -n "$servicio" ] && [ -d "$dir" ]; then
      args=()
      IFS=',' read -ra lista <<< "$archivos"
      for f in "${lista[@]}"; do args+=(-f "$f"); done
      (cd "$dir" && docker compose -p "$proyecto" "${args[@]}" up -d --no-deps --no-build --force-recreate "$servicio") >>"$LOG" 2>&1 \
        || log "  $nombre no se pudo recrear (ver arriba)."
    else
      docker start "$c" >/dev/null 2>&1 || true
    fi
  done
}

levantar() {
  reparar_rotos
  if [ -d "$SRV" ]; then
    local servicios
    servicios=$(cd "$SRV" && docker compose config --services 2>/dev/null | grep -Ev "$SOBRAN" | tr '\n' ' ')
    # shellcheck disable=SC2086
    (cd "$SRV" && docker compose up -d --no-recreate $servicios) >>"$LOG" 2>&1 || log "Supabase: algún servicio no subió (ver arriba)."
  fi
  if [ -f "$APP/docker-compose.yml" ]; then
    # Si el puerto 80 lo tiene otro programa, la app no puede arrancar: se deja dicho.
    if ! docker ps --format '{{.Names}}' | grep -qx 'incubapp-incubapp-1' && ss -ltn 2>/dev/null | grep -q ':80 '; then
      log "Aviso: el puerto 80 está ocupado por otro programa; la app no puede tomarlo."
    fi
    (cd "$APP" && docker compose up -d --no-recreate --no-build incubapp) >>"$LOG" 2>&1 || log "La app no subió (ver arriba)."
  fi
  docker start incubapp-tunel incubapp-lector incubapp-asistente >/dev/null 2>&1 || true
}

case "${1:-}" in
  --instalar)
    instalar
    exit 0
    ;;
  --vigia)
    esperar_docker || exit 0
    revisar_enfermos
    if ! responde || falta_servicio; then
      log "Vigilante: la app o un servicio no responde; levantando lo que falte."
      levantar
      for _ in $(seq 1 24); do responde && break; sleep 5; done
      responde || { log "Vigilante: sigue sin responder; se reintenta en el próximo minuto."; exit 0; }
      log "Vigilante: la app volvió a responder."
    fi
    # Túnel y asistente se revisan desde el contenedor de la app: solo con la app arriba.
    revisar_tunel
    revisar_asistente
    exit 0
    ;;
esac

log "=== Arranque ==="
esperar_docker || exit 1
levantar
for _ in $(seq 1 60); do
  if responde; then
    log "Listo: la app responde en este equipo."
    exit 0
  fi
  sleep 5
done
log "La app todavía no responde tras 5 minutos; el vigilante seguirá intentando cada minuto."
exit 0
