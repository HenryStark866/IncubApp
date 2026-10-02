"""Panel IncubApp · herramientas de soporte.

Catálogo CERRADO de acciones: la pantalla solo puede pedir un id de esta lista, con
parámetros que se validan aquí (lista permitida o expresión regular) y se citan con
sistema.q() antes de entrar a bash. No hay forma de correr un comando cualquiera.
"""
from __future__ import annotations

import io
import json
import os
import re
import time
import urllib.request
import zipfile
from typing import Callable

from . import secretos, sistema, trabajos
from .sistema import registro
from .trabajos import TRABAJOS

SRV = sistema.SRV
SOBRAN = '^(studio|supavisor|imgproxy)$'      # igual que arranque.sh
RE_CONTENEDOR = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$')
RE_CORREO = re.compile(r'^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$')
_CONTEXTO: dict = {'monitor': None, 'monitor_red': None}


class ErrorAccion(ValueError):
    """Mensaje en español para la pantalla (HTTP 400)."""


def configurar(monitor=None, monitor_red=None) -> None:
    _CONTEXTO['monitor'] = monitor
    _CONTEXTO['monitor_red'] = monitor_red


def _sh(nombre: str) -> str:
    """Ruta de un script de servidor-local/ dentro de Ubuntu, ya citada."""
    return sistema.q(sistema.a_wsl(sistema.SERVIDOR_LOCAL / nombre))


# Espera a que la app y la API respondan (igual que responde() de arranque.sh).
ESPERAR_APP = r'''
echo "Esperando a que la app responda…"
for i in $(seq 1 60); do
  app=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1/ || true)
  api=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1/auth/v1/health || true)
  if [ "$app" = 200 ] && { [ "$api" = 200 ] || [ "$api" = 401 ]; }; then echo "LISTO: la app y la API responden."; exit 0; fi
  [ $((i % 3)) = 0 ] && echo "  … todavía no (app $app, API $api)"
  sleep 5
done
echo "La app todavía no responde tras 5 minutos; el vigilante seguirá intentando cada minuto."
exit 1
'''


# ── Validación ───────────────────────────────────────────────────────────────
def _contenedores() -> list[str]:
    def leer():
        r = sistema.wsl("docker ps -a --format '{{.Names}}'", timeout=30)
        return [x.strip() for x in r.salida.splitlines() if x.strip()] if r.ok else []
    return sistema.memo.obtener('acciones:contenedores', 30, leer)


def _contenedor(p: dict) -> str:
    nombre = str(p.get('contenedor') or '').strip()
    if not RE_CONTENEDOR.match(nombre):
        raise ErrorAccion('Elija un servicio de la lista.')
    if nombre not in _contenedores():
        sistema.memo.olvidar('acciones:contenedores')
        if nombre not in _contenedores():
            raise ErrorAccion(f'No existe el servicio «{nombre}».')
    return nombre


def _correo(p: dict) -> str:
    c = str(p.get('correo') or '').strip()
    if len(c) > 254 or not RE_CORREO.match(c):
        raise ErrorAccion('Escriba un correo válido (de una cuenta que exista en IncubApp).')
    return c


# ── Acciones de Windows (funciones) ──────────────────────────────────────────
def _app_responde() -> bool:
    try:
        with urllib.request.urlopen('http://127.0.0.1/', timeout=5) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001
        return False


def _arrancar(t: trabajos.Trabajo) -> dict:
    t.linea('Arrancando la tarea de Windows «IncubApp Servidor» (Ubuntu, Docker, Supabase, app y túnel)…')
    r = sistema.powershell("Start-ScheduledTask -TaskName 'IncubApp Servidor' -ErrorAction Stop; 'ok'", timeout=60)
    if r.ok:
        t.linea('Tarea iniciada.')
    else:
        t.linea(f'No se pudo iniciar la tarea ({secretos.tachar(r.texto)[:200]}).')
        t.linea('Se arranca Ubuntu directamente…')
        trabajos.proceso_en_vivo(t, ['wsl.exe', '-d', sistema.DISTRO, '-u', 'root', '--exec', 'systemctl', 'start',
                                     'docker', 'incubapp-arranque.service', 'incubapp-vigia.timer'], timeout=300)
    inicio = time.time()
    while time.time() - inicio < 360:
        t.revisar()
        if _app_responde():
            t.linea(f'LISTO: la app responde ({int(time.time() - inicio)} s).')
            return {'ok': True, 'segundos': int(time.time() - inicio)}
        t.avance(min(0.95, (time.time() - inicio) / 240), f'… esperando a que la app responda ({int(time.time() - inicio)} s)')
        time.sleep(10)
    raise RuntimeError('La app no respondió en 6 minutos. Revise «Revisar y levantar todo» o los registros del vigilante.')


