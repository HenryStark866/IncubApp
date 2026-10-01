"""Panel IncubApp · trabajos en segundo plano.

Todo lo que tarda (reiniciar, respaldar, escanear la red, auditar…) corre como un
«trabajo»: la pantalla lo lanza, recibe un id y va pidiendo las líneas nuevas de su
salida hasta que termina. Así ninguna petición HTTP se queda esperando.

Dos maneras de lanzar:
  TRABAJOS.lanzar(tipo, titulo, funcion, *args)       funcion(trabajo, *args) -> resultado
  TRABAJOS.lanzar_proceso(tipo, titulo, args, ...)    programa externo con salida en vivo
  TRABAJOS.lanzar_wsl(tipo, titulo, script, ...)      script de bash en Ubuntu con salida en vivo

`exclusivo='clave'`: si ya corre un trabajo con esa clave, se devuelve ESE trabajo en vez
de lanzar otro (dos respaldos o dos escaneos a la vez no tienen sentido).
"""
from __future__ import annotations

import subprocess
import threading
import time
import uuid
from collections import deque
from typing import Any, Callable

from . import sistema
from .sistema import registro

MAX_LINEAS = 4000          # se guardan las últimas; la pantalla no necesita más
MAX_TRABAJOS = 60          # historial en memoria


class Cancelado(Exception):
    """La lanza `trabajo.revisar()` cuando alguien pidió cancelar el trabajo."""


class Trabajo:
    def __init__(self, tipo: str, titulo: str, exclusivo: str | None = None) -> None:
        self.id = uuid.uuid4().hex[:12]
        self.tipo = tipo
        self.titulo = titulo
        self.exclusivo = exclusivo
        self.estado = 'corriendo'            # corriendo | ok | error | cancelado
        self.inicio = time.time()
        self.fin: float | None = None
        self.codigo: int | None = None
        self.resultado: Any = None
        self.error: str | None = None
        self.progreso: float | None = None   # 0..1 si se sabe
        self._lineas: deque[str] = deque(maxlen=MAX_LINEAS)
        self._descartadas = 0                # líneas que ya salieron del deque
        self._cancelar = threading.Event()
        self._proceso: subprocess.Popen | None = None
        self._candado = threading.Lock()

    # ── para quien hace el trabajo ──
    def linea(self, texto: str) -> None:
        """Agrega una o varias líneas a la salida que ve la pantalla."""
        with self._candado:
            for parte in str(texto).replace('\r\n', '\n').split('\n'):
                if len(self._lineas) == self._lineas.maxlen:
                    self._descartadas += 1
                self._lineas.append(parte.rstrip('\r')[:2000])

    def avance(self, fraccion: float | None, texto: str | None = None) -> None:
        self.progreso = None if fraccion is None else max(0.0, min(1.0, float(fraccion)))
        if texto:
            self.linea(texto)

    @property
    def cancelado(self) -> bool:
        return self._cancelar.is_set()

    def revisar(self) -> None:
        """Llamar dentro de bucles largos: corta el trabajo si lo cancelaron."""
        if self._cancelar.is_set():
            raise Cancelado()

    # ── para el panel ──
    def cancelar(self) -> None:
        self._cancelar.set()
        if self._proceso and self._proceso.poll() is None:
            sistema.matar_arbol(self._proceso.pid)

    @property
    def terminado(self) -> bool:
        return self.estado != 'corriendo'

    def lineas_desde(self, desde: int = 0) -> tuple[list[str], int]:
        """Líneas a partir del número `desde` (contando desde el inicio del trabajo).
        Devuelve (líneas, total). Si `desde` ya se descartó, empieza en la más vieja que queda."""
        with self._candado:
            total = self._descartadas + len(self._lineas)
            inicio = max(0, desde - self._descartadas)
            return list(self._lineas)[inicio:], total

    def como_dict(self, desde: int = 0, con_lineas: bool = True) -> dict:
        lineas, total = self.lineas_desde(desde) if con_lineas else ([], self._descartadas + len(self._lineas))
        return {
            'id': self.id, 'tipo': self.tipo, 'titulo': self.titulo, 'estado': self.estado,
            'inicio': sistema.iso(self.inicio), 'fin': sistema.iso(self.fin),
            'segundos': round((self.fin or time.time()) - self.inicio, 1),
            'codigo': self.codigo, 'error': self.error, 'progreso': self.progreso,
            'resultado': self.resultado if self.terminado else None,
            'desde': desde, 'lineas': lineas, 'total_lineas': total,
        }

    def _terminar(self, estado: str, codigo: int | None = None, error: str | None = None) -> None:
        if self._cancelar.is_set() and estado != 'ok':
            estado = 'cancelado'
        self.estado = estado
        self.codigo = codigo
        self.error = error
        self.fin = time.time()
        if estado == 'ok':
            self.progreso = 1.0


