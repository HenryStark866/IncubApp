#!/usr/bin/env bash
# IncubApp · servidor local — 4. Activa la copia de seguridad diaria (2:00 a. m.).
# Uso: instalar-respaldo.sh "/mnt/c/Users/.../OneDrive - .../IncubApp-Respaldos"
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:?Falta la carpeta de destino}"
echo "==> Paquetes"
command -v rsync >/dev/null && command -v getfattr >/dev/null || { apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq rsync attr >/dev/null; }
echo "==> Zona horaria de Colombia"
timedatectl set-timezone America/Bogota 2>/dev/null || ln -sf /usr/share/zoneinfo/America/Bogota /etc/localtime
mkdir -p /opt/incubapp "$DEST"
printf '%s' "$DEST" > /opt/incubapp/respaldo-destino
echo "==> Temporizador diario"
cat > /etc/systemd/system/incubapp-respaldo.service <<UNIT
[Unit]
Description=IncubApp - copia de seguridad (base de datos y fotos)
After=docker.service
[Service]
Type=oneshot
ExecStart=/bin/bash "$AQUI/respaldar.sh"
UNIT
cat > /etc/systemd/system/incubapp-respaldo.timer <<UNIT
[Unit]
Description=IncubApp - respaldo diario 2:00 a. m.
[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now incubapp-respaldo.timer
systemctl list-timers incubapp-respaldo.timer --no-pager
echo "==> Primer respaldo ahora mismo (las fotos pueden tardar varios minutos)"
bash "$AQUI/respaldar.sh" || true
tail -n 8 "$AQUI/logs/respaldo.txt"
