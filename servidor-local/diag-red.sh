#!/usr/bin/env bash
# IncubApp · diagnóstico de red y procesos dentro de Ubuntu (solo lee).
echo "=== Diagnóstico $(date -Is) ==="
echo "--- Proceso 1: $(ps -p 1 -o comm=)"
echo "--- Procesos colgados (apt/curl/bash):"; ps -eo pid,etimes,cmd | grep -E 'apt|dpkg|curl|instalar|respald|git' | grep -v grep
echo "--- /etc/resolv.conf"; cat /etc/resolv.conf
echo "--- /etc/wsl.conf"; cat /etc/wsl.conf
echo "--- ip"; ip -4 addr | grep inet; ip route | head -3
echo "--- DNS"; for h in archive.ubuntu.com security.ubuntu.com get.docker.com download.docker.com github.com registry-1.docker.io; do printf '%s: ' $h; getent hosts $h | head -1 || echo FALLA; done
echo "--- HTTPS"; for u in http://archive.ubuntu.com/ubuntu/ https://get.docker.com https://github.com https://registry-1.docker.io/v2/; do printf '%s → ' $u; curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' --max-time 15 $u 2>&1 | tail -1; done
echo "--- proxy env"; env | grep -i proxy
echo "--- apt"; ls /etc/apt/apt.conf.d/ | head; grep -ri proxy /etc/apt/ 2>/dev/null | head
echo "--- memoria"; free -m
echo "=== fin ==="
