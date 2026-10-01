"""Panel IncubApp — servidor local de la interfaz gráfica del servidor.

  pythonw panel.py              abre el panel (arranca el servidor si no está corriendo)
  pythonw panel.py --inicio     lo usa el acceso directo de la carpeta Inicio de Windows
  pythonw panel.py --sin-ventana  solo el servidor (vigila y avisa, sin abrir ventana)
  pythonw panel.py --puerto N

Escucha SOLO en 127.0.0.1. La ventana es Edge en modo aplicación. Cerrar la ventana no
apaga el panel: sigue vigilando y avisando; el acceso directo vuelve a abrirla.
Ver DISENO.md para las rutas y el contrato con cada módulo.
"""
from __future__ import annotations

import argparse
import hmac
import json
import mimetypes
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

# Con pythonw no hay consola: sys.stdout/stderr son None y el primer print o traceback
# tumbaría el proceso. Se mandan al vacío (los errores van al registro del panel).
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w', encoding='utf-8')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w', encoding='utf-8')

from nucleo import sistema, trabajos  # noqa: E402
from nucleo.sistema import registro  # noqa: E402
from nucleo.trabajos import TRABAJOS  # noqa: E402

PUERTO = 8770
SESION = sistema.PRIVADO / 'sesion.json'
COOKIE = 'panel'
MAX_CUERPO = 64 * 1024
IMPORTANTES = {'app', 'api', 'base', 'publico', 'tunel', 'wsl', 'docker', 'respaldo'}

# ── Módulos (protegidos: si uno no carga, el resto del panel sigue) ──────────
MODULOS: dict[str, object] = {}
ERRORES: dict[str, str] = {}
for _nombre in ('estado', 'acciones', 'seguridad', 'red'):
    try:
        MODULOS[_nombre] = __import__(f'nucleo.{_nombre}', fromlist=[_nombre])
    except Exception as _e:  # noqa: BLE001
        ERRORES[_nombre] = f'{type(_e).__name__}: {_e}'
        registro.exception('El módulo %s no cargó', _nombre)


class ErrorHttp(Exception):
    def __init__(self, codigo: int, mensaje: str) -> None:
        super().__init__(mensaje)
        self.codigo = codigo
        self.mensaje = mensaje


def modulo(nombre: str):
    m = MODULOS.get(nombre)
    if m is None:
        raise ErrorHttp(503, f'La parte «{nombre}» del panel no cargó: {ERRORES.get(nombre, "no disponible")}')
    return m