def _reiniciar_wsl(t: trabajos.Trabajo) -> dict:
    t.linea('Apagando Ubuntu (wsl --shutdown)… la app deja de responder unos minutos.')
    r = sistema.ejecutar(['wsl.exe', '--shutdown'], timeout=120)
    t.linea(r.texto or 'Ubuntu apagado.')
    time.sleep(8)
    return _arrancar(t)


DESTINOS = {
    'app_local': ('La app en este equipo', lambda: 'http://127.0.0.1/'),
    'publico': ('La app desde internet', lambda: (_CONTEXTO['monitor'].ajustes.url_publica
                                                  if _CONTEXTO['monitor'] else sistema.URL_PUBLICA)),
    'studio': ('Studio de Supabase', lambda: 'http://127.0.0.1:8000/'),
    'n8n': ('n8n', lambda: 'http://127.0.0.1:5678/'),
    'carpeta_registros': ('Carpeta de registros', lambda: str(sistema.SERVIDOR_LOCAL / 'logs')),
    'carpeta_respaldos': ('Carpeta de respaldos', lambda: _carpeta_respaldos()),
    'carpeta_reportes': ('Carpeta de reportes', lambda: str(sistema.DATOS / 'reportes')),
    'tailscale': ('Descarga de Tailscale', lambda: 'https://tailscale.com/download/windows'),
    'manual': ('Manual del servidor (PDF)', lambda: _manual()),
}


def _manual() -> str:
    ruta = sistema.SERVIDOR_LOCAL / 'MANUAL-SERVIDOR-INCUBAPP.pdf'
    if not ruta.exists():
        raise RuntimeError('Todavía no está el manual (MANUAL-SERVIDOR-INCUBAPP.pdf).')
    return str(ruta)


def _carpeta_respaldos() -> str:
    r = sistema.wsl('cat /opt/incubapp/respaldo-destino', timeout=20)
    ruta = r.salida.strip()
    m = re.match(r'^/mnt/([a-z])/(.*)$', ruta)
    if not m:
        raise RuntimeError('No hay carpeta de respaldo configurada.')
    return f'{m.group(1).upper()}:\\' + m.group(2).replace('/', '\\')


def _abrir(t: trabajos.Trabajo, destino: str) -> dict:
    nombre, ruta = DESTINOS[destino]
    objetivo = ruta()
    if destino.startswith('carpeta_'):
        os.makedirs(objetivo, exist_ok=True)
    t.linea(f'Abriendo {nombre}: {objetivo}')
    os.startfile(objetivo)  # noqa: S606 — destino de una lista cerrada
    return {'abierto': objetivo}


# ── Reporte de soporte ───────────────────────────────────────────────────────
PROHIBIDOS = ('.env', 'tunel.env', 'usuarios-prueba.local', 'publico.env')


