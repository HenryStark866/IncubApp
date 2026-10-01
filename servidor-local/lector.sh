#!/usr/bin/env bash
# IncubApp · servidor local — 11. Lector propio de fotos de ronda (gratis, sin IA externa).
# Apaga el flujo de Claude en n8n (para que no lean las dos cosas) y levanta el lector.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
BOT_DB_PASSWORD=$(grep '^BOT_DB_PASSWORD=' /opt/incubapp/n8n/.env | cut -d= -f2- | tr -d '"')
[ -n "$BOT_DB_PASSWORD" ] || { echo "Falta BOT_DB_PASSWORD: corre antes 10-INSTALAR-N8N."; exit 1; }
export BOT_DB_PASSWORD
docker exec incubapp-n8n n8n unpublish:workflow --id=IncubAppLectura1 >/dev/null 2>&1 || true
docker compose -f "$AQUI/lector-fotos/docker-compose.yml" up -d --build
echo "Lector de fotos encendido. Registro: docker logs -f incubapp-lector"