# ── Estado del proceso ───────────────────────────────────────────────────────
class Panel:
    def __init__(self, puerto: int) -> None:
        self.puerto = puerto
        self.llave = secrets.token_urlsafe(32)
        self.ajustes = sistema.Ajustes.cargar()
        self.monitor = None
        self.monitor_red = None
        self.servidor: ThreadingHTTPServer | None = None
        self.detenido = threading.Event()
        self._avisos: dict[str, float] = {}
        self._alertas_vistas: set[str] = set()

    # ── arranque ──
    def iniciar_modulos(self) -> None:
        if 'estado' in MODULOS:
            try:
                self.monitor = MODULOS['estado'].Monitor(self.ajustes)
                self.monitor.al_cambiar.append(self._al_cambiar)
                self.monitor.iniciar()
            except Exception as e:  # noqa: BLE001
                ERRORES['estado'] = str(e)
                MODULOS.pop('estado', None)
                registro.exception('El monitor no arrancó')
        if 'red' in MODULOS:
            try:
                self.monitor_red = MODULOS['red'].MonitorRed(self.ajustes)
                self.monitor_red.iniciar()
            except Exception as e:  # noqa: BLE001
                ERRORES['red'] = str(e)
                registro.exception('El monitor de red no arrancó')
        if 'acciones' in MODULOS:
            try:
                MODULOS['acciones'].configurar(monitor=self.monitor, monitor_red=self.monitor_red)
            except Exception:  # noqa: BLE001
                registro.exception('acciones.configurar falló')
        TRABAJOS.al_terminar.append(self._al_terminar_trabajo)
        sistema.hilo(self._periodico, nombre='periodico')

    def apagar(self) -> None:
        if self.detenido.is_set():
            return
        self.detenido.set()
        registro.info('Panel: apagando')
        for m in (self.monitor, self.monitor_red):
            try:
                m and m.detener()
            except Exception:  # noqa: BLE001
                registro.exception('Al detener un monitor')
        try:
            datos = sistema.leer_json(SESION, {}) or {}
            if datos.get('pid') == os.getpid():
                SESION.unlink(missing_ok=True)
        except OSError:
            pass
        if self.servidor:
            threading.Thread(target=self.servidor.shutdown, daemon=True).start()

    # ── tareas periódicas: auditoría, escaneo de red, alertas de red ──
    def _periodico(self) -> None:
        inicio = time.time()
        ultima_aud = inicio - max(0, self.ajustes.auditoria_min * 60 - 180)       # primera a los 3 min
        ultimo_esc = inicio - max(0, self.ajustes.escaneo_red_min * 60 - 60)      # primero al minuto
        while not self.detenido.wait(30):
            ahora = time.time()
            try:
                a = self.ajustes
                if a.auditoria_min > 0 and ahora - ultima_aud >= a.auditoria_min * 60 and 'seguridad' in MODULOS:
                    ultima_aud = ahora
                    TRABAJOS.lanzar('auditoria', 'Auditoría de seguridad (automática)',
                                    MODULOS['seguridad'].auditar, exclusivo='auditoria')
                if a.escaneo_red_min > 0 and ahora - ultimo_esc >= a.escaneo_red_min * 60 and 'red' in MODULOS:
                    ultimo_esc = ahora
                    TRABAJOS.lanzar('escaneo_red', 'Búsqueda de equipos en la red (automática)',
                                    MODULOS['red'].escanear_red, exclusivo='escaneo_red')
                if self.monitor_red:
                    for al in (self.monitor_red.resumen() or {}).get('alertas') or []:
                        clave = f"{al.get('id')}|{al.get('evidencia')}"
                        if clave not in self._alertas_vistas and al.get('nivel') in ('critico', 'alto'):
                            self._alertas_vistas.add(clave)
                            self.avisar('red:' + str(al.get('id')), 'Alerta de red', al.get('titulo') or '')
            except Exception:  # noqa: BLE001
                registro.exception('Tarea periódica falló')

    # ── avisos de Windows ──
    def avisar(self, clave: str, titulo: str, texto: str) -> None:
        if not self.ajustes.notificaciones:
            return
        ahora = time.time()
        if ahora - self._avisos.get(clave, 0) < 600:
            return
        self._avisos[clave] = ahora
        sistema.hilo(mostrar_aviso, titulo, texto, nombre='aviso')

    def _al_cambiar(self, ev: dict) -> None:
        if ev.get('componente') not in IMPORTANTES:
            return
        if ev.get('nivel') == 'falla':
            self.avisar(ev['componente'], f"IncubApp: falla en {ev.get('nombre')}", ev.get('mensaje') or '')
        elif ev.get('antes') == 'falla' and ev.get('nivel') in ('ok', 'aviso'):
            self._avisos.pop(ev['componente'], None)
            self.avisar(ev['componente'] + ':ok', f"IncubApp: {ev.get('nombre')} se recuperó", ev.get('mensaje') or '')

    def _al_terminar_trabajo(self, t: trabajos.Trabajo) -> None:
        r = t.resultado if isinstance(t.resultado, dict) else {}
        if t.tipo == 'escaneo_red' and r.get('nuevos'):
            nombres = ', '.join(f"{d.get('ip')} ({d.get('fabricante') or 'desconocido'})" for d in r['nuevos'][:3])
            self.avisar('red:nuevos', f"{len(r['nuevos'])} equipo(s) nuevo(s) en la red", nombres)
        elif t.tipo in ('auditoria', 'auditoria_red') and r.get('hallazgos'):
            graves = {h.get('id') for h in r['hallazgos'] if h.get('nivel') in ('critico', 'alto')}
            ruta = 'seguridad-avisados.json' if t.tipo == 'auditoria' else 'red-avisados.json'
            vistos = set(sistema.leer_json(sistema.DATOS / ruta, []) or [])
            nuevos = graves - vistos
            sistema.guardar_json(sistema.DATOS / ruta, sorted(graves))
            if nuevos:
                titulos = [h.get('titulo') for h in r['hallazgos'] if h.get('id') in nuevos]
                self.avisar(t.tipo, f'Seguridad: {len(nuevos)} hallazgo(s) importante(s)', '; '.join(titulos[:2]))
        elif t.tipo == 'accion' and t.estado == 'error' and 'respaldo' in t.titulo.lower():
            self.avisar('respaldo', 'IncubApp: el respaldo falló', t.error or '')


