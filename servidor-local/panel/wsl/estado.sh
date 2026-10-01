#!/usr/bin/env bash
# Panel IncubApp: estado del lado de Ubuntu en un solo JSON (ver estado.py).
exec python3 "$(dirname "$0")/estado.py" "${1:-rapido}"
