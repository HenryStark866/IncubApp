"""Panel IncubApp · Monitor de estado.

Cada `intervalo_rapido_s` revisa contenedores y que la app responda; cada
`intervalo_completo_s` además recursos, base de datos, túnel, respaldo, git y la URL
pública. Arma la forma ESTADO de DISENO.md, guarda métricas por minuto y avisa de los
cambios de nivel (solo cuando el nivel nuevo se repite en 2 ciclos: un corte de 10 s no es
una caída).
"""
from __future__ import annotations

import ctypes
import json
import shutil
import socket
import ssl
import threading
import time
import urllib.error
import urllib.request
import winreg
from ctypes import wintypes
from typing import Callable

from . import secretos, sistema
from .sistema import registro

# ── Qué contenedor es cada componente ────────────────────────────────────────
CONTENEDOR = {
    'app': 'incubapp-incubapp-1', 'base': 'supabase-db', 'auth': 'supabase-auth', 'rest': 'supabase-rest',
    'storage': 'supabase-storage', 'realtime': 'realtime-dev.supabase-realtime', 'envoy': 'supabase-envoy',
    'meta': 'supabase-meta', 'edge': 'supabase-edge-functions', 'studio': 'supabase-studio',
    'pooler': 'supabase-pooler', 'imgproxy': 'supabase-imgproxy', 'tunel': 'incubapp-tunel',
    'ngrok': 'incubapp-ngrok-1', 'lector': 'incubapp-lector', 'asistente': 'incubapp-asistente',
    'n8n': 'incubapp-n8n', 'correo': 'supabase-correo-plantillas-1',
}
SOBRAN = {'studio', 'pooler', 'imgproxy'}          # apagados a propósito en producción (arranque.sh)
NOMBRES_SOBRAN = {CONTENEDOR[x] for x in SOBRAN}
CRITICOS = ('app', 'api', 'base', 'wsl', 'docker')

# (id, nombre, grupo) en el orden en que se muestran
COMPONENTES = [
    ('equipo', 'Equipo (Windows)', 'Servidor'), ('wsl', 'Ubuntu (WSL)', 'Servidor'), ('docker', 'Docker', 'Servidor'),
    ('app', 'App IncubApp', 'Acceso'), ('api', 'API de Supabase', 'Acceso'),
    ('publico', 'Acceso desde internet', 'Acceso'), ('tunel', 'Túnel de Cloudflare', 'Acceso'),
    ('ngrok', 'ngrok (antiguo)', 'Acceso'),
    ('base', 'Base de datos', 'Supabase'), ('auth', 'Cuentas (auth)', 'Supabase'), ('rest', 'API REST', 'Supabase'),
    ('storage', 'Fotos y archivos', 'Supabase'), ('realtime', 'Tiempo real', 'Supabase'),
    ('envoy', 'Puerta de la API', 'Supabase'), ('meta', 'Meta', 'Supabase'), ('edge', 'Funciones', 'Supabase'),
    ('correo', 'Correo', 'Supabase'), ('studio', 'Studio', 'Supabase'), ('pooler', 'Pooler', 'Supabase'),
    ('imgproxy', 'Imgproxy', 'Supabase'),
    ('lector', 'Lector de fotos', 'Servicios IncubApp'), ('asistente', 'Asistente de voz', 'Servicios IncubApp'),
    ('n8n', 'n8n', 'Servicios IncubApp'),
    ('respaldo', 'Respaldo diario', 'Mantenimiento'), ('vigilante', 'Vigilante', 'Mantenimiento'),
    ('arranque', 'Arranque automático', 'Mantenimiento'), ('version', 'Versión de la app', 'Mantenimiento'),
]
NOMBRE = {i: n for i, n, _ in COMPONENTES}
LETRA = {'ok': 'o', 'aviso': 'a', 'falla': 'f', 'apagado': 'x', 'desconocido': 'd'}
NIVEL_DE_LETRA = {v: k for k, v in LETRA.items()}
MAX_MINUTOS = 7 * 24 * 60


# ── Windows sin PowerShell (ctypes) ──────────────────────────────────────────
class _FILETIME(ctypes.Structure):
    _fields_ = [('lo', wintypes.DWORD), ('hi', wintypes.DWORD)]


class _MEMSTATUS(ctypes.Structure):
    _fields_ = [('dwLength', wintypes.DWORD), ('dwMemoryLoad', wintypes.DWORD),
                ('ullTotalPhys', ctypes.c_ulonglong), ('ullAvailPhys', ctypes.c_ulonglong),
                ('ullTotalPageFile', ctypes.c_ulonglong), ('ullAvailPageFile', ctypes.c_ulonglong),
                ('ullTotalVirtual', ctypes.c_ulonglong), ('ullAvailVirtual', ctypes.c_ulonglong),
                ('ullAvailExtendedVirtual', ctypes.c_ulonglong)]


def _tiempos_cpu():
    i, k, u = _FILETIME(), _FILETIME(), _FILETIME()
    if not ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(i), ctypes.byref(k), ctypes.byref(u)):
        return None
    v = lambda f: (f.hi << 32) | f.lo  # noqa: E731
    return v(i), v(k), v(u)


def _version_windows() -> str:
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\Windows NT\CurrentVersion') as k:
            nombre = winreg.QueryValueEx(k, 'ProductName')[0]
            build = int(winreg.QueryValueEx(k, 'CurrentBuild')[0])
            try:
                vis = winreg.QueryValueEx(k, 'DisplayVersion')[0]
            except OSError:
                vis = ''
        if build >= 22000:          # el registro sigue diciendo «Windows 10» en Windows 11
            nombre = nombre.replace('Windows 10', 'Windows 11')
        return f'{nombre} {vis}'.strip()
    except OSError:
        return 'Windows'


