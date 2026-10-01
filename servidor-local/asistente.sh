#!/usr/bin/env bash
# IncubApp · servidor local — 12. Asistente de voz propio (gratis, sin IA externa).
# Apaga el flujo de Claude en n8n y levanta el asistente que busca en nuestros manuales.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
docker exec incubapp-n8n n8n unpublish:workflow --id=IncubAppAsisten1 >/dev/null 2>&1 || true
docker compose -f "$AQUI/asistente/docker-compose.yml" up -d --build
echo "Asistente encendido. Registro: docker logs -f incubapp-asistente"