def _reporte(t: trabajos.Trabajo) -> dict:
    carpeta = sistema.DATOS / 'reportes'
    carpeta.mkdir(parents=True, exist_ok=True)
    archivo = carpeta / f"reporte-{time.strftime('%Y%m%d-%H%M%S')}.zip"
    mon = _CONTEXTO['monitor']

    def agregar(z: zipfile.ZipFile, nombre: str, texto: str) -> None:
        z.writestr(nombre, secretos.tachar(texto))

    with zipfile.ZipFile(archivo, 'w', zipfile.ZIP_DEFLATED) as z:
        t.avance(0.05, 'Estado actual…')
        if mon:
            agregar(z, 'estado.json', json.dumps(mon.instantanea(), ensure_ascii=False, indent=1, default=str))
            agregar(z, 'eventos.json', json.dumps(mon.eventos(1000), ensure_ascii=False, indent=1))
        else:
            p = sistema.DATOS / 'eventos.jsonl'
            if p.exists():
                agregar(z, 'eventos.jsonl', p.read_text(encoding='utf-8', errors='replace'))
        for nombre in ('seguridad.json', 'red-auditoria.json', 'ajustes.json', 'panel.txt'):
            p = sistema.DATOS / nombre
            if p.exists():
                agregar(z, nombre, p.read_text(encoding='utf-8', errors='replace')[-2_000_000:])
        t.avance(0.2, 'Docker y servicios de Ubuntu…')
        r = sistema.wsl('''
echo "== docker ps -a"; docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo; echo "== docker system df"; docker system df
echo; echo "== systemd"; systemctl status --no-pager -n 15 incubapp-arranque.service incubapp-vigia.timer incubapp-respaldo.timer docker 2>&1
echo; echo "== memoria"; free -m; df -h / /mnt/c
echo; echo "== versiones"; docker version --format '{{.Server.Version}}'; uname -a
''', timeout=90)
        agregar(z, 'servidor.txt', r.texto)
        g = sistema.ejecutar(['git', '-C', str(sistema.RAIZ), 'log', '-8', '--format=%h %ci %s'], timeout=20)
        s = sistema.ejecutar(['git', '-C', str(sistema.RAIZ), 'status', '--short'], timeout=20)
        agregar(z, 'git.txt', g.texto + '\n\n' + s.texto)
        fuentes = fuentes_registro()
        for i, f in enumerate(fuentes):
            t.revisar()
            t.avance(0.3 + 0.65 * i / max(1, len(fuentes)), f"Registro: {f['nombre']}")
            try:
                reg = leer_registro(f['id'], 400)
                agregar(z, f"registros/{f['id'].replace(':', '_')}.txt", '\n'.join(reg['lineas']))
            except Exception as e:  # noqa: BLE001
                agregar(z, f"registros/{f['id'].replace(':', '_')}.txt", f'No se pudo leer: {e}')
    # Se guardan los 10 más nuevos
    for viejo in sorted(carpeta.glob('reporte-*.zip'))[:-10]:
        try:
            viejo.unlink()
        except OSError:
            pass
    tam = archivo.stat().st_size
    t.linea(f'Listo: {archivo} ({sistema.tamano_legible(tam)}). Las claves y contraseñas salen tachadas.')
    return {'archivo': str(archivo), 'tamano': tam}


# ── Catálogo ─────────────────────────────────────────────────────────────────
def _wsl(id_, titulo, script, exclusivo=None, timeout=1800):
    return TRABAJOS.lanzar_wsl('accion', titulo, script, timeout=timeout, exclusivo=exclusivo)


def _accion(id_: str, titulo: str, descripcion: str, grupo: str, lanzar: Callable[[dict], trabajos.Trabajo],
            peligro: str = 'bajo', confirmar: str | None = None, admin: bool = False, parametros=None) -> dict:
    return {'id': id_, 'titulo': titulo, 'descripcion': descripcion, 'grupo': grupo, 'peligro': peligro,
            'confirmar': confirmar, 'admin': admin, 'parametros': parametros or [], '_lanzar': lanzar}


P_CONTENEDOR = [{'nombre': 'contenedor', 'etiqueta': 'Servicio', 'tipo': 'contenedor', 'requerido': True}]