class Trabajos:
    def __init__(self) -> None:
        self._trabajos: dict[str, Trabajo] = {}
        self._orden: deque[str] = deque()
        self._candado = threading.Lock()
        self.al_terminar: list[Callable[[Trabajo], None]] = []   # ganchos (avisos, historial)

    # ── consulta ──
    def obtener(self, id_: str) -> Trabajo | None:
        return self._trabajos.get(id_)

    def lista(self, limite: int = 30) -> list[dict]:
        with self._candado:
            ids = list(self._orden)[-limite:]
        return [self._trabajos[i].como_dict(con_lineas=False) for i in reversed(ids) if i in self._trabajos]

    def ultimo(self, tipo: str, solo_terminados: bool = False) -> Trabajo | None:
        with self._candado:
            ids = list(self._orden)
        for i in reversed(ids):
            t = self._trabajos.get(i)
            if t and t.tipo == tipo and (t.terminado or not solo_terminados):
                return t
        return None

    def corriendo(self, exclusivo: str) -> Trabajo | None:
        for t in list(self._trabajos.values()):
            if t.exclusivo == exclusivo and not t.terminado:
                return t
        return None

    def cancelar(self, id_: str) -> bool:
        t = self._trabajos.get(id_)
        if not t or t.terminado:
            return False
        t.cancelar()
        return True

    # ── lanzar ──
    def _registrar(self, t: Trabajo) -> None:
        with self._candado:
            self._trabajos[t.id] = t
            self._orden.append(t.id)
            while len(self._orden) > MAX_TRABAJOS:
                viejo = self._orden.popleft()
                tv = self._trabajos.get(viejo)
                if tv and not tv.terminado:          # nunca se olvida uno que sigue corriendo
                    self._orden.append(viejo)
                    break
                self._trabajos.pop(viejo, None)

    def _avisar_fin(self, t: Trabajo) -> None:
        registro.info('Trabajo %s (%s) terminó: %s %s', t.titulo, t.id, t.estado, t.error or '')
        for gancho in list(self.al_terminar):
            try:
                gancho(t)
            except Exception:  # noqa: BLE001
                registro.exception('Gancho al_terminar falló')

    def lanzar(self, tipo: str, titulo: str, funcion: Callable[..., Any], *args,
               exclusivo: str | None = None, **kwargs) -> Trabajo:
        """funcion(trabajo, *args, **kwargs) corre en un hilo. Lo que devuelva queda en
        trabajo.resultado (debe poder pasarse a JSON). Si lanza una excepción, el trabajo
        termina en 'error' con el mensaje (en español, idealmente)."""
        if exclusivo:
            ya = self.corriendo(exclusivo)
            if ya:
                return ya
        t = Trabajo(tipo, titulo, exclusivo)
        self._registrar(t)
        registro.info('Trabajo %s (%s) empieza', titulo, t.id)

        def correr():
            try:
                t.resultado = funcion(t, *args, **kwargs)
                t._terminar('ok', 0)
            except Cancelado:
                t.linea('— Cancelado —')
                t._terminar('cancelado')
            except Exception as e:  # noqa: BLE001
                registro.exception('Trabajo %s falló', titulo)
                t.linea(f'ERROR: {e}')
                t._terminar('error', 1, str(e))
            self._avisar_fin(t)

        threading.Thread(target=correr, name=f'trabajo-{tipo}', daemon=True).start()
        return t

    def lanzar_proceso(self, tipo: str, titulo: str, args: list[str], timeout: float = 1800,
                       entrada: str | None = None, exclusivo: str | None = None,
                       codificacion: str = 'utf-8', cwd: str | None = None,
                       al_terminar: Callable[[Trabajo], Any] | None = None) -> Trabajo:
        """Corre un programa y pasa su salida (stdout+stderr) línea a línea al trabajo.
        Termina en 'ok' si el código de salida es 0. `al_terminar(trabajo)` puede dejar un
        resultado (lo que devuelva va a trabajo.resultado)."""
        def correr(t: Trabajo):
            codigo = proceso_en_vivo(t, args, timeout=timeout, entrada=entrada,
                                     codificacion=codificacion, cwd=cwd)
            res = al_terminar(t) if al_terminar else None
            if t.cancelado:
                raise Cancelado()
            if codigo != 0:
                t.codigo = codigo
                raise RuntimeError(f'Terminó con código {codigo}')
            return res
        return self.lanzar(tipo, titulo, correr, exclusivo=exclusivo)

    def lanzar_wsl(self, tipo: str, titulo: str, script: str, timeout: float = 1800,
                   exclusivo: str | None = None,
                   al_terminar: Callable[[Trabajo], Any] | None = None) -> Trabajo:
        """Script de bash en Ubuntu (como root) con salida en vivo."""
        return self.lanzar_proceso(tipo, titulo, sistema.wsl_args(script), timeout=timeout,
                                   entrada=script.replace('\r\n', '\n'), exclusivo=exclusivo,
                                   al_terminar=al_terminar)