def mostrar_aviso(titulo: str, texto: str) -> None:
    """Aviso de Windows (toast) con PowerShell. Sin módulos extra."""
    def xml(s: str) -> str:
        return (str(s)[:250].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                .replace('"', '&quot;').replace("'", '&apos;'))
    cuerpo = (f'<toast><visual><binding template="ToastGeneric"><text>{xml(titulo)}</text>'
              f'<text>{xml(texto)}</text></binding></visual></toast>').replace("'", "''")
    script = (
        "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null;"
        "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null;"
        "$x = New-Object Windows.Data.Xml.Dom.XmlDocument;"
        f"$x.LoadXml('{cuerpo}');"
        "$t = [Windows.UI.Notifications.ToastNotification]::new($x);"
        "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("
        "'{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show($t)"
    )
    r = sistema.powershell(script, timeout=60)
    if not r.ok:
        registro.warning('No se pudo mostrar el aviso: %s', r.texto[:300])


PANEL: Panel | None = None


# ── Rutas ────────────────────────────────────────────────────────────────────
def _entero(q: dict, clave: str, defecto: float, minimo: float, maximo: float) -> float:
    try:
        v = float(q.get(clave, [defecto])[0])
    except (TypeError, ValueError):
        v = defecto
    return max(minimo, min(maximo, v))


def _texto(cuerpo: dict, clave: str, maximo: int = 300) -> str | None:
    v = cuerpo.get(clave)
    if v is None:
        return None
    if not isinstance(v, (str, int, float)):
        raise ErrorHttp(400, f'El campo «{clave}» no es válido.')
    return str(v).strip()[:maximo]


def r_ping(p, q, c):
    return {'app': 'incubapp-panel', 'version': sistema.VERSION, 'pid': os.getpid()}


def r_estado(p, q, c):
    if not PANEL.monitor:
        modulo('estado')
    return PANEL.monitor.instantanea()


def r_estado_actualizar(p, q, c):
    modulo('estado')
    PANEL.monitor.actualizar_ya()
    return {'ok': True}


def r_metricas(p, q, c):
    modulo('estado')
    return PANEL.monitor.metricas(_entero(q, 'horas', 24, 0.1, 168))


def r_eventos(p, q, c):
    modulo('estado')
    return {'eventos': PANEL.monitor.eventos(int(_entero(q, 'limite', 200, 1, 5000)))}


def r_acciones(p, q, c):
    return {'acciones': modulo('acciones').catalogo()}


def r_accion(p, q, c, id_):
    acc = modulo('acciones')
    parametros = c.get('parametros') or {}
    if not isinstance(parametros, dict):
        raise ErrorHttp(400, 'Los parámetros no son válidos.')
    try:
        t = acc.ejecutar(id_, parametros)
    except acc.ErrorAccion as e:
        raise ErrorHttp(400, str(e)) from e
    return {'trabajo': t.como_dict()}


def r_trabajos(p, q, c):
    return {'trabajos': TRABAJOS.lista()}


