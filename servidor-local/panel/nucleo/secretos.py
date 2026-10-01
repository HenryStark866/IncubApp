"""Panel IncubApp · tachar secretos antes de mostrar o guardar textos.

Los registros de los contenedores y de los scripts pueden traer claves (JWT de Supabase,
contraseñas del .env, el token del túnel…). Nada de eso debe salir por la pantalla ni en un
reporte de soporte: todo texto que venga de un registro pasa por `tachar()`.
"""
from __future__ import annotations

import re

_TACHADO = '«oculto»'

_PATRONES: list[tuple[re.Pattern, str]] = [
    # JWT (anon/service_role de Supabase, sesiones): eyJ….eyJ….firma
    (re.compile(r'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'), _TACHADO),
    # Claves con prefijo conocido (Anthropic, GitHub, Stripe, Slack, ngrok, Cloudflare…)
    (re.compile(r'\b(sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}'
                r'|xox[abprs]-[A-Za-z0-9-]{10,}|sb_secret_[A-Za-z0-9_-]{10,})'), _TACHADO),
    # VARIABLE=valor cuando el nombre dice que es secreto (.env, docker inspect, compose config)
    (re.compile(r'(?i)\b([A-Z0-9_]*(?:PASS(?:WORD)?|SECRET|TOKEN|_KEY|APIKEY|API_KEY|AUTHTOKEN|PRIVATE|CREDENTIAL)[A-Z0-9_]*)'
                r'(\s*[=:]\s*)("[^"]*"|\'[^\']*\'|[^\s,;&]+)'), r'\1\2' + _TACHADO),
    # Cabeceras HTTP con credenciales
    (re.compile(r'(?i)\b(authorization|apikey|x-api-key|cookie|set-cookie)(\s*[:=]\s*)(bearer\s+)?([^\s,;&]+)'),
     r'\1\2\3' + _TACHADO),
    # Parámetros en URLs: ?token=…&password=…&apikey=…
    (re.compile(r'(?i)([?&](?:token|access_token|refresh_token|apikey|api_key|password|pass|secret|key|llave)=)[^&\s"\']+'),
     r'\1' + _TACHADO),
    # Cadenas de conexión con usuario:contraseña@
    (re.compile(r'(?i)\b([a-z][a-z0-9+.-]*://[^:/\s@]+:)[^@\s/]+@'), r'\1' + _TACHADO + '@'),
]


def tachar(texto: str | None) -> str:
    """Devuelve el texto con los secretos reemplazados por «oculto»."""
    if not texto:
        return texto or ''
    for patron, reemplazo in _PATRONES:
        texto = patron.sub(reemplazo, texto)
    return texto


def tachar_lineas(lineas: list[str]) -> list[str]:
    return [tachar(x) for x in lineas]
