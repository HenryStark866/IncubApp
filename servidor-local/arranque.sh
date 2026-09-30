#!/bin/bash
# IncubApp · servidor local — arranque dentro de WSL (lo llama arranque-windows.ps1).
# Espera a Docker y vuelve a levantar los contenedores que el reinicio o el apagón
# dejaron caídos (por ejemplo, porque su puerto estaba ocupado cuando Docker arrancó).
# Respeta los que se apagaron a mano (studio, imgproxy, supavisor): esos salen con
# código 0/143 y sin error de arranque, y no se tocan.
#
# Ojo: un contenedor que falló al conectar su red queda SIN redes; un `docker start`
# lo deja "arriba" pero aislado (la API respondía 502). Por eso los de compose se
# recrean con `docker compose up --force-recreate`, que vuelve a armar sus redes.

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
etiqueta() { docker inspect -f "{{index .Config.Labels \"$2\"}}" "$1"; }

systemctl start docker 2>/dev/null
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 3; done
if ! docker info >/dev/null 2>&1; then log "Docker no respondió en 3 min"; exit 1; fi
log "Docker listo"

# Dale a Docker un momento para su propio arranque de contenedores.
sleep 20

reparar() {
  local c=$1 proyecto servicio dir archivos args=()
  proyecto=$(etiqueta "$c" com.docker.compose.project)
  servicio=$(etiqueta "$c" com.docker.compose.service)
  dir=$(etiqueta "$c" com.docker.compose.project.working_dir)
  archivos=$(etiqueta "$c" com.docker.compose.project.config_files)
  if [ -n "$servicio" ] && [ -d "$dir" ]; then
    IFS=',' read -ra lista <<< "$archivos"
    for f in "${lista[@]}"; do args+=(-f "$f"); done
    (cd "$dir" && docker compose -p "$proyecto" "${args[@]}" up -d --no-deps --no-build --force-recreate "$servicio") >/dev/null 2>&1
  else
    docker start "$c" >/dev/null 2>&1
  fi
}

for intento in 1 2 3 4 5; do
  pendientes=""
  for c in $(docker ps -aq); do
    nombre=$(docker inspect -f '{{.Name}}' "$c" | sed 's#^/##')
    politica=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$c")
    [ "$politica" = "always" ] || [ "$politica" = "unless-stopped" ] || continue
    estado=$(docker inspect -f '{{.State.Status}}' "$c")
    error=$(docker inspect -f '{{.State.Error}}' "$c")
    codigo=$(docker inspect -f '{{.State.ExitCode}}' "$c")
    modo=$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$c")
    redes=$(docker inspect -f '{{len .NetworkSettings.Networks}}' "$c")
    case "$estado" in
      running)
        # Arriba pero sin ninguna red: quedó aislado tras un fallo de arranque.
        [ "$redes" = "0" ] && [ "$modo" != "host" ] && [ "$modo" != "none" ] && pendientes="$pendientes $nombre" ;;
      exited|dead)
        # Caído por error (puerto ocupado, red, apagón) → levantar. Apagado a mano → dejar.
        if [ -n "$error" ] || { [ "$codigo" != "0" ] && [ "$codigo" != "143" ]; }; then
          pendientes="$pendientes $nombre"
        fi ;;
    esac                                           # "created": nunca se arrancó, no tocar
  done
  [ -z "$pendientes" ] && break
  log "Intento $intento, levantando:$pendientes"
  for n in $pendientes; do reparar "$n"; log "  $n: $(docker inspect -f '{{.State.Status}} {{.State.Error}}' "$n" 2>/dev/null)"; done
  sleep 15
done

docker start incubapp-tunel >/dev/null 2>&1 || true
log "Estado final:"
docker ps --format '  {{.Names}}\t{{.Status}}'
