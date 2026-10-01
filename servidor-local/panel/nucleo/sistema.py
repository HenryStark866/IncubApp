"""Panel IncubApp · utilidades comunes.

Rutas, comandos de Windows (PowerShell) y de Ubuntu (WSL), JSON en disco y el registro
del panel. Todo con la biblioteca estándar de Python: el panel no instala nada.

Reglas que cumplen todas las funciones de aquí:
  - Nunca abren una ventana de consola (el panel corre con pythonw.exe).
  - Siempre tienen tiempo límite: wsl.exe se puede quedar colgado si el servicio de WSL
    falla (Wsl/Service/0x8007274c, 29-09-2026) y el panel no se puede congelar por eso.
  - No lanzan excepciones por un comando que falla: devuelven un Resultado.
"""
from __future__ import annotations

import base64
import ctypes
import datetime as _dt
import json
import locale
import logging
import logging.handlers
import os
import shlex
import subprocess
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

# ── Rutas ────────────────────────────────────────────────────────────────────
PANEL = Path(__file__).resolve().parent.parent          # servidor-local/panel
SERVIDOR_LOCAL = PANEL.parent                            # servidor-local
RAIZ = SERVIDOR_LOCAL.parent                             # C:\IncubApp
WEB = PANEL / 'web'
WSL_DIR = PANEL / 'wsl'
# Historial, inventario, auditorías: junto a los demás registros del servidor (no se versionan).
DATOS = SERVIDOR_LOCAL / 'logs' / 'panel'
# Lo privado (la llave de sesión del panel) va en el perfil del usuario, no en C:\IncubApp,
# que cualquier usuario del equipo puede leer.
PRIVADO = Path(os.environ.get('LOCALAPPDATA') or Path.home()) / 'IncubApp-Panel'

DISTRO = 'Ubuntu-24.04'
SRV = '/opt/incubapp/server'                             # Supabase self-hosted (en Ubuntu)
URL_PUBLICA = 'https://incubapp.cdhmaker.com'
VERSION = '1.0.0'

SIN_VENTANA = getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000)
NUEVO_GRUPO = getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0x00000200)

for _d in (DATOS, PRIVADO):
    try:
        _d.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass


# ── Registro del panel ───────────────────────────────────────────────────────
def _crear_registro() -> logging.Logger:
    reg = logging.getLogger('panel')
    if reg.handlers:
        return reg
    reg.setLevel(logging.INFO)
    try:
        h = logging.handlers.RotatingFileHandler(DATOS / 'panel.txt', maxBytes=1_000_000,
                                                 backupCount=3, encoding='utf-8')
        h.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s',
                                         '%Y-%m-%d %H:%M:%S'))
        reg.addHandler(h)
    except OSError:
        reg.addHandler(logging.NullHandler())
    return reg


registro = _crear_registro()


# ── Tiempo ───────────────────────────────────────────────────────────────────
def ahora() -> _dt.datetime:
    """Hora local con zona (Colombia, -05:00 en el Lenovo)."""
    return _dt.datetime.now().astimezone()


def ahora_iso() -> str:
    return ahora().isoformat(timespec='seconds')


def iso(ts: float | None) -> str | None:
    """Epoch → texto ISO local; None si no hay fecha."""
    if ts is None:
        return None
    return _dt.datetime.fromtimestamp(ts).astimezone().isoformat(timespec='seconds')


def leer_iso(texto: str | None) -> _dt.datetime | None:
    """Texto ISO (también el de `date -Is` de Linux) → datetime con zona, o None."""
    if not texto:
        return None
    t = texto.strip().replace('Z', '+00:00')
    try:
        d = _dt.datetime.fromisoformat(t)
    except ValueError:
        return None
    return d if d.tzinfo else d.astimezone()


# ── Ejecutar comandos ────────────────────────────────────────────────────────
@dataclass
class Resultado:
    """Lo que devolvió un comando. `ok` es True solo si terminó a tiempo con código 0."""
    codigo: int
    salida: str
    error: str
    segundos: float
    agotado: bool = False   # True si se mató por pasar el tiempo límite

    @property
    def ok(self) -> bool:
        return self.codigo == 0 and not self.agotado

    @property
    def texto(self) -> str:
        """Salida y error juntos (para mostrar o registrar)."""
        return '\n'.join(x for x in (self.salida.rstrip(), self.error.rstrip()) if x)

    def como_dict(self) -> dict:
        return {'codigo': self.codigo, 'salida': self.salida, 'error': self.error,
                'segundos': round(self.segundos, 2), 'agotado': self.agotado, 'ok': self.ok}