ACCIONES = [
    _accion('revisar_todo', 'Revisar y levantar todo',
            'Hace lo mismo que el vigilante de cada minuto: si algo no responde, lo vuelve a levantar.', 'Servidor',
            lambda p: _wsl('revisar_todo', 'Revisar y levantar todo', f'bash {_sh("arranque.sh")} --vigia; tail -n 15 /var/log/incubapp-arranque.log', 'servidor', 900)),
    _accion('arranque_completo', 'Arranque completo',
            'Levanta Docker, Supabase, la app, el túnel, el lector y el asistente, y espera a que la app responda (hasta 5 min).', 'Servidor',
            lambda p: _wsl('arranque_completo', 'Arranque completo', f'bash {_sh("arranque.sh")}; tail -n 20 /var/log/incubapp-arranque.log', 'servidor', 1200),
            'medio'),
    _accion('arrancar_servidor', 'Arrancar el servidor',
            'Enciende Ubuntu con la tarea «IncubApp Servidor» y espera a que la app responda. Úselo si Ubuntu está detenido.',
            'Servidor', lambda p: TRABAJOS.lanzar('accion', 'Arrancar el servidor', _arrancar, exclusivo='servidor')),
    _accion('reiniciar_wsl', 'Reiniciar Ubuntu (todo el servidor)',
            'Apaga Ubuntu por completo y lo vuelve a encender con todo. Último recurso si nada más funciona.', 'Servidor',
            lambda p: TRABAJOS.lanzar('accion', 'Reiniciar Ubuntu', _reiniciar_wsl, exclusivo='servidor'), 'alto',
            'Toda la app (y la base de datos) se cae de 1 a 3 minutos para todos los usuarios. ¿Reiniciar Ubuntu ahora?'),
    _accion('reiniciar_contenedor', 'Reiniciar un servicio', 'Reinicia un contenedor (por ejemplo, si quedó «unhealthy»).',
            'Servicios', lambda p: (lambda n: _wsl('reiniciar_contenedor', f'Reiniciar {n}',
                                                   f'docker restart {sistema.q(n)} && echo "Reiniciado: {n}"; sleep 3; docker ps -a --filter name=^/{n}$ --format "{{{{.Names}}}}: {{{{.Status}}}}"'))(_contenedor(p)),
            'medio', 'El servicio deja de responder unos segundos mientras se reinicia.', parametros=P_CONTENEDOR),
    _accion('detener_contenedor', 'Detener un servicio', 'Detiene un contenedor. El vigilante vuelve a levantar los necesarios.',
            'Servicios', lambda p: (lambda n: _wsl('detener_contenedor', f'Detener {n}', f'docker stop {sistema.q(n)} && echo "Detenido: {n}"'))(_contenedor(p)),
            'medio', 'El servicio deja de funcionar hasta que se vuelva a encender (o lo levante el vigilante).', parametros=P_CONTENEDOR),
    _accion('encender_contenedor', 'Encender un servicio', 'Enciende un contenedor detenido.',
            'Servicios', lambda p: (lambda n: _wsl('encender_contenedor', f'Encender {n}', f'docker start {sistema.q(n)} && echo "Encendido: {n}"'))(_contenedor(p)),
            parametros=P_CONTENEDOR),
    _accion('reiniciar_app', 'Reiniciar la app', 'Reinicia el contenedor de la app (nginx). No toca la base de datos.', 'Servicios',
            lambda p: _wsl('reiniciar_app', 'Reiniciar la app', 'docker restart incubapp-incubapp-1\n' + ESPERAR_APP, 'servidor', 600),
            'medio', 'La app deja de abrir unos segundos para todos. ¿Reiniciarla?'),
    _accion('reiniciar_supabase', 'Reiniciar Supabase', 'Reinicia todos los servicios de Supabase (sin studio, supavisor ni imgproxy) y espera a que respondan.',
            'Servicios', lambda p: _wsl('reiniciar_supabase', 'Reiniciar Supabase',
                                        f"cd {SRV} || exit 1\nservicios=$(docker compose config --services | grep -Ev '{SOBRAN}' | tr '\\n' ' ')\n"
                                        'echo "Reiniciando: $servicios"\n# shellcheck disable=SC2086\ndocker compose restart $servicios\n' + ESPERAR_APP,
                                        'servidor', 900),
            'alto', 'La app, las cuentas y la base de datos se caen 1 a 2 minutos para todos. ¿Reiniciar Supabase?'),
    _accion('recrear_tunel', 'Recrear el túnel de Cloudflare', 'Vuelve a crear la conexión con Cloudflare (si desde internet sale 502 o error 1033).',
            'Servicios', lambda p: _wsl('recrear_tunel', 'Recrear el túnel', f'bash {_sh("arranque.sh")} --tunel; tail -n 3 /var/log/incubapp-arranque.log', 'tunel', 300),
            'medio', 'Desde internet la app no abre durante unos 10-30 segundos.'),
    _accion('studio_encender', 'Encender Studio', 'Enciende Studio de Supabase (administrar la base de datos en http://127.0.0.1:8000/). Gasta ~250 MB.',
            'Servicios', lambda p: _wsl('studio_encender', 'Encender Studio', f'cd {SRV} && docker compose start studio && echo "Studio encendido: http://127.0.0.1:8000/"')),
    _accion('studio_apagar', 'Apagar Studio', 'Apaga Studio de Supabase (no hace falta en producción).',
            'Servicios', lambda p: _wsl('studio_apagar', 'Apagar Studio', f'cd {SRV} && docker compose stop studio && echo "Studio apagado."')),
    _accion('respaldo_ahora', 'Hacer un respaldo ahora', 'Copia la base de datos y las fotos a la carpeta de OneDrive (lo mismo que el respaldo de las 2:00 a. m.). Puede tardar varios minutos.',
            'Mantenimiento', lambda p: _wsl('respaldo_ahora', 'Respaldo ahora', _script_respaldo(), 'respaldo', 3600), 'bajo',
            'El respaldo usa disco y procesador durante unos minutos. ¿Hacerlo ahora?'),
    _accion('actualizar_app', 'Actualizar la app', 'Trae la última versión de GitHub, reconstruye la app y aplica los cambios de la base de datos (7-ACTUALIZAR-APP).',
            'Mantenimiento', lambda p: TRABAJOS.lanzar_proceso('accion', 'Actualizar la app', [
                'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
                "[Console]::OutputEncoding=[Text.Encoding]::UTF8; & '" + str(sistema.SERVIDOR_LOCAL / '7-actualizar-app.ps1').replace("'", "''") + "'"],
                timeout=2400, exclusivo='servidor'),
            'medio', 'Se reconstruye la app (2 a 5 minutos de trabajo; la app sigue en línea hasta el cambio). ¿Actualizar ahora?'),
    _accion('probar_correo', 'Probar el correo', 'Manda un correo real de «recuperar contraseña» a una cuenta de IncubApp y muestra qué respondió el servidor de correo.',
            'Mantenimiento', lambda p: (lambda c: _wsl('probar_correo', f'Probar correo a {c}', f'bash {_sh("correo.sh")} --probar {sistema.q(c)}', 'correo', 600))(_correo(p)),
            parametros=[{'nombre': 'correo', 'etiqueta': 'Correo de una cuenta existente', 'tipo': 'correo', 'requerido': True}]),
    _accion('limpiar_docker', 'Liberar espacio de Docker', 'Borra imágenes viejas sin usar y la caché de compilación de más de 7 días. No toca datos, fotos ni contenedores.',
            'Mantenimiento', lambda p: _wsl('limpiar_docker', 'Liberar espacio de Docker',
                                            'echo "== Antes"; docker system df\ndocker image prune -f\ndocker builder prune -f --filter until=168h\necho; echo "== Después"; docker system df',
                                            'docker', 900), 'medio', 'Se borran imágenes de Docker que no se están usando. ¿Continuar?'),
    _accion('reporte_soporte', 'Reporte de soporte', 'Arma un ZIP con el estado, los eventos, la auditoría y los registros recientes (con las claves tachadas) para mandarlo a soporte.',
            'Diagnóstico', lambda p: TRABAJOS.lanzar('reporte', 'Reporte de soporte', _reporte, exclusivo='reporte')),
    _accion('estado_docker', 'Estado de Docker', 'Muestra el espacio que usa Docker y un resumen del motor (solo lectura).', 'Diagnóstico',
            lambda p: _wsl('estado_docker', 'Estado de Docker',
                           "docker system df; echo; docker info --format 'Contenedores: {{.Containers}} (en marcha {{.ContainersRunning}}, detenidos {{.ContainersStopped}})\nImágenes: {{.Images}}\nVersión: {{.ServerVersion}}\nMemoria de Ubuntu: {{.MemTotal}} bytes\nCPUs: {{.NCPU}}'",
                           None, 120)),
    _accion('diagnostico_red_wsl', 'Diagnóstico de red de Ubuntu', 'Revisa DNS, salida a internet y procesos colgados dentro de Ubuntu (solo lectura).', 'Diagnóstico',
            lambda p: _wsl('diagnostico_red_wsl', 'Diagnóstico de red de Ubuntu', f'bash {_sh("diag-red.sh")}', None, 300)),
    _accion('abrir', 'Abrir', 'Abre la app, Studio, n8n o una carpeta del servidor.', 'Abrir',
            lambda p: (lambda d: TRABAJOS.lanzar('abrir', f'Abrir {DESTINOS[d][0]}', _abrir, d))(_destino(p)),
            parametros=[{'nombre': 'destino', 'etiqueta': 'Qué abrir', 'tipo': 'opcion', 'opciones': list(DESTINOS), 'requerido': True}]),
]
POR_ID = {a['id']: a for a in ACCIONES}