def _ip_local() -> str | None:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 53))     # UDP: no envía nada, solo elige la interfaz de salida
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def _fecha_utc(texto: str | None) -> float | None:
    """'2026-10-01T15:00:46.901968756Z' (Docker) → epoch; None si no se entiende."""
    if not texto or texto.startswith('0001'):
        return None
    d = sistema.leer_iso(texto[:19] + '+00:00')
    return d.timestamp() if d else None


class _MedidorWindows:
    def __init__(self) -> None:
        self._previo = _tiempos_cpu()
        self.version = _version_windows()

    def medir(self) -> dict:
        cpu = None
        actual = _tiempos_cpu()
        if actual and self._previo:
            di, dk, du = (a - b for a, b in zip(actual, self._previo))
            if dk + du > 0:
                cpu = round(max(0.0, min(100.0, (1 - di / (dk + du)) * 100)), 1)
        self._previo = actual or self._previo
        m = _MEMSTATUS()
        m.dwLength = ctypes.sizeof(_MEMSTATUS)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
        total = m.ullTotalPhys // 2**20
        usada = (m.ullTotalPhys - m.ullAvailPhys) // 2**20
        discos = []
        mascara = ctypes.windll.kernel32.GetLogicalDrives()
        for n in range(26):
            if mascara & (1 << n):
                raiz = f'{chr(65 + n)}:\\'
                if ctypes.windll.kernel32.GetDriveTypeW(raiz) == 3:   # DRIVE_FIXED
                    try:
                        u = shutil.disk_usage(raiz)
                        discos.append({'unidad': raiz[:2], 'total_gb': round(u.total / 1e9, 1),
                                       'libre_gb': round(u.free / 1e9, 1),
                                       'pct': round(u.used / u.total * 100, 1) if u.total else None})
                    except OSError:
                        pass
        encendido = time.time() - ctypes.windll.kernel32.GetTickCount64() / 1000
        import os
        return {'nombre': os.environ.get('COMPUTERNAME', socket.gethostname()), 'windows': self.version,
                'ip': _ip_local(), 'cpu': cpu, 'ram_total_mb': total, 'ram_usada_mb': usada,
                'ram_pct': round(usada / total * 100, 1) if total else None, 'discos': discos,
                'encendido_desde': sistema.iso(encendido), 'usuario': os.environ.get('USERNAME')}


# ── Consultas lentas (ciclo completo) ────────────────────────────────────────
def estado_wsl() -> dict:
    """'Running' | 'Stopped' | 'no_responde' | 'sin_distro' sin arrancar la distro."""
    r = sistema.ejecutar(['wsl.exe', '-l', '-v'], timeout=20)
    if r.agotado:
        return {'estado': 'no_responde', 'detalle': 'wsl.exe no respondió en 20 s'}
    for linea in r.salida.splitlines():
        partes = linea.replace('*', ' ').split()
        if len(partes) >= 2 and partes[0] == sistema.DISTRO:
            return {'estado': partes[1], 'detalle': None}
    return {'estado': 'sin_distro', 'detalle': (r.texto or 'No aparece la distribución')[:300]}


def revisar_publico(url: str) -> dict:
    res = {'url': url, 'codigo': None, 'ms': None, 'cert_dias': None, 'error': None}
    t0 = time.monotonic()
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'PanelIncubApp/1.0'})
        with urllib.request.urlopen(req, timeout=12) as r:
            r.read(2048)
            res['codigo'] = r.status
    except urllib.error.HTTPError as e:
        res['codigo'] = e.code
    except Exception as e:  # noqa: BLE001
        res['error'] = str(getattr(e, 'reason', e))[:200]
    res['ms'] = round((time.monotonic() - t0) * 1000)
    if url.startswith('https://'):
        host = url.split('/')[2].split(':')[0]
        try:
            ctx = ssl.create_default_context()
            with socket.create_connection((host, 443), timeout=8) as s, ctx.wrap_socket(s, server_hostname=host) as t:
                fin = ssl.cert_time_to_seconds(t.getpeercert()['notAfter'])
                res['cert_dias'] = int((fin - time.time()) // 86400)
        except Exception:  # noqa: BLE001
            pass
    return res


def info_git() -> dict:
    def git(*a):
        r = sistema.ejecutar(['git', '-C', str(sistema.RAIZ), *a], timeout=15)
        return r.salida.strip() if r.ok else None
    d = {'rama': git('rev-parse', '--abbrev-ref', 'HEAD'), 'commit': None, 'mensaje': None, 'fecha': None,
         'cambios_locales': None, 'pendientes_remoto': None}
    linea = git('log', '-1', '--format=%h|%cI|%s')
    if linea:
        d['commit'], d['fecha'], d['mensaje'] = (linea.split('|', 2) + [None, None])[:3]
    est = git('status', '--porcelain')
    if est is not None:
        d['cambios_locales'] = len([x for x in est.splitlines() if x.strip()])
    origen = None
    try:
        for x in (sistema.SERVIDOR_LOCAL / 'rama.txt').read_text(encoding='utf-8').splitlines():
            if x.strip() and not x.strip().startswith('#'):
                origen = x.strip()
                break
    except OSError:
        pass
    origen = origen or d['rama']
    # Sin «git fetch»: choca con 7-ACTUALIZAR-APP. Se compara con la referencia que ya hay.
    n = git('rev-list', '--count', f'HEAD..origin/{origen}') if origen else None
    d['pendientes_remoto'] = int(n) if n and n.isdigit() else None
    d['origen'] = origen
    return d


def info_respaldo() -> dict:
    d = {'ultimo': None, 'resultado': None, 'horas': None, 'registro': []}
    try:
        lineas = (sistema.SERVIDOR_LOCAL / 'logs' / 'ultimo-respaldo.txt').read_text(encoding='utf-8').split()
        d['ultimo'] = lineas[0] if lineas else None
        d['resultado'] = lineas[1] if len(lineas) > 1 else None
        f = sistema.leer_iso(d['ultimo'])
        if f:
            d['horas'] = round((sistema.ahora() - f).total_seconds() / 3600, 1)
    except OSError:
        pass
    try:
        with open(sistema.SERVIDOR_LOCAL / 'logs' / 'respaldo.txt', 'rb') as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - 4000))
            d['registro'] = secretos.tachar_lineas(f.read().decode('utf-8', 'replace').splitlines()[-8:])
    except OSError:
        pass
    return d