def codificacion_consola() -> str:
    """Página de códigos de los programas de consola de Windows (ping, tracert, netsh…).
    En un Windows en español suele ser cp850; NO es UTF-8."""
    try:
        return f'cp{ctypes.windll.kernel32.GetOEMCP()}'
    except Exception:  # noqa: BLE001 — fuera de Windows (pruebas)
        return locale.getpreferredencoding(False)


def _decodificar(datos: bytes | None, codificacion: str) -> str:
    if not datos:
        return ''
    if codificacion == 'oem':
        codificacion = codificacion_consola()
    return datos.decode(codificacion, errors='replace').replace('\x00', '').replace('\r\n', '\n')


def matar_arbol(pid: int) -> None:
    """Mata un proceso y todos sus hijos (wsl.exe, powershell.exe…)."""
    try:
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(pid)], capture_output=True,
                       timeout=10, creationflags=SIN_VENTANA)
    except Exception:  # noqa: BLE001
        pass


def _entorno(extra: dict | None = None) -> dict:
    env = dict(os.environ)
    env['WSL_UTF8'] = '1'          # mensajes propios de wsl.exe en UTF-8 (no UTF-16)
    env['PYTHONIOENCODING'] = 'utf-8'
    if extra:
        env.update(extra)
    return env


def ejecutar(args: list[str], timeout: float = 30, entrada: str | bytes | None = None,
             cwd: str | Path | None = None, env: dict | None = None,
             codificacion: str = 'utf-8') -> Resultado:
    """Corre un programa sin ventana y con tiempo límite. Nunca lanza excepción.

    codificacion: 'utf-8' (WSL, PowerShell de este módulo, Python) u 'oem' para los
    programas de consola de Windows (ping, tracert, nslookup, netsh, arp…).
    """
    t0 = time.monotonic()
    if isinstance(entrada, str):
        entrada = entrada.encode('utf-8')
    try:
        p = subprocess.Popen(args, stdin=subprocess.PIPE if entrada is not None else subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=cwd,
                             env=_entorno(env), creationflags=SIN_VENTANA)
    except OSError as e:
        return Resultado(-1, '', f'No se pudo ejecutar {args[0]}: {e}', time.monotonic() - t0)
    agotado = False
    try:
        out, err = p.communicate(entrada, timeout=timeout)
    except subprocess.TimeoutExpired:
        agotado = True
        matar_arbol(p.pid)
        try:
            out, err = p.communicate(timeout=5)
        except Exception:  # noqa: BLE001
            out, err = b'', b''
    codigo = p.returncode if p.returncode is not None else -9
    if agotado:
        codigo = -9
    # wsl.exe devuelve 4294967295 (-1 sin signo) cuando falla él mismo.
    if codigo > 2**31:
        codigo -= 2**32
    r = Resultado(codigo, _decodificar(out, codificacion), _decodificar(err, codificacion),
                  time.monotonic() - t0, agotado)
    if agotado:
        r.error = (r.error + f'\n(Se detuvo: pasó el tiempo límite de {timeout:g} s)').strip()
    return r


# ── Ubuntu (WSL) ─────────────────────────────────────────────────────────────
# El script viaja por la entrada estándar y bash lo corre con la entrada en /dev/null:
# no hay comillas que escapar entre Windows y bash, y un comando del script que lea la
# entrada (docker exec -i, read…) no se come el resto del script.
_ARRANQUE_BASH = 's=$(cat); exec bash -c "$s" panel </dev/null'


def wsl(script: str, timeout: float = 30, usuario: str = 'root') -> Resultado:
    """Corre un script de bash dentro de Ubuntu como `usuario` (root por defecto).

    Para meter valores dentro del script use `q()` (shlex.quote), nunca f-strings sin citar.
    """
    script = script.replace('\r\n', '\n')
    return ejecutar(['wsl.exe', '-d', DISTRO, '-u', usuario, '--exec', 'bash', '-c', _ARRANQUE_BASH],
                    timeout=timeout, entrada=script)