def _destino(p: dict) -> str:
    d = str(p.get('destino') or '')
    if d not in DESTINOS:
        raise ErrorAccion('Ese destino no existe.')
    return d


def _script_respaldo() -> str:
    log = sistema.q(sistema.a_wsl(sistema.SERVIDOR_LOCAL / 'logs' / 'respaldo.txt'))
    ultimo = sistema.q(sistema.a_wsl(sistema.SERVIDOR_LOCAL / 'logs' / 'ultimo-respaldo.txt'))
    # respaldar.sh escribe su salida en logs/respaldo.txt: se va mostrando lo nuevo de ese archivo.
    return f'''LOG={log}
n=$(wc -l < "$LOG" 2>/dev/null || echo 0)
echo "Respaldando (base de datos y fotos)…"
bash {_sh("respaldar.sh")} & pid=$!
mostrar() {{ total=$(wc -l < "$LOG" 2>/dev/null || echo 0); if [ "$total" -gt "$n" ]; then sed -n "$((n+1)),${{total}}p" "$LOG"; n=$total; fi; }}
while kill -0 $pid 2>/dev/null; do sleep 3; mostrar; done
mostrar
wait $pid; codigo=$?
echo "Resultado: $(tr '\\n' ' ' < {ultimo})"
exit $codigo
'''