def r_trabajo(p, q, c, id_):
    t = TRABAJOS.obtener(id_)
    if not t:
        raise ErrorHttp(404, 'Ese trabajo ya no existe (el panel se reinició o es muy viejo).')
    return t.como_dict(int(_entero(q, 'desde', 0, 0, 10**9)))


def r_trabajo_cancelar(p, q, c, id_):
    return {'ok': TRABAJOS.cancelar(id_)}


def r_fuentes(p, q, c):
    return {'fuentes': modulo('acciones').fuentes_registro()}


def r_registros(p, q, c):
    acc = modulo('acciones')
    fuente = (q.get('fuente') or [''])[0]
    filtro = (q.get('filtro') or [None])[0]
    try:
        return acc.leer_registro(fuente, int(_entero(q, 'lineas', 300, 10, 2000)), filtro)
    except acc.ErrorAccion as e:
        raise ErrorHttp(400, str(e)) from e


def _ultimo(tipo: str):
    t = TRABAJOS.ultimo(tipo)
    return t.como_dict(con_lineas=False) if t else None


def r_seguridad(p, q, c):
    s = modulo('seguridad')
    return {'auditoria': s.ultima_auditoria(), 'arreglos': s.arreglos(), 'trabajo': _ultimo('auditoria')}


def r_auditar(p, q, c):
    s = modulo('seguridad')
    return {'trabajo': TRABAJOS.lanzar('auditoria', 'Auditoría de seguridad', s.auditar, exclusivo='auditoria').como_dict()}


def r_arreglar(p, q, c):
    s = modulo('seguridad')
    id_ = _texto(c, 'id', 60) or ''
    if id_ not in {a['id'] for a in s.arreglos()}:
        raise ErrorHttp(400, 'Ese arreglo no existe.')
    titulo = next(a['titulo'] for a in s.arreglos() if a['id'] == id_)
    return {'trabajo': TRABAJOS.lanzar('arreglo', f'Arreglo: {titulo}', s.aplicar_arreglo, id_, exclusivo='arreglo').como_dict()}


def r_puertos(p, q, c):
    return {'puertos': modulo('seguridad').puertos_escuchando()}


def r_conexiones(p, q, c):
    return {'conexiones': modulo('seguridad').conexiones_activas()}


def r_accesos(p, q, c):
    return modulo('seguridad').accesos_app(int(_entero(q, 'horas', 24, 1, 24 * 31)))


def r_red(p, q, c):
    modulo('red')
    if not PANEL.monitor_red:
        raise ErrorHttp(503, 'El monitor de red no está corriendo.')
    return PANEL.monitor_red.resumen()


def r_red_calidad(p, q, c):
    modulo('red')
    if not PANEL.monitor_red:
        raise ErrorHttp(503, 'El monitor de red no está corriendo.')
    return PANEL.monitor_red.calidad(_entero(q, 'horas', 24, 0.1, 168))


def r_dispositivos(p, q, c):
    return {'dispositivos': modulo('red').inventario()}


def _valor(f):
    try:
        return f()
    except ValueError as e:
        raise ErrorHttp(400, str(e)) from e


def r_dispositivo(p, q, c):
    red = modulo('red')
    conocido = c.get('conocido')
    return _valor(lambda: red.actualizar_dispositivo(_texto(c, 'mac', 40) or '', nombre=_texto(c, 'nombre', 80),
                                                     notas=_texto(c, 'notas', 500),
                                                     conocido=None if conocido is None else bool(conocido)))


def r_olvidar(p, q, c):
    red = modulo('red')
    return {'ok': _valor(lambda: red.olvidar_dispositivo(_texto(c, 'mac', 40) or ''))}


def r_escanear(p, q, c):
    red = modulo('red')
    rango = _texto(c, 'red', 40) or None
    if rango:
        _valor(lambda: red.validar_red(rango)) if hasattr(red, 'validar_red') else None
    return {'trabajo': TRABAJOS.lanzar('escaneo_red', 'Búsqueda de equipos en la red', red.escanear_red, rango,
                                       exclusivo='escaneo_red').como_dict()}