def wsl_json(script: str, timeout: float = 30) -> tuple[Any, Resultado]:
    """Como wsl(), pero interpreta la salida como JSON. Devuelve (objeto o None, Resultado)."""
    r = wsl(script, timeout)
    return _json_de(r.salida), r


def wsl_args(script: str) -> list[str]:
    """Argumentos para lanzar un script de bash en Ubuntu con Popen (trabajos con salida en
    vivo). El script se manda por la entrada estándar, igual que en wsl()."""
    return ['wsl.exe', '-d', DISTRO, '-u', 'root', '--exec', 'bash', '-c', _ARRANQUE_BASH]


def q(valor: Any) -> str:
    """Cita un valor para meterlo en un script de bash sin riesgo de inyección."""
    return shlex.quote(str(valor))


def a_wsl(ruta: str | Path) -> str:
    """C:\\IncubApp\\servidor-local → /mnt/c/IncubApp/servidor-local"""
    p = str(ruta)
    if len(p) >= 2 and p[1] == ':':
        return '/mnt/' + p[0].lower() + p[2:].replace('\\', '/')
    return p.replace('\\', '/')


# ── Windows (PowerShell 5.1) ─────────────────────────────────────────────────
_PREAMBULO_PS = (
    "$ProgressPreference='SilentlyContinue';"
    "$ErrorActionPreference='Continue';"
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8;"
    "$OutputEncoding=[Text.Encoding]::UTF8;\n"
)


def powershell(script: str, timeout: float = 30) -> Resultado:
    """Corre un script de PowerShell 5.1 (sin perfil, sin ventana) y devuelve su salida en UTF-8."""
    completo = _PREAMBULO_PS + script
    if len(completo) < 8000:
        cod = base64.b64encode(completo.encode('utf-16-le')).decode('ascii')
        args = ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                '-EncodedCommand', cod]
        return ejecutar(args, timeout=timeout)
    # Scripts largos: por archivo temporal (la línea de comandos de Windows tiene límite).
    ruta = _temporal('.ps1', '\ufeff' + completo)
    try:
        return ejecutar(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                         '-File', str(ruta)], timeout=timeout)
    finally:
        _borrar(ruta)


def powershell_json(script: str, timeout: float = 30) -> tuple[Any, Resultado]:
    """Como powershell(); el script debe terminar en `| ConvertTo-Json -Depth 6 -Compress`.
    Devuelve (objeto o None, Resultado). Ojo: ConvertTo-Json de un solo elemento NO da lista;
    use `lista()` sobre el resultado cuando espere varios."""
    r = powershell(script, timeout)
    return _json_de(r.salida), r


def powershell_admin(script: str, timeout: float = 300) -> Resultado:
    """Corre un script de PowerShell COMO ADMINISTRADOR: Windows muestra el aviso de permiso
    (UAC) en la pantalla y alguien debe aceptarlo. Devuelve la salida del script.
    Si nadie acepta o se cancela, devuelve codigo=1223 y un error en español."""
    # El script elevado no debe usar `exit`: escribe su salida y, si algo falla, una línea
    # que empiece por «ERROR:». Esa salida se lee de un archivo temporal del perfil.
    salida = PRIVADO / 'tmp' / f'admin-{uuid.uuid4().hex}.txt'
    salida.parent.mkdir(parents=True, exist_ok=True)

    def cita(valor) -> str:
        return "'" + str(valor).replace("'", "''") + "'"

    interno = (_PREAMBULO_PS
               + f"$salidaPanel = {cita(salida)}\n"
               + "& {\n try {\n" + script + "\n } catch { Write-Output ('ERROR: ' + $_.Exception.Message) }\n"
               + "} *>&1 | Out-File -Encoding utf8 -FilePath $salidaPanel\n")
    ruta = _temporal('.ps1', '\ufeff' + interno)
    envoltura = (
        "try {\n"
        "  $p = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop "
        f"-ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', ('\"' + {cita(ruta)} + '\"'))\n"
        "  exit $p.ExitCode\n"
        "} catch { Write-Output 'CANCELADO'; exit 1223 }\n"
    )
    r = powershell(envoltura, timeout)
    try:
        texto = salida.read_text(encoding='utf-8-sig', errors='replace') if salida.exists() else ''
    finally:
        _borrar(ruta)
        _borrar(salida)
    if r.codigo == 1223 or 'CANCELADO' in r.salida:
        return Resultado(1223, '', 'No se dio el permiso de administrador (se canceló el aviso de Windows).',
                         r.segundos, r.agotado)
    texto = texto.replace('\r\n', '\n')
    codigo = r.codigo
    if codigo == 0 and any(lin.startswith('ERROR:') for lin in texto.splitlines()):
        codigo = 1
    return Resultado(codigo, texto, r.error, r.segundos, r.agotado)


