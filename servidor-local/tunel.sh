#!/usr/bin/env bash
# IncubApp · servidor local — 5. Acceso desde fuera de la oficina con Cloudflare Tunnel.
# Uso: tunel.sh <archivo-con-token> <https://direccion.publica>
# No abre puertos en el router: el túnel sale desde este equipo hacia Cloudflare.
# El token es secreto: queda solo en /opt/incubapp/tunel.env (permisos 600).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
LOGS="$AQUI/logs"; mkdir -p "$LOGS"
exec > >(tee -a "$LOGS/5-tunel.txt") 2>&1
TOKFILE="${1:?Falta el archivo con el token}"; URL="${2:?Falta la dirección pública}"
URL="${URL%/}"
case "$URL" in https://*) ;; *) echo "La dirección debe empezar por https://"; exit 2;; esac
SRV=/opt/incubapp/server
echo "=== Túnel $(date -Is) → $URL ==="
umask 077
printf 'TUNNEL_TOKEN=%s\n' "$(tr -d '\r\n ' < "$TOKFILE")" > /opt/incubapp/tunel.env
# La app (contenedor `incubapp`, con nginx) y Supabase comparten la red supabase_default
# (ver docker-compose.yml de la raíz). El túnel entra por ahí y apunta a incubapp:80,
# que sirve la app y reenvía /auth, /rest, /storage, /realtime y /functions a kong.
RED=supabase_default
docker network inspect "$RED" >/dev/null 2>&1 || RED=$(docker inspect supabase-kong -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')
echo "Red de Supabase: $RED"
docker rm -f incubapp-tunel >/dev/null 2>&1 || true
docker run -d --name incubapp-tunel --restart unless-stopped --network "$RED" \
  --env-file /opt/incubapp/tunel.env --memory 96m \
  cloudflare/cloudflared:latest tunnel --no-autoupdate --protocol http2 --metrics 0.0.0.0:2000 run
cd "$SRV"
set_env() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi; }
set_env SUPABASE_PUBLIC_URL "$URL"
set_env API_EXTERNAL_URL "$URL/auth/v1"
# Los enlaces de los correos (recuperar contraseña, confirmar cuenta) vuelven a la app.
set_env SITE_URL "$URL"
echo "==> Aplicando la nueva dirección"
docker compose up -d --wait || docker compose ps
docker compose stop studio supavisor imgproxy || true
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
IP_LAN=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
{
  echo "# Generado $(date -Is). La clave anon es pública (va dentro de la app)."
  echo "VITE_SUPABASE_URL=$URL"
  echo "VITE_SUPABASE_KEY=$ANON"
  echo "IP_LAN=$IP_LAN"
} > "$LOGS/publico.env"
echo "==> Esperando que el túnel conecte"
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON" "$URL/auth/v1/health" || true)
  [ "$code" = 200 ] && break; sleep 3
done
echo "Prueba desde internet ($URL/auth/v1/health): ${code:-sin respuesta}"
docker logs --tail 5 incubapp-tunel
[ "${code:-}" = 200 ] && echo "LISTO: el servidor responde desde internet." || echo "El túnel aún no responde: revisa en Cloudflare que el 'Public hostname' apunte a HTTP incubapp:80 y que el contenedor incubapp esté arriba (docker compose up -d en C:\\IncubApp)."