def r_red_puertos(p, q, c):
    red = modulo('red')
    host = _texto(c, 'host', 253) or ''
    perfil = _texto(c, 'perfil', 20) or 'comun'
    if hasattr(red, 'validar_host'):
        _valor(lambda: red.validar_host(host))
    return {'trabajo': TRABAJOS.lanzar('puertos', f'Puertos de {host}', red.escanear_puertos, host, perfil).como_dict()}


def r_herramienta(p, q, c):
    red = modulo('red')
    tipo = _texto(c, 'tipo', 20) or ''
    params = {k: v for k, v in c.items() if k != 'tipo' and isinstance(v, (str, int, float, bool))}
    if hasattr(red, 'validar_herramienta'):
        _valor(lambda: red.validar_herramienta(tipo, params))
    return {'trabajo': TRABAJOS.lanzar('herramienta', f'Herramienta: {tipo}', red.herramienta, tipo, params).como_dict()}


def r_red_auditoria(p, q, c):
    return {'auditoria': modulo('red').ultima_auditoria_red(), 'trabajo': _ultimo('auditoria_red')}


def r_red_auditar(p, q, c):
    red = modulo('red')
    return {'trabajo': TRABAJOS.lanzar('auditoria_red', 'Auditoría de la red', red.auditar_red,
                                       exclusivo='auditoria_red').como_dict()}


def r_fabricantes(p, q, c):
    red = modulo('red')
    return {'trabajo': TRABAJOS.lanzar('fabricantes', 'Base de fabricantes', red.actualizar_fabricantes,
                                       exclusivo='fabricantes').como_dict()}


def r_ajustes(p, q, c):
    return {**PANEL.ajustes.como_dict(), 'puerto': PANEL.puerto, 'version': sistema.VERSION,
            'datos': str(sistema.DATOS), 'errores_modulos': ERRORES}


def r_ajustes_guardar(p, q, c):
    cambios = c.get('ajustes', c)
    if not isinstance(cambios, dict):
        raise ErrorHttp(400, 'Los ajustes no son válidos.')
    cambiadas = PANEL.ajustes.actualizar(cambios)
    return {'ajustes': PANEL.ajustes.como_dict(), 'cambiadas': cambiadas}


def r_salir(p, q, c):
    threading.Timer(0.5, PANEL.apagar).start()
    return {'ok': True}


ID = r'([A-Za-z0-9_-]{1,40})'
RUTAS = [
    ('GET', r'/api/ping', r_ping),
    ('GET', r'/api/estado', r_estado),
    ('POST', r'/api/estado/actualizar', r_estado_actualizar),
    ('GET', r'/api/metricas', r_metricas),
    ('GET', r'/api/eventos', r_eventos),
    ('GET', r'/api/acciones', r_acciones),
    ('POST', r'/api/acciones/' + ID, r_accion),
    ('GET', r'/api/trabajos', r_trabajos),
    ('GET', r'/api/trabajos/' + ID, r_trabajo),
    ('POST', r'/api/trabajos/' + ID + r'/cancelar', r_trabajo_cancelar),
    ('GET', r'/api/registros/fuentes', r_fuentes),
    ('GET', r'/api/registros', r_registros),
    ('GET', r'/api/seguridad', r_seguridad),
    ('POST', r'/api/seguridad/auditar', r_auditar),
    ('POST', r'/api/seguridad/arreglar', r_arreglar),
    ('GET', r'/api/seguridad/puertos', r_puertos),
    ('GET', r'/api/seguridad/conexiones', r_conexiones),
    ('GET', r'/api/seguridad/accesos', r_accesos),
    ('GET', r'/api/red', r_red),
    ('GET', r'/api/red/calidad', r_red_calidad),
    ('GET', r'/api/red/dispositivos', r_dispositivos),
    ('POST', r'/api/red/dispositivos', r_dispositivo),
    ('POST', r'/api/red/dispositivos/olvidar', r_olvidar),
    ('POST', r'/api/red/escanear', r_escanear),
    ('POST', r'/api/red/puertos', r_red_puertos),
    ('POST', r'/api/red/herramienta', r_herramienta),
    ('GET', r'/api/red/auditoria', r_red_auditoria),
    ('POST', r'/api/red/auditar', r_red_auditar),
    ('POST', r'/api/red/fabricantes', r_fabricantes),
    ('GET', r'/api/ajustes', r_ajustes),
    ('POST', r'/api/ajustes', r_ajustes_guardar),
    ('POST', r'/api/salir', r_salir),
]
RUTAS = [(m, re.compile(patron + r'$'), f) for m, patron, f in RUTAS]