def catalogo() -> list[dict]:
    return [{k: v for k, v in a.items() if not k.startswith('_')} for a in ACCIONES]


def ejecutar(id_: str, parametros: dict) -> trabajos.Trabajo:
    a = POR_ID.get(id_)
    if not a:
        raise ErrorAccion('Esa acción no existe.')
    if not isinstance(parametros, dict):
        raise ErrorAccion('Los parámetros no son válidos.')
    registro.info('Acción %s %s', id_, {k: v for k, v in parametros.items() if k != 'correo'})
    t = a['_lanzar'](parametros)
    return t


# ── Registros ────────────────────────────────────────────────────────────────
ARCHIVOS = {
    'vigilante': ('Vigilante y arranque (Ubuntu)', 'Servidor', 'ubuntu', '/var/log/incubapp-arranque.log'),
    'respaldo': ('Respaldos', 'Mantenimiento', 'windows', sistema.SERVIDOR_LOCAL / 'logs' / 'respaldo.txt'),
    'panel': ('Panel IncubApp', 'Panel', 'windows', sistema.DATOS / 'panel.txt'),
    'actualizar': ('Actualizaciones de la app', 'Mantenimiento', 'windows', sistema.SERVIDOR_LOCAL / 'logs' / '7-actualizar.txt'),
    'correo': ('Configuración de correo', 'Mantenimiento', 'windows', sistema.SERVIDOR_LOCAL / 'logs' / '8-correo.txt'),
    'arranque_windows': ('Arranque automático (Windows)', 'Servidor', 'windows', sistema.SERVIDOR_LOCAL / 'logs' / '9-arranque.txt'),
}


def fuentes_registro() -> list[dict]:
    fuentes = [{'id': k, 'nombre': v[0], 'grupo': v[1]} for k, v in ARCHIVOS.items()]
    for n in sorted(_contenedores()):
        grupo = 'Supabase' if n.startswith(('supabase-', 'realtime')) else 'Servicios IncubApp'
        fuentes.append({'id': f'contenedor:{n}', 'nombre': n, 'grupo': grupo})
    return fuentes


def _cola_archivo(ruta, lineas: int) -> list[str]:
    try:
        with open(ruta, 'rb') as f:
            f.seek(0, 2)
            tam = f.tell()
            f.seek(max(0, tam - lineas * 400))
            return f.read().decode('utf-8', 'replace').splitlines()[-lineas:]
    except OSError as e:
        return [f'(No se pudo leer {ruta}: {e.strerror})']


def leer_registro(fuente: str, lineas: int = 300, filtro: str | None = None) -> dict:
    lineas = max(10, min(int(lineas or 300), 2000))
    fuente = str(fuente or '')
    if fuente.startswith('contenedor:'):
        nombre = _contenedor({'contenedor': fuente.split(':', 1)[1]})
        r = sistema.wsl(f'docker logs --tail {lineas} --timestamps {sistema.q(nombre)} 2>&1', timeout=40)
        salida = r.salida.splitlines() if r.salida else [r.texto or '(sin registro)']
        nombre_vis = nombre
    elif fuente in ARCHIVOS:
        nombre_vis, _, lado, ruta = ARCHIVOS[fuente]
        if lado == 'ubuntu':
            r = sistema.wsl(f'tail -n {lineas} {sistema.q(ruta)} 2>&1', timeout=30)
            salida = r.salida.splitlines()
        else:
            salida = _cola_archivo(ruta, lineas)
    else:
        raise ErrorAccion('Esa fuente de registro no existe.')
    if filtro:
        f = str(filtro).lower()[:200]
        salida = [x for x in salida if f in x.lower()]
    return {'fuente': fuente, 'nombre': nombre_vis, 'generado': sistema.ahora_iso(),
            'lineas': secretos.tachar_lineas(salida[-lineas:])}


_ = io  # (zipfile escribe directo al archivo)
