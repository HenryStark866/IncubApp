#!/bin/bash
# Test completo con ANON_KEY real
ANON_KEY=$(grep '^ANON_KEY=' /opt/incubapp/server/.env | cut -d= -f2-)
echo "=== AUTH HEALTH (via nginx proxy) ==="
curl -sk -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" http://localhost/auth/v1/health
echo ""
echo "=== REST V1 (via nginx proxy) ==="
curl -sk -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" "http://localhost/rest/v1/" 2>&1 | head -c 500
echo ""
echo "=== REST DIRECTO 8000 ==="
curl -sk -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" "http://localhost:8000/rest/v1/" 2>&1 | head -c 500
echo ""
echo "=== STORAGE (via nginx) ==="
curl -sk -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" "http://localhost/storage/v1/bucket" 2>&1 | head -c 500
echo ""