TIPOS = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
         '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.json': 'application/json',
         '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'}

PAGINA_SIN_SESION = """<!doctype html><html lang="es"><meta charset="utf-8"><title>Panel IncubApp</title>
<style>body{font-family:'Segoe UI',sans-serif;background:#0b1428;color:#f4f7fb;display:grid;place-items:center;height:100vh;margin:0}
div{max-width:520px;text-align:center;padding:2rem;border:1px solid #2a3e5d;border-radius:12px;background:#111e35}
b{color:#f08a22}</style><div><h1>Panel IncubApp</h1><p>Esta ventana no tiene una sesión válida.</p>
<p>Abra el panel desde el acceso directo <b>«Panel IncubApp»</b> del escritorio.</p></div></html>"""


class Manejador(BaseHTTPRequestHandler):
    server_version = 'PanelIncubApp'
    sys_version = ''
    protocol_version = 'HTTP/1.1'

    def log_message(self, formato, *args):  # al registro, no a stderr (pythonw no tiene)
        if args and str(args[1] if len(args) > 1 else '').startswith(('4', '5')):
            registro.info('HTTP %s', formato % args)

    # ── utilidades ──
    def _cabeceras_seguridad(self) -> None:
        self.send_header('Content-Security-Policy',
                         "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
                         "frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')

    def _enviar(self, codigo: int, cuerpo: bytes, tipo: str, extra: dict | None = None) -> None:
        self.send_response(codigo)
        self.send_header('Content-Type', tipo)
        self.send_header('Content-Length', str(len(cuerpo)))
        self._cabeceras_seguridad()
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(cuerpo)

    def _json(self, codigo: int, datos) -> None:
        cuerpo = json.dumps(datos, ensure_ascii=False, default=str).encode('utf-8')
        self._enviar(codigo, cuerpo, 'application/json; charset=utf-8', {'Cache-Control': 'no-store'})

    def _host_valido(self) -> bool:
        host = (self.headers.get('Host') or '').lower()
        return host in (f'127.0.0.1:{PANEL.puerto}', f'localhost:{PANEL.puerto}')

    def _con_sesion(self) -> bool:
        galletas = self.headers.get('Cookie') or ''
        for parte in galletas.split(';'):
            k, _, v = parte.strip().partition('=')
            if k == COOKIE and hmac.compare_digest(v.encode(), PANEL.llave.encode()):
                return True
        return False

    def _origen_valido(self) -> bool:
        origen = self.headers.get('Origin')
        if origen is None:
            return True
        return origen in (f'http://127.0.0.1:{PANEL.puerto}', f'http://localhost:{PANEL.puerto}')

    # ── métodos ──
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        self._atender('GET')

    def do_POST(self):
        self._atender('POST')

    def do_PUT(self):
        self.close_connection = True      # no se lee su cuerpo: que no quede en la conexión
        self._json(405, {'error': 'Método no permitido.'})

    do_DELETE = do_PATCH = do_OPTIONS = do_PUT

    def _atender(self, metodo: str) -> None:
        try:
            # El cuerpo se lee SIEMPRE antes de responder: si se deja en la conexión (keep-alive),
            # se mezcla con la petición siguiente («{}GET»).
            crudo = b''
            if metodo == 'POST':
                try:
                    largo = int(self.headers.get('Content-Length') or 0)
                except ValueError:
                    largo = -1
                if largo < 0 or largo > MAX_CUERPO:
                    self.close_connection = True
                    return self._json(413, {'error': 'Petición demasiado grande.'})
                crudo = self.rfile.read(largo) if largo else b''
            if not self._host_valido():
                return self._json(403, {'error': 'Dirección no permitida.'})
            url = urllib.parse.urlsplit(self.path)
            ruta = url.path
            consulta = urllib.parse.parse_qs(url.query)
            if ruta == '/entrar':
                return self._entrar(consulta)
            if not ruta.startswith('/api/'):
                if metodo != 'GET':
                    return self._json(405, {'error': 'Método no permitido.'})
                return self._estatico(ruta)
            if ruta != '/api/ping':
                if not self._con_sesion():
                    return self._json(401, {'error': 'Abra el panel desde el acceso directo «Panel IncubApp».'})
                if metodo != 'GET' and (self.headers.get('X-Panel') != '1' or not self._origen_valido()):
                    return self._json(403, {'error': 'Petición rechazada (falta la cabecera del panel).'})
            cuerpo = {}
            if metodo == 'POST':
                if crudo:
                    try:
                        cuerpo = json.loads(crudo.decode('utf-8'))
                    except (ValueError, UnicodeDecodeError):
                        return self._json(400, {'error': 'El cuerpo no es JSON válido.'})
                    if not isinstance(cuerpo, dict):
                        return self._json(400, {'error': 'El cuerpo debe ser un objeto JSON.'})
            for m, patron, funcion in RUTAS:
                encontrado = patron.match(ruta)
                if encontrado and m == metodo:
                    return self._json(200, funcion(ruta, consulta, cuerpo, *encontrado.groups()))
            if any(p.match(ruta) for _, p, _ in RUTAS):
                return self._json(405, {'error': 'Método no permitido.'})
            return self._json(404, {'error': 'No existe esa ruta.'})
        except ErrorHttp as e:
            return self._json(e.codigo, {'error': e.mensaje})
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return None
        except Exception as e:  # noqa: BLE001
            registro.exception('Error atendiendo %s %s', metodo, self.path)
            try:
                return self._json(500, {'error': f'Error interno del panel: {type(e).__name__}: {e}'})
            except Exception:  # noqa: BLE001
                return None

    def _entrar(self, consulta: dict) -> None:
        llave = (consulta.get('llave') or [''])[0]
        if llave and hmac.compare_digest(llave.encode(), PANEL.llave.encode()):
            self.send_response(302)
            self.send_header('Location', '/')
            self.send_header('Set-Cookie', f'{COOKIE}={PANEL.llave}; HttpOnly; SameSite=Strict; Path=/')
            self.send_header('Content-Length', '0')
            self.send_header('Cache-Control', 'no-store')
            self._cabeceras_seguridad()
            self.end_headers()
            return None
        return self._enviar(401, PAGINA_SIN_SESION.encode('utf-8'), 'text/html; charset=utf-8')

    def _estatico(self, ruta: str) -> None:
        ruta = urllib.parse.unquote(ruta)
        if ruta in ('', '/'):
            ruta = '/index.html'
        if '\\' in ruta or '..' in ruta or ':' in ruta or '\x00' in ruta or not re.fullmatch(r'[/A-Za-z0-9._-]+', ruta):
            return self._json(404, {'error': 'No existe.'})
        destino = (sistema.WEB / ruta.lstrip('/')).resolve()
        try:
            destino.relative_to(sistema.WEB.resolve())
        except ValueError:
            return self._json(404, {'error': 'No existe.'})
        if not destino.is_file():
            return self._json(404, {'error': 'No existe.'})
        tipo = TIPOS.get(destino.suffix.lower()) or mimetypes.guess_type(destino.name)[0] or 'application/octet-stream'
        # index.html sin caché: así una versión nueva del panel se ve al recargar.
        extra = {'Cache-Control': 'no-cache'}
        return self._enviar(200, destino.read_bytes(), tipo, extra)


# ── Ventana ──────────────────────────────────────────────────────────────────
def navegador() -> list[str] | None:
    candidatos = [
        Path(os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')) / 'Microsoft/Edge/Application/msedge.exe',
        Path(os.environ.get('ProgramFiles', r'C:\Program Files')) / 'Microsoft/Edge/Application/msedge.exe',
        Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft/Edge/Application/msedge.exe',
        Path(os.environ.get('ProgramFiles', r'C:\Program Files')) / 'Google/Chrome/Application/chrome.exe',
        Path(os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')) / 'Google/Chrome/Application/chrome.exe',
        Path(os.environ.get('LOCALAPPDATA', '')) / 'Google/Chrome/Application/chrome.exe',
    ]
    for c in candidatos:
        if c.is_file():
            return [str(c)]
    return None


def abrir_ventana(puerto: int, llave: str) -> None:
    url = f'http://127.0.0.1:{puerto}/entrar?llave={llave}'
    exe = navegador()
    if exe:
        perfil = sistema.PRIVADO / 'navegador'
        args = exe + [f'--app={url}', f'--user-data-dir={perfil}', '--no-first-run', '--no-default-browser-check',
                      '--window-size=1440,900', '--disable-features=Translate', '--lang=es']
        try:
            subprocess.Popen(args, creationflags=0x00000008 | sistema.NUEVO_GRUPO,  # DETACHED_PROCESS
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             close_fds=True)
            return
        except OSError as e:
            registro.warning('No se pudo abrir %s: %s', exe[0], e)
    os.startfile(url)  # noqa: S606 — último recurso: el navegador predeterminado


def panel_vivo() -> dict | None:
    """Si ya hay un panel corriendo, devuelve su sesión ({puerto, llave, pid})."""
    datos = sistema.leer_json(SESION, None)
    if not isinstance(datos, dict) or not datos.get('puerto'):
        return None
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{int(datos['puerto'])}/api/ping", timeout=3) as r:
            if json.loads(r.read().decode()).get('app') == 'incubapp-panel':
                return datos
    except (OSError, ValueError, urllib.error.URLError):
        pass
    return None


def crear_servidor(desde: int) -> ThreadingHTTPServer:
    ultimo = None
    for puerto in range(desde, desde + 10):
        try:
            srv = ThreadingHTTPServer(('127.0.0.1', puerto), Manejador)
            srv.daemon_threads = True
            return srv
        except OSError as e:
            ultimo = e
    raise SystemExit(f'No hay un puerto libre entre {desde} y {desde + 9}: {ultimo}')


def main(argv: list[str] | None = None) -> int:
    global PANEL
    ap = argparse.ArgumentParser(description='Panel IncubApp')
    ap.add_argument('--abrir', action='store_true')
    ap.add_argument('--inicio', action='store_true')
    ap.add_argument('--sin-ventana', action='store_true')
    ap.add_argument('--puerto', type=int, default=PUERTO)
    args = ap.parse_args(argv)

    vivo = panel_vivo()
    if vivo:
        if not args.sin_ventana:
            abrir_ventana(int(vivo['puerto']), vivo['llave'])
        return 0

    srv = crear_servidor(args.puerto)
    puerto = srv.server_address[1]
    PANEL = Panel(puerto)
    PANEL.servidor = srv
    sistema.guardar_json(SESION, {'puerto': puerto, 'llave': PANEL.llave, 'pid': os.getpid(),
                                  'inicio': sistema.ahora_iso()})
    registro.info('Panel %s escuchando en http://127.0.0.1:%s (pid %s)', sistema.VERSION, puerto, os.getpid())
    PANEL.iniciar_modulos()

    ventana = not args.sin_ventana and not (args.inicio and not PANEL.ajustes.abrir_al_iniciar)
    if ventana:
        espera = 20 if args.inicio else 0.3    # al iniciar sesión, no competir con el arranque de Windows
        threading.Timer(espera, abrir_ventana, (puerto, PANEL.llave)).start()
    try:
        srv.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        PANEL.apagar()
        srv.server_close()
        registro.info('Panel detenido')
    return 0


if __name__ == '__main__':
    sys.exit(main())
