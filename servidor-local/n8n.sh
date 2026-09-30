#!/usr/bin/env bash
# IncubApp · servidor local — 10. Instala n8n y el bot de lecturas de rondas.
# Uso: n8n.sh [archivo-con-clave]   (lo llama 10-instalar-n8n.ps1)
# El archivo opcional trae CLAUDE_KEY=...; se borra al terminar. Sin clave, n8n
# queda instalado con el flujo apagado, y se vuelve a correr cuando la haya.
# Secretos solo en /opt/incubapp/n8n/.env (permisos 600). Se puede repetir.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
LOGS="$AQUI/logs"; mkdir -p "$LOGS"
exec 3>&1
exec > >(tee -a "$LOGS/10-n8n.txt") 2>&1
echo "=== n8n $(date -Is) ==="

SRV=/opt/incubapp/server
DIR=/opt/incubapp/n8n
ENVF=$DIR/.env
mkdir -p "$DIR"; chmod 700 "$DIR"
paso() { printf '\n==> %s\n' "$*"; }
get_env() { { grep "^$1=" "$2" 2>/dev/null || true; } | head -1 | cut -d= -f2- | tr -d '"'; }
put_env() { grep -v "^$1=" "$ENVF" > "$ENVF.tmp" || true; printf '%s=%s\n' "$1" "$2" >> "$ENVF.tmp"; cat "$ENVF.tmp" > "$ENVF"; rm -f "$ENVF.tmp"; }
aleatorio() { openssl rand -hex "${1:-24}"; }

CLAUDE_KEY=""
if [ -n "${1:-}" ] && [ -f "$1" ]; then
  # shellcheck disable=SC1090
  . "$1"
fi

paso "Base de datos: tabla y funciones del bot"
bash "$AQUI/aplicar-migraciones.sh" "$RAIZ"

paso "Secretos de n8n"
touch "$ENVF"; chmod 600 "$ENVF"
[ -n "$(get_env N8N_ENCRYPTION_KEY "$ENVF")" ] || put_env N8N_ENCRYPTION_KEY "$(aleatorio 32)"
[ -n "$(get_env BOT_DB_PASSWORD "$ENVF")" ] || put_env BOT_DB_PASSWORD "$(aleatorio 24)"
[ -n "$(get_env N8N_ADMIN_PASSWORD "$ENVF")" ] || put_env N8N_ADMIN_PASSWORD "Incub$(aleatorio 8)A1"
if [ -n "$CLAUDE_KEY" ]; then put_env CLAUDE_KEY "$CLAUDE_KEY"; echo "Clave de Claude guardada."; fi
BOT_DB_PASSWORD=$(get_env BOT_DB_PASSWORD "$ENVF")
N8N_ADMIN_PASSWORD=$(get_env N8N_ADMIN_PASSWORD "$ENVF")
CLAUDE_KEY=$(get_env CLAUDE_KEY "$ENVF")
SERVICE_KEY=$(get_env SERVICE_ROLE_KEY "$SRV/.env")
PGPW=$(get_env POSTGRES_PASSWORD "$SRV/.env")
[ -n "$SERVICE_KEY" ] || { echo "No encontré SERVICE_ROLE_KEY en $SRV/.env"; exit 1; }

paso "Clave del rol bot_lecturas"
docker exec -i -e PGPASSWORD="$PGPW" supabase-db psql -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q \
  -v clave="$BOT_DB_PASSWORD" <<'SQL'
ALTER ROLE bot_lecturas WITH LOGIN PASSWORD :'clave';
SQL

paso "Contenedor de n8n"
docker compose -f "$AQUI/n8n/docker-compose.yml" up -d
for i in $(seq 1 60); do
  curl -fsS -o /dev/null http://127.0.0.1:5678/healthz 2>/dev/null && break
  sleep 3
done
curl -fsS http://127.0.0.1:5678/healthz >/dev/null || { echo "n8n no respondió"; docker logs --tail 40 incubapp-n8n; exit 1; }
echo "n8n responde en http://127.0.0.1:5678"

paso "Usuario administrador de n8n"
ADMIN=admin@incubapp.local
CUERPO=$(jq -nc --arg e "$ADMIN" --arg p "$N8N_ADMIN_PASSWORD" '{email:$e, firstName:"Admin", lastName:"IncubApp", password:$p}')
if curl -fsS -o /dev/null -X POST -H 'Content-Type: application/json' -d "$CUERPO" http://127.0.0.1:5678/rest/owner/setup 2>/dev/null; then
  echo "Administrador creado."
else
  echo "El administrador ya existía (no se cambió)."
fi

paso "Credenciales del bot"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
CLAUDE_VALOR=${CLAUDE_KEY:-falta-la-clave}
jq -n --arg db "$BOT_DB_PASSWORD" --arg sk "$SERVICE_KEY" --arg ck "$CLAUDE_VALOR" '[
  {id:"IncubAppBotBD001", name:"IncubApp · bot de lecturas (base de datos)", type:"postgres",
   data:{host:"supabase-db", port:5432, database:"postgres", user:"bot_lecturas", password:$db, ssl:"disable", allowUnauthorizedCerts:false, sshTunnel:false}},
  {id:"IncubAppFotos001", name:"IncubApp · fotos de rondas", type:"httpHeaderAuth",
   data:{name:"Authorization", value:("Bearer " + $sk)}},
  {id:"IncubAppClaude01", name:"IncubApp · Claude (Anthropic)", type:"httpHeaderAuth",
   data:{name:"x-api-key", value:$ck}}
]' > "$TMP/credenciales.json"
cp "$AQUI/n8n/flujo-lecturas.json" "$TMP/flujo.json"
chmod 644 "$TMP"/*.json; chmod 755 "$TMP"
# La línea de comandos de n8n y el servidor no pueden abrir la base de n8n al
# mismo tiempo (SQLite): se detiene, se importa y se vuelve a encender.
COMPOSE=(docker compose -f "$AQUI/n8n/docker-compose.yml")
n8n_cli() { "${COMPOSE[@]}" run --rm --no-deps -T -v "$TMP:/importar:ro" n8n "$@"; }
"${COMPOSE[@]}" stop n8n
n8n_cli import:credentials --input=/importar/credenciales.json

paso "Flujo del bot"
n8n_cli import:workflow --input=/importar/flujo.json
if [ -n "$CLAUDE_KEY" ]; then
  n8n_cli publish:workflow --id=IncubAppLectura1
  ESTADO="ENCENDIDO: lee las fotos nuevas cada 5 minutos."
else
  n8n_cli unpublish:workflow --id=IncubAppLectura1 || true
  ESTADO="APAGADO: falta la clave de Claude. Vuelve a correr 10-INSTALAR-N8N.bat con la clave."
fi
rm -f "$TMP/credenciales.json"
"${COMPOSE[@]}" up -d
for i in $(seq 1 40); do curl -fsS -o /dev/null http://127.0.0.1:5678/healthz 2>/dev/null && break; sleep 3; done

cat >&3 <<FIN

────────────────────────────────────────────
 n8n:      http://127.0.0.1:5678
 Usuario:  $ADMIN
 Clave:    $N8N_ADMIN_PASSWORD
 Bot:      $ESTADO
────────────────────────────────────────────
FIN
echo "Listo. Bot: $ESTADO"