def proceso_en_vivo(t: Trabajo, args: list[str], timeout: float = 1800, entrada: str | None = None,
                    codificacion: str = 'utf-8', cwd: str | None = None) -> int:
    """Corre `args` mandando cada línea de su salida a `t.linea`. Devuelve el código de salida
    (-9 si se pasó del tiempo o se canceló). Se puede usar dentro de un trabajo de función
    para encadenar varios comandos."""
    if codificacion == 'oem':
        codificacion = sistema.codificacion_consola()
    try:
        p = subprocess.Popen(args, stdin=subprocess.PIPE if entrada is not None else subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=cwd,
                             env=sistema._entorno(), creationflags=sistema.SIN_VENTANA)
    except OSError as e:
        t.linea(f'No se pudo ejecutar {args[0]}: {e}')
        return -1
    t._proceso = p
    if entrada is not None:
        def escribir():
            try:
                p.stdin.write(entrada.encode('utf-8'))
                p.stdin.close()
            except OSError:
                pass
        threading.Thread(target=escribir, daemon=True).start()

    vencido = threading.Event()

    def vigilar():
        if not vencido.wait(timeout) and p.poll() is None:
            t.linea(f'(Se detuvo: pasó el tiempo límite de {timeout:g} s)')
            sistema.matar_arbol(p.pid)
    threading.Thread(target=vigilar, daemon=True).start()

    pendiente = b''
    try:
        while True:
            trozo = p.stdout.read1(4096) if hasattr(p.stdout, 'read1') else p.stdout.read(4096)
            if not trozo:
                break
            pendiente += trozo
            # Corta en \n y también en \r (barras de progreso de docker, git, curl).
            partes = pendiente.replace(b'\r\n', b'\n').replace(b'\r', b'\n').split(b'\n')
            pendiente = partes.pop()
            for parte in partes:
                texto = parte.decode(codificacion, errors='replace').replace('\x00', '')
                if texto.strip():
                    t.linea(texto)
        if pendiente.strip():
            t.linea(pendiente.decode(codificacion, errors='replace').replace('\x00', ''))
        p.wait()
    finally:
        vencido.set()
    codigo = p.returncode
    if codigo is not None and codigo > 2**31:
        codigo -= 2**32
    return codigo if codigo is not None else -9


TRABAJOS = Trabajos()