def lista(valor: Any) -> list:
    """ConvertTo-Json devuelve un objeto suelto cuando hay un solo elemento: esto siempre da lista."""
    if valor is None:
        return []
    return valor if isinstance(valor, list) else [valor]


def _json_de(texto: str) -> Any:
    t = (texto or '').strip()
    if not t:
        return None
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        # Algún aviso suelto antes del JSON: se toma desde el primer { o [.
        for marca in ('{', '['):
            i = t.find(marca)
            if i > 0:
                try:
                    return json.loads(t[i:])
                except json.JSONDecodeError:
                    pass
        return None


def _temporal(sufijo: str, contenido: str) -> Path:
    d = PRIVADO / 'tmp'
    d.mkdir(parents=True, exist_ok=True)
    fd, nombre = tempfile.mkstemp(suffix=sufijo, dir=d)
    with os.fdopen(fd, 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(contenido)
    return Path(nombre)


def _borrar(ruta: Path) -> None:
    try:
        ruta.unlink(missing_ok=True)
    except OSError:
        pass


# ── JSON en disco ────────────────────────────────────────────────────────────
_candado_disco = threading.Lock()


def leer_json(ruta: Path, defecto: Any = None) -> Any:
    try:
        with open(ruta, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def guardar_json(ruta: Path, datos: Any) -> None:
    """Escribe de forma atómica (archivo temporal + reemplazo): un corte de luz no deja el
    archivo a medias."""
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(ruta.suffix + '.tmp')
    with _candado_disco:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ruta)


def anexar_jsonl(ruta: Path, registro_: dict, max_bytes: int = 5_000_000) -> None:
    """Agrega una línea JSON. Si el archivo pasa de max_bytes, se queda con la mitad más nueva."""
    ruta.parent.mkdir(parents=True, exist_ok=True)
    linea = json.dumps(registro_, ensure_ascii=False) + '\n'
    with _candado_disco:
        try:
            if ruta.exists() and ruta.stat().st_size > max_bytes:
                lineas = ruta.read_text(encoding='utf-8', errors='replace').splitlines(True)
                ruta.write_text(''.join(lineas[len(lineas) // 2:]), encoding='utf-8')
            with open(ruta, 'a', encoding='utf-8') as f:
                f.write(linea)
        except OSError as e:
            registro.warning('No se pudo escribir %s: %s', ruta, e)


def leer_jsonl(ruta: Path, ultimas: int = 500) -> list[dict]:
    try:
        lineas = ruta.read_text(encoding='utf-8', errors='replace').splitlines()
    except OSError:
        return []
    salida = []
    for linea in lineas[-ultimas:]:
        try:
            salida.append(json.loads(linea))
        except ValueError:
            pass
    return salida


# ── Caché sencilla con tiempo de vida ────────────────────────────────────────
class Memo:
    """Guarda el resultado de funciones lentas durante `ttl` segundos.
    memo.obtener('clave', 30, funcion) → corre `funcion()` solo si el valor caducó."""

    def __init__(self) -> None:
        self._datos: dict[str, tuple[float, Any]] = {}
        self._candados: dict[str, threading.Lock] = {}
        self._candado = threading.Lock()

    def obtener(self, clave: str, ttl: float, funcion: Callable[[], Any]) -> Any:
        ahora_ = time.monotonic()
        dato = self._datos.get(clave)
        if dato and ahora_ - dato[0] < ttl:
            return dato[1]
        with self._candado:
            cand = self._candados.setdefault(clave, threading.Lock())
        with cand:
            dato = self._datos.get(clave)
            if dato and time.monotonic() - dato[0] < ttl:
                return dato[1]
            valor = funcion()
            self._datos[clave] = (time.monotonic(), valor)
            return valor

    def olvidar(self, clave: str | None = None) -> None:
        if clave is None:
            self._datos.clear()
        else:
            self._datos.pop(clave, None)


memo = Memo()


# ── Varios ───────────────────────────────────────────────────────────────────
def hilo(funcion: Callable, *args, nombre: str | None = None, **kwargs) -> threading.Thread:
    """Arranca un hilo en segundo plano que registra (y no deja morir en silencio) sus errores."""
    def envoltura():
        try:
            funcion(*args, **kwargs)
        except Exception:  # noqa: BLE001
            registro.exception('Error en el hilo %s', nombre or getattr(funcion, '__name__', '?'))
    t = threading.Thread(target=envoltura, name=nombre or getattr(funcion, '__name__', 'hilo'), daemon=True)
    t.start()
    return t


def tamano_legible(n: float | None) -> str:
    if n is None:
        return '—'
    for unidad in ('B', 'KB', 'MB', 'GB', 'TB'):
        if abs(n) < 1024 or unidad == 'TB':
            return f'{n:.0f} {unidad}' if unidad in ('B', 'KB') else f'{n:.1f} {unidad}'
        n /= 1024
    return f'{n:.1f} TB'


def duracion_legible(segundos: float | None) -> str:
    """3725 → '1 h 2 min'."""
    if segundos is None:
        return '—'
    s = int(max(0, segundos))
    d, s = divmod(s, 86400)
    h, s = divmod(s, 3600)
    m, s = divmod(s, 60)
    if d:
        return f'{d} d {h} h'
    if h:
        return f'{h} h {m} min'
    if m:
        return f'{m} min'
    return f'{s} s'


@dataclass
class Ajustes:
    """Ajustes del panel (logs/panel/ajustes.json). Los cambia la pantalla «Ajustes»."""
    intervalo_rapido_s: int = 10        # estado de contenedores y respuestas HTTP
    intervalo_completo_s: int = 90      # recursos, base de datos, túnel, respaldo, git, URL pública
    notificaciones: bool = True         # avisos de Windows cuando algo se cae o vuelve
    url_publica: str = URL_PUBLICA
    red_escanear: str = 'auto'          # 'auto' = la red del adaptador con puerta de enlace, o '192.168.5.0/24'
    escaneo_red_min: int = 30           # cada cuánto buscar equipos nuevos en la red (0 = nunca)
    auditoria_min: int = 360            # cada cuánto repetir la auditoría de seguridad (0 = nunca)
    monitor_internet: bool = True       # medir latencia/pérdida hacia la puerta de enlace e internet
    intervalo_internet_s: int = 30
    abrir_al_iniciar: bool = True       # abrir la ventana al iniciar sesión en Windows
    extra: dict = field(default_factory=dict)

    RUTA = DATOS / 'ajustes.json'

    @classmethod
    def cargar(cls) -> 'Ajustes':
        datos = leer_json(cls.RUTA, {}) or {}
        a = cls()
        for k, v in datos.items():
            if hasattr(a, k) and k != 'RUTA' and isinstance(v, type(getattr(a, k))):
                setattr(a, k, v)
        return a

    def guardar(self) -> None:
        guardar_json(self.RUTA, self.como_dict())

    def como_dict(self) -> dict:
        return {k: getattr(self, k) for k in self.__dataclass_fields__}

    def actualizar(self, cambios: dict) -> list[str]:
        """Aplica solo claves conocidas y del tipo correcto; devuelve las que cambió."""
        cambiadas = []
        for k, v in (cambios or {}).items():
            if k in self.__dataclass_fields__ and k != 'extra':
                actual = getattr(self, k)
                if isinstance(actual, bool):
                    v = bool(v)
                elif isinstance(actual, int):
                    try:
                        v = int(v)
                    except (TypeError, ValueError):
                        continue
                    if v < 0:
                        continue
                elif isinstance(actual, str):
                    v = str(v).strip()[:300]
                if v != actual:
                    setattr(self, k, v)
                    cambiadas.append(k)
        if cambiadas:
            self.guardar()
        return cambiadas