def tarea_windows() -> dict | None:
    datos, _ = sistema.powershell_json(
        "$t = Get-ScheduledTask -TaskName 'IncubApp Servidor' -ErrorAction SilentlyContinue;"
        "if ($t) { $i = Get-ScheduledTaskInfo -TaskName 'IncubApp Servidor';"
        "[pscustomobject]@{ existe=$true; estado=[string]$t.State; ultima=$i.LastRunTime.ToString('s');"
        " modo=[string]$t.Principal.LogonType } | ConvertTo-Json -Compress }"
        " else { '{\"existe\": false}' }", timeout=60)
    return datos


# ── El monitor ───────────────────────────────────────────────────────────────
class Monitor:
    def __init__(self, ajustes: sistema.Ajustes) -> None:
        self.ajustes = ajustes
        self.al_cambiar: list[Callable[[dict], None]] = []
        self._win = _MedidorWindows()
        self._detener = threading.Event()
        self._ya = threading.Event()
        self._hilo: threading.Thread | None = None
        self._candado = threading.Lock()
        self._snapshot: dict = self._vacio()
        self._linux: dict | None = None          # último JSON de wsl/estado.sh (rápido o completo)
        self._linux_completo: dict = {}          # campos que solo trae el completo
        self._wsl = {'estado': 'desconocido', 'detalle': None}
        self._publico: dict | None = None
        self._git: dict | None = None
        self._tarea: dict | None = None
        self._tarea_t = 0.0
        self._ciclo_completo_t = 0.0
        self._niveles: dict[str, dict] = {}       # id → {nivel, desde, pendiente, cuenta}
        self._primero = True
        # Métricas por minuto
        self._minuto = None
        self._muestras: dict[str, list] = {}
        self._niveles_minuto: dict[str, str] = {}
        m = sistema.leer_json(sistema.DATOS / 'metricas.json', {}) or {}
        self._m_t: list = m.get('t', [])
        self._m_series: dict[str, list] = m.get('series', {})
        self._m_niveles: dict[str, list] = m.get('niveles', {})
        self._guardado_t = time.time()

    @staticmethod
    def _vacio() -> dict:
        """Lo que se muestra antes del primer ciclo."""
        return {'generado': None, 'ciclo_completo': None,
                'resumen': {'nivel': 'desconocido', 'titulo': 'Revisando el servidor…', 'detalle': '',
                            'fallas': 0, 'avisos': 0},
                'componentes': [], 'contenedores': [], 'equipo': None, 'wsl': None, 'base': None, 'tunel': None,
                'respaldo': None, 'vigilante': None, 'git': None, 'publico': None, 'tarea_windows': None}

    # ── API pública ──
    def iniciar(self) -> None:
        if self._hilo and self._hilo.is_alive():
            return
        self._detener.clear()
        self._hilo = sistema.hilo(self._bucle, nombre='monitor-estado')

    def detener(self) -> None:
        self._detener.set()
        self._ya.set()
        self._guardar_metricas()

    def instantanea(self) -> dict:
        return self._snapshot

    def actualizar_ya(self) -> None:
        self._ciclo_completo_t = 0
        self._ya.set()

    def eventos(self, limite: int = 200) -> list[dict]:
        return list(reversed(sistema.leer_jsonl(sistema.DATOS / 'eventos.jsonl', max(1, min(limite, 5000)))))

    def metricas(self, horas: float = 24) -> dict:
        with self._candado:
            corte = time.time() - max(0.1, min(float(horas), 24 * 7)) * 3600
            inicio = next((i for i, t in enumerate(self._m_t) if t >= corte), len(self._m_t))
            t = self._m_t[inicio:]
            series = {k: v[inicio:] for k, v in self._m_series.items()}
            disp = {}
            for cid, letras in self._m_niveles.items():
                tramo = [x for x in letras[inicio:] if x and x != 'd']
                if tramo:
                    buenos = sum(1 for x in tramo if x in 'oax')
                    disp[cid] = round(buenos / len(tramo) * 100, 2)
        return {'t': t, 'series': series, 'disponibilidad': disp}

    # ── Bucle ──
    def _bucle(self) -> None:
        while not self._detener.is_set():
            t0 = time.monotonic()
            completo = time.monotonic() - self._ciclo_completo_t >= max(20, self.ajustes.intervalo_completo_s)
            try:
                self._ciclo(completo)
            except Exception:  # noqa: BLE001
                registro.exception('Ciclo del monitor falló')
            espera = max(3, self.ajustes.intervalo_rapido_s) - (time.monotonic() - t0)
            if espera > 0:
                self._ya.wait(espera)
            self._ya.clear()

    def _ciclo(self, completo: bool) -> None:
        self._wsl = estado_wsl()
        win = self._win.medir()
        if self._wsl['estado'] == 'Running':
            modo = 'completo' if completo else 'rapido'
            datos, r = sistema.wsl_json('bash ' + sistema.q(sistema.a_wsl(sistema.WSL_DIR / 'estado.sh')) + ' ' + modo,
                                        timeout=90 if completo else 45)
            if isinstance(datos, dict):
                self._linux = datos
                if completo:
                    self._linux_completo = datos
            else:
                registro.warning('estado.sh %s no devolvió JSON: %s', modo, r.texto[:300])
                self._linux = None
        else:
            self._linux = None
        if completo:
            self._ciclo_completo_t = time.monotonic()
            self._publico = revisar_publico(self.ajustes.url_publica or sistema.URL_PUBLICA)
            self._git = info_git()
            if time.time() - self._tarea_t > 300:
                self._tarea = tarea_windows()
                self._tarea_t = time.time()
        snap = self._armar(win, completo)
        self._snapshot = snap
        self._metricas(snap)

    # ── Armar el ESTADO ──
    def _armar(self, win: dict, completo: bool) -> dict:
        lx = self._linux
        lc = self._linux_completo or {}
        conts = {c['nombre']: c for c in (lx or {}).get('contenedores') or []}
        stats = lc.get('stats') or {}
        comp: dict[str, dict] = {}

        def poner(cid, nivel, estado, detalle=None, acciones=None, contenedor=None, datos=None):
            comp[cid] = {'id': cid, 'nombre': NOMBRE.get(cid, cid),
                         'grupo': next((g for i, _, g in COMPONENTES if i == cid), 'Otros'),
                         'nivel': nivel, 'estado': estado, 'detalle': detalle,
                         'contenedor': contenedor, 'acciones': acciones or [], 'datos': datos or {}}

        # Servidor
        c_libre = next((d for d in win['discos'] if d['unidad'] == 'C:'), None)
        nivel = 'ok'
        if (win.get('ram_pct') or 0) > 92 or (c_libre and c_libre['libre_gb'] < 0.1 * c_libre['total_gb']):
            nivel = 'aviso'
        if c_libre and c_libre['libre_gb'] < 0.03 * c_libre['total_gb']:
            nivel = 'falla'
        poner('equipo', nivel, f"CPU {win.get('cpu') if win.get('cpu') is not None else '—'} % · RAM {win.get('ram_pct')} %"
              + (f" · C: {c_libre['libre_gb']:.0f} GB libres" if c_libre else ''))

        wsl_estado = self._wsl['estado']
        hay_linux = lx is not None
        if wsl_estado == 'Running' and hay_linux:
            mem = lx.get('memoria') or {}
            dis = lx.get('disco') or {}
            pct = round(mem['ram_usada_mb'] / mem['ram_total_mb'] * 100, 1) if mem.get('ram_total_mb') else None
            nivel = 'aviso' if (pct or 0) > 92 else 'ok'
            poner('wsl', nivel, f"En marcha · RAM {mem.get('ram_usada_mb', 0) / 1024:.1f} de {mem.get('ram_total_mb', 0) / 1024:.1f} GB",
                  acciones=['reiniciar_wsl'])
        elif wsl_estado == 'Running':
            poner('wsl', 'falla', 'Ubuntu está en marcha pero no contesta', self._wsl.get('detalle'),
                  acciones=['reiniciar_wsl'])
        elif wsl_estado == 'Stopped':
            poner('wsl', 'falla', 'Ubuntu está detenido: IncubApp no funciona', acciones=['arrancar_servidor'])
        elif wsl_estado == 'no_responde':
            poner('wsl', 'falla', 'WSL no responde', self._wsl.get('detalle'), acciones=['reiniciar_wsl'])
        else:
            poner('wsl', 'falla', 'No se encontró Ubuntu', self._wsl.get('detalle'), acciones=['arrancar_servidor'])

        if not hay_linux:
            sin = 'Sin datos: Ubuntu no responde'
            for cid, _, _ in COMPONENTES:
                if cid not in comp and cid not in ('publico', 'version', 'respaldo'):
                    poner(cid, 'desconocido', sin, contenedor=CONTENEDOR.get(cid))
        else:
            en_marcha = sum(1 for c in conts.values() if c['estado'] == 'running')
            if lx.get('docker_ok'):
                ver = lc.get('docker_version')
                poner('docker', 'ok', f"{'Docker ' + ver + ' · ' if ver else ''}{en_marcha} de {len(conts)} contenedores en marcha",
                      acciones=['estado_docker', 'limpiar_docker'])
            else:
                poner('docker', 'falla', 'Docker no responde', acciones=['arranque_completo', 'reiniciar_wsl'])

            app, api = lx.get('app') or {}, lx.get('api') or {}
            if app.get('codigo') == 200:
                poner('app', 'ok', f"Responde en {app.get('ms')} ms", acciones=['reiniciar_app'], contenedor=CONTENEDOR['app'])
            else:
                poner('app', 'falla', f"No responde (código {app.get('codigo') or 'sin respuesta'})",
                      self._detalle_cont(conts.get(CONTENEDOR['app'])), ['reiniciar_app', 'revisar_todo'], CONTENEDOR['app'])
            if api.get('codigo') in (200, 401):
                poner('api', 'ok', f"Responde en {api.get('ms')} ms", acciones=['reiniciar_supabase'])
            else:
                poner('api', 'falla', f"No responde (código {api.get('codigo') or 'sin respuesta'})",
                      acciones=['reiniciar_supabase', 'revisar_todo'])

            for cid in ('base', 'auth', 'rest', 'storage', 'realtime', 'envoy', 'meta', 'edge', 'pooler', 'imgproxy'):
                self._por_contenedor(poner, cid, conts)
            b = lc.get('base')
            if b and comp['base']['nivel'] == 'ok':
                comp['base']['estado'] = f"{b.get('tamano')} · {b.get('conexiones')} conexiones · {b.get('usuarios')} usuarios"

            c = conts.get(CONTENEDOR['studio'])
            if c and c['estado'] == 'running':
                poner('studio', 'aviso', 'Encendido: gasta memoria; apáguelo si no lo está usando',
                      acciones=['studio_apagar', 'abrir:studio'], contenedor=c['nombre'])
            else:
                poner('studio', 'apagado', 'Apagado (no hace falta en producción)', acciones=['studio_encender'],
                      contenedor=CONTENEDOR['studio'])

            # Túnel
            c = conts.get(CONTENEDOR['tunel'])
            t = lc.get('tunel') or {}
            if not c:
                poner('tunel', 'desconocido' if not lc.get('tunel_configurado') else 'falla',
                      'No hay contenedor del túnel', acciones=['recrear_tunel'])
            elif c['estado'] != 'running':
                poner('tunel', 'falla', 'El túnel está detenido: desde internet no entra nadie',
                      self._detalle_cont(c), ['recrear_tunel'], c['nombre'])
            elif not lc:
                poner('tunel', 'ok', 'En marcha', contenedor=c['nombre'], acciones=['recrear_tunel'])
            elif not t.get('alcanzable'):
                # No se pudieron leer sus métricas (equipo muy cargado): si la URL pública abre, el túnel funciona.
                if (self._publico or {}).get('codigo') == 200:
                    poner('tunel', 'ok', 'Conectado (la URL pública responde)', 'No se pudieron leer las métricas del túnel en este ciclo.',
                          ['recrear_tunel'], c['nombre'])
                else:
                    poner('tunel', 'desconocido', 'No se pudo consultar el túnel', acciones=['recrear_tunel'], contenedor=c['nombre'])
            else:
                n = t.get('conexiones') or 0
                nivel = 'ok' if n >= 4 else ('aviso' if n > 0 else 'falla')
                txt = (f'{n} conexiones con Cloudflare' if n else 'Sin conexión con Cloudflare (se recupera solo; si sigue, recréelo)')
                poner('tunel', nivel, txt, f"Peticiones: {t.get('peticiones')} · errores: {t.get('errores')}",
                      ['recrear_tunel'], c['nombre'], t)

            c = conts.get(CONTENEDOR['ngrok'])
            if c and c['estado'] == 'running':
                poner('ngrok', 'ok', 'En marcha (antiguo: la app ya entra por Cloudflare)', contenedor=c['nombre'],
                      acciones=['detener_contenedor'])
            else:
                poner('ngrok', 'apagado', 'Apagado', contenedor=CONTENEDOR['ngrok'])

            # Correo
            c = conts.get(CONTENEDOR['correo'])
            smtp = lc.get('correo') or {}
            if not lc:
                poner('correo', 'ok' if c and c['estado'] == 'running' else 'desconocido', 'Revisando…', contenedor=CONTENEDOR['correo'])
            elif not smtp.get('host'):
                poner('correo', 'aviso', 'No hay servidor de correo: «Olvidé mi contraseña» no envía correos',
                      acciones=['probar_correo'], contenedor=CONTENEDOR['correo'])
            elif not c or c['estado'] != 'running':
                poner('correo', 'aviso', f"SMTP {smtp['host']}:{smtp.get('puerto')} · plantillas detenidas (salen en inglés)",
                      acciones=['probar_correo', 'encender_contenedor'], contenedor=CONTENEDOR['correo'])
            else:
                poner('correo', 'ok', f"SMTP {smtp['host']}:{smtp.get('puerto')}", f"Remitente: {smtp.get('remitente')}",
                      ['probar_correo'], CONTENEDOR['correo'])

            # Servicios propios
            self._por_contenedor(poner, 'lector', conts, ausente='apagado')
            lineas = []      # (fecha, texto) del registro del lector (docker logs --timestamps)
            for x in secretos.tachar_lineas(lc.get('lector') or []):
                f, _, txt = x.partition(' ')
                lineas.append((_fecha_utc(f), txt))
            if comp['lector']['nivel'] == 'ok' and lineas:
                # La última lectura de verdad (no un error viejo del arranque): si no hay rondas
                # con fotos, el lector se queda callado y eso está bien.
                f, ultima = next((x for x in reversed(lineas) if x[1].strip() and not x[1].lower().startswith('error')),
                                 (None, ''))
                hace = f' (hace {sistema.duracion_legible(time.time() - f)})' if f else ''
                comp['lector']['estado'] = ('Última lectura: ' + ultima[:70] + hace) if ultima else 'Esperando fotos de ronda'
                # Solo cuentan los errores de la última media hora: uno viejo del arranque no es una falla.
                errores = [t for f, t in lineas if f and time.time() - f < 1800
                           and ('error' in t.lower() or 'traceback' in t.lower())]
                if errores:
                    comp['lector']['nivel'] = 'aviso'
                    comp['lector']['detalle'] = '\n'.join(errores)[:600]
            self._por_contenedor(poner, 'asistente', conts, ausente='apagado')
            if comp['asistente']['nivel'] == 'ok' and lc and lc.get('asistente') is False:
                comp['asistente'].update(nivel='falla', estado='En marcha pero no responde')
            self._por_contenedor(poner, 'n8n', conts, ausente='apagado')
            n8n = lc.get('n8n') or {}
            if comp['n8n']['nivel'] == 'ok' and lc and n8n.get('codigo') not in (200, None):
                comp['n8n'].update(nivel='falla', estado=f"En marcha pero no responde (código {n8n.get('codigo')})")

            # Vigilante y arranque (systemd)
            sd = lx.get('systemd') or {}
            tim = sd.get('incubapp-vigia.timer') or {}
            srv = sd.get('incubapp-vigia.service') or {}
            ultima = srv.get('ExecMainExitTimestamp')
            hace = time.time() - ultima if isinstance(ultima, int) else None
            if tim.get('ActiveState') != 'active':
                poner('vigilante', 'falla', 'El vigilante está apagado: si algo se cae, nadie lo levanta',
                      acciones=['revisar_todo'])
            elif hace is not None and hace > 300 and srv.get('ActiveState') != 'activating':
                poner('vigilante', 'aviso', f'No corre desde hace {sistema.duracion_legible(hace)}', acciones=['revisar_todo'])
            else:
                poner('vigilante', 'ok', 'Revisa cada minuto' + (f' · última hace {sistema.duracion_legible(hace)}' if hace else ''),
                      acciones=['revisar_todo'])
            comp['vigilante']['datos'] = {'registro': secretos.tachar_lineas(lc.get('vigilante') or [])}

            arr = sd.get('incubapp-arranque.service') or {}
            tarea = self._tarea or {}
            ok_srv = arr.get('ActiveState') == 'active' and arr.get('Result') == 'success'
            ok_tarea = tarea.get('existe') and tarea.get('estado') in ('Running', 'Ready')
            txt = f"Ubuntu: {'listo' if ok_srv else arr.get('ActiveState') or '—'} · Windows: " + \
                  ({'Running': 'tarea en ejecución', 'Ready': 'tarea lista'}.get(tarea.get('estado'), tarea.get('estado') or 'revisando…')
                   if tarea.get('existe', True) else 'NO hay tarea')
            nivel = 'ok' if ok_srv and (ok_tarea or not self._tarea) else ('falla' if tarea and not tarea.get('existe') else 'aviso')
            poner('arranque', nivel, txt, acciones=['arranque_completo'])

        # Público, respaldo, versión (no dependen de que Ubuntu conteste)
        p = self._publico
        if p is None:
            poner('publico', 'desconocido', 'Revisando…')
        elif p.get('codigo') == 200:
            nivel = 'aviso' if p.get('cert_dias') is not None and p['cert_dias'] < 15 else 'ok'
            poner('publico', nivel, f"Responde desde internet en {p['ms']} ms"
                  + (f" · certificado: {p['cert_dias']} días" if p.get('cert_dias') is not None else ''),
                  acciones=['abrir:publico', 'recrear_tunel'], datos=p)
        else:
            poner('publico', 'falla', f"No abre desde internet ({p.get('codigo') or p.get('error') or 'sin respuesta'})",
                  'Puede ser el túnel, el internet de la planta o Cloudflare.', ['recrear_tunel', 'revisar_todo'], datos=p)

        r = info_respaldo()
        st = ((lx or {}).get('systemd') or {}).get('incubapp-respaldo.timer') or {}
        r['proximo'] = st.get('NextElapseUSecRealtime') if not isinstance(st.get('NextElapseUSecRealtime'), int) \
            else sistema.iso(st['NextElapseUSecRealtime'])
        r['destino'] = lc.get('respaldo_destino')
        if r['ultimo'] is None:
            poner('respaldo', 'falla', 'No hay registro de ningún respaldo', acciones=['respaldo_ahora'])
        elif r['resultado'] != 'OK':
            poner('respaldo', 'falla', f"El último respaldo terminó con errores (hace {r['horas']} h)",
                  '\n'.join(r['registro']), ['respaldo_ahora'])
        elif (r['horas'] or 0) > 50:
            poner('respaldo', 'falla', f"Sin respaldo desde hace {r['horas']:.0f} h", acciones=['respaldo_ahora'])
        elif (r['horas'] or 0) > 26:
            poner('respaldo', 'aviso', f"Último respaldo hace {r['horas']:.0f} h", acciones=['respaldo_ahora'])
        else:
            poner('respaldo', 'ok', f"Último hace {sistema.duracion_legible((r['horas'] or 0) * 3600)} · OK",
                  acciones=['respaldo_ahora', 'abrir:carpeta_respaldos'])

        g = self._git
        if g is None:
            poner('version', 'desconocido', 'Revisando…')
        elif g.get('pendientes_remoto'):
            poner('version', 'aviso', f"Hay una versión nueva ({g['pendientes_remoto']} cambios): use «Actualizar la app»",
                  g.get('mensaje'), ['actualizar_app'])
        else:
            poner('version', 'ok', f"{g.get('commit')} · {(g.get('mensaje') or '')[:70]}", acciones=['actualizar_app'])

        # Orden, niveles confirmados y eventos
        lista = [comp[i] for i, _, _ in COMPONENTES if i in comp]
        self._confirmar(lista)
        fallas = [c for c in lista if c['nivel'] == 'falla']
        avisos = [c for c in lista if c['nivel'] == 'aviso']
        criticas = [c for c in fallas if c['id'] in CRITICOS]
        if not self._snapshot.get('generado') and not hay_linux and wsl_estado == 'desconocido':
            resumen = {'nivel': 'desconocido', 'titulo': 'Revisando el servidor…', 'detalle': ''}
        elif criticas:
            resumen = {'nivel': 'falla', 'titulo': 'IncubApp NO está disponible',
                       'detalle': '; '.join(f"{c['nombre']}: {c['estado']}" for c in criticas)}
        elif fallas or avisos:
            partes = [f"{c['nombre']}: {c['estado']}" for c in fallas + avisos]
            resumen = {'nivel': 'aviso', 'titulo': 'IncubApp funciona, con avisos' if not fallas else 'IncubApp funciona, con fallas',
                       'detalle': '; '.join(partes[:4]) + (f' y {len(partes) - 4} más' if len(partes) > 4 else '')}
        else:
            resumen = {'nivel': 'ok', 'titulo': 'IncubApp funcionando', 'detalle': 'Todo responde.'}
        resumen['fallas'], resumen['avisos'] = len(fallas), len(avisos)

        contenedores = []
        for c in conts.values():
            s = stats.get(c['nombre']) or {}
            nivel = ('falla' if c['salud'] == 'unhealthy' else 'aviso' if c['salud'] == 'starting' else 'ok') \
                if c['estado'] == 'running' else ('apagado' if c['nombre'] in NOMBRES_SOBRAN or (c.get('codigo_salida') in (0, 143)) else 'falla')
            contenedores.append({**{k: c.get(k) for k in ('nombre', 'servicio', 'proyecto', 'estado', 'salud', 'estado_texto',
                                                          'reinicios', 'puertos', 'imagen')},
                                 'desde': sistema.iso(_fecha_utc(c.get('iniciado') if c['estado'] == 'running' else c.get('terminado'))),
                                 'cpu': s.get('cpu'), 'mem_mb': s.get('mem_mb'), 'mem_limite_mb': s.get('mem_limite_mb'),
                                 'nivel': nivel, 'sobra': c['nombre'] in NOMBRES_SOBRAN})
        contenedores.sort(key=lambda c: (c['nivel'] != 'falla', c['sobra'], c['nombre']))

        mem = (lx or {}).get('memoria') or {}
        dis = (lx or {}).get('disco') or {}
        return {
            'generado': sistema.ahora_iso(),
            'ciclo_completo': sistema.iso(time.time() - (time.monotonic() - self._ciclo_completo_t)) if self._ciclo_completo_t else None,
            'resumen': resumen,
            'componentes': lista,
            'contenedores': contenedores,
            'equipo': win,
            'wsl': {'estado': wsl_estado, 'systemd': bool((lx or {}).get('systemd')),
                    **mem, **dis, 'carga': (lx or {}).get('carga'), 'docker': lc.get('docker_version')} if lx else {'estado': wsl_estado},
            'base': lc.get('base'),
            'tunel': lc.get('tunel'),
            'respaldo': r,
            'vigilante': {'activo': (((lx or {}).get('systemd') or {}).get('incubapp-vigia.timer') or {}).get('ActiveState') == 'active',
                          'registro': secretos.tachar_lineas(lc.get('vigilante') or [])} if lx else None,
            'git': self._git,
            'publico': self._publico,
            'tarea_windows': self._tarea,
        }

    @staticmethod
    def _detalle_cont(c: dict | None) -> str | None:
        if not c:
            return 'El contenedor no existe'
        return f"{c['nombre']}: {c['estado_texto']}"

    def _por_contenedor(self, poner, cid: str, conts: dict, ausente: str = 'falla') -> None:
        nombre = CONTENEDOR[cid]
        if cid == 'envoy' and nombre not in conts:
            nombre = next((n for n in conts if 'kong' in n), nombre)
        c = conts.get(nombre)
        if not c:
            poner(cid, 'apagado' if cid in SOBRAN else ausente, 'No está instalado' if ausente == 'apagado' else 'El contenedor no existe',
                  contenedor=nombre)
            return
        acc = ['reiniciar_contenedor']
        if c['estado'] == 'running':
            desde = _fecha_utc(c.get('iniciado'))
            hace = f" desde hace {sistema.duracion_legible(time.time() - desde)}" if desde else ''
            if c['salud'] == 'unhealthy':
                poner(cid, 'falla', 'En marcha pero no responde (unhealthy)', c['estado_texto'], acc, nombre)
            elif c['salud'] == 'starting':
                poner(cid, 'aviso', 'Arrancando…', c['estado_texto'], acc, nombre)
            elif cid in SOBRAN:
                poner(cid, 'ok', 'En marcha (no hace falta en producción)', c['estado_texto'], ['detener_contenedor'], nombre)
            else:
                extra = f" · {c['reinicios']} reinicios" if c.get('reinicios') else ''
                poner(cid, 'ok', f'En marcha{hace}{extra}', c['estado_texto'], acc, nombre)
        elif cid in SOBRAN:
            poner(cid, 'apagado', 'Apagado a propósito (no hace falta en producción)', c['estado_texto'], ['encender_contenedor'], nombre)
        elif c.get('codigo_salida') in (0, 143) and not c.get('politica') in ('always', 'unless-stopped'):
            poner(cid, 'apagado', 'Detenido', c['estado_texto'], ['encender_contenedor'], nombre)
        else:
            poner(cid, 'falla', 'Detenido: ' + c['estado_texto'], None, ['encender_contenedor', 'revisar_todo'], nombre)

    def _confirmar(self, lista: list[dict]) -> None:
        """Nivel mostrado = nivel confirmado (2 ciclos iguales). Genera EVENTOS."""
        ahora = sistema.ahora_iso()
        for c in lista:
            n = self._niveles.get(c['id'])
            nuevo = c['nivel']
            if n is None or self._primero:
                self._niveles[c['id']] = {'nivel': nuevo, 'desde': ahora, 'pendiente': None, 'cuenta': 0}
            elif nuevo == n['nivel']:
                n['pendiente'], n['cuenta'] = None, 0
            else:
                if n['pendiente'] == nuevo:
                    n['cuenta'] += 1
                else:
                    n['pendiente'], n['cuenta'] = nuevo, 1
                # 'desconocido' no confirma solo (un ciclo sin datos no es una caída)
                if n['cuenta'] >= 2 and nuevo != 'desconocido' or n['cuenta'] >= 6:
                    antes = n['nivel']
                    n.update(nivel=nuevo, desde=ahora, pendiente=None, cuenta=0)
                    self._evento(c, antes)
            n = self._niveles[c['id']]
            if c['nivel'] != n['nivel']:
                c['nivel_actual'] = c['nivel']        # lo que se vio en este ciclo (sin confirmar)
                c['nivel'] = n['nivel']
            c['desde'] = n['desde']
        self._primero = False

    def _evento(self, c: dict, antes: str) -> None:
        if c['nivel'] in ('ok', 'apagado') and antes in ('falla', 'aviso', 'desconocido'):
            msg = f"{c['nombre']} volvió a la normalidad" + (f": {c['estado']}" if c['nivel'] == 'ok' else '')
        else:
            msg = f"{c['nombre']}: {c['estado']}"
        ev = {'t': sistema.ahora_iso(), 'componente': c['id'], 'nombre': c['nombre'], 'nivel': c['nivel'],
              'antes': antes, 'mensaje': msg}
        sistema.anexar_jsonl(sistema.DATOS / 'eventos.jsonl', ev)
        registro.info('Evento: %s', msg)
        for gancho in list(self.al_cambiar):
            try:
                gancho(ev)
            except Exception:  # noqa: BLE001
                registro.exception('Gancho al_cambiar falló')

    # ── Métricas por minuto ──
    def _metricas(self, snap: dict) -> None:
        minuto = int(time.time() // 60) * 60
        eq = snap.get('equipo') or {}
        w = snap.get('wsl') or {}
        app = next((c for c in snap['componentes'] if c['id'] == 'app'), {})
        app_ms = None
        if self._linux and (self._linux.get('app') or {}).get('codigo') == 200:
            app_ms = self._linux['app'].get('ms')
        mem_cont = sum(c['mem_mb'] or 0 for c in snap.get('contenedores') or []) or None
        muestra = {'cpu': eq.get('cpu'), 'ram_pct': eq.get('ram_pct'),
                   'wsl_ram_pct': round(w['ram_usada_mb'] / w['ram_total_mb'] * 100, 1) if w.get('ram_total_mb') else None,
                   'app_ms': app_ms, 'contenedores_mem_mb': mem_cont}
        with self._candado:
            if self._minuto is not None and minuto != self._minuto:
                self._cerrar_minuto()
            self._minuto = minuto
            for k, v in muestra.items():
                self._muestras.setdefault(k, []).append(v)
            for c in snap['componentes']:
                # Se guarda el peor nivel visto en el minuto (lo que vio la gente)
                previo = self._niveles_minuto.get(c['id'])
                letra = LETRA.get(c.get('nivel_actual', c['nivel']), 'd')
                orden = 'fadxo'
                if previo is None or orden.index(letra) < orden.index(previo):
                    self._niveles_minuto[c['id']] = letra
        _ = app
        if time.time() - self._guardado_t > 300:
            self._guardar_metricas()

    def _cerrar_minuto(self) -> None:
        self._m_t.append(self._minuto)
        n = len(self._m_t)
        for k, valores in self._muestras.items():
            v = [x for x in valores if x is not None]
            serie = self._m_series.setdefault(k, [])
            serie.extend([None] * (n - 1 - len(serie)))
            serie.append(round(sum(v) / len(v), 1) if v else None)
        for k, serie in self._m_series.items():
            serie.extend([None] * (n - len(serie)))
        for cid, letra in self._niveles_minuto.items():
            s = self._m_niveles.setdefault(cid, [])
            s.extend([''] * (n - 1 - len(s)))
            s.append(letra)
        for s in self._m_niveles.values():
            s.extend([''] * (n - len(s)))
        if n > MAX_MINUTOS:
            cortar = n - MAX_MINUTOS
            del self._m_t[:cortar]
            for s in list(self._m_series.values()) + list(self._m_niveles.values()):
                del s[:cortar]
        self._muestras, self._niveles_minuto = {}, {}

    def _guardar_metricas(self) -> None:
        with self._candado:
            datos = {'t': list(self._m_t), 'series': {k: list(v) for k, v in self._m_series.items()},
                     'niveles': {k: list(v) for k, v in self._m_niveles.items()}}
        try:
            sistema.guardar_json(sistema.DATOS / 'metricas.json', datos)
        except OSError as e:
            registro.warning('No se pudieron guardar las métricas: %s', e)
        self._guardado_t = time.time()
