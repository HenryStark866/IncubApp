"""Panel IncubApp · red de la empresa.

- MonitorRed: cada `intervalo_internet_s` mide la puerta de enlace, 1.1.1.1, 8.8.8.8 y el DNS
  (ICMP con IcmpSendEcho de Windows por ctypes: no abre procesos ni pide administrador) y
  vigila que la MAC de la puerta de enlace no cambie (suplantación ARP).
- Descubrimiento de equipos con SendARP (contesta aunque el equipo bloquee el ping),
  inventario por MAC, fabricante (base de Wireshark, se descarga a pedido), nombre DNS/NetBIOS.
- Escaneo de puertos (TCP connect), auditoría de la red y herramientas (ping, traceroute,
  DNS, HTTP, puerto, Wake-on-LAN, UPnP).
Todo lo que viene de la red (nombres, títulos web) es texto NO confiable: la pantalla lo
muestra como texto, nunca como HTML.
"""
from __future__ import annotations

import ctypes
import ipaddress
import json
import random
import re
import socket
import ssl
import struct
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from ctypes import wintypes

from . import puertos_conocidos, sistema, trabajos
from .sistema import registro

INVENTARIO = sistema.DATOS / 'red-dispositivos.json'
CALIDAD = sistema.DATOS / 'red-calidad.json'
AUDITORIA = sistema.DATOS / 'red-auditoria.json'
FABRICANTES = sistema.DATOS / 'fabricantes.txt'
_candado = threading.RLock()

RE_HOST = re.compile(r'^[A-Za-z0-9.-]{1,253}$')
RE_MAC = re.compile(r'^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$')


# ── Validación ───────────────────────────────────────────────────────────────
def validar_host(host: str) -> str:
    host = str(host or '').strip()
    try:
        return str(ipaddress.IPv4Address(host))
    except ValueError:
        pass
    if not RE_HOST.match(host) or host.startswith(('-', '.')) or '..' in host:
        raise ValueError('Escriba una dirección IP (por ejemplo 192.168.5.1) o un nombre válido.')
    return host


def validar_mac(mac: str) -> str:
    mac = str(mac or '').strip()
    if not RE_MAC.match(mac):
        raise ValueError('La MAC no es válida (formato AA:BB:CC:DD:EE:FF).')
    return mac.upper().replace('-', ':')


def validar_red(red: str) -> ipaddress.IPv4Network:
    try:
        n = ipaddress.IPv4Network(str(red).strip(), strict=False)
    except ValueError as e:
        raise ValueError('La red no es válida (por ejemplo 192.168.5.0/24).') from e
    if not n.is_private:
        raise ValueError('Solo se pueden escanear redes privadas de la empresa.')
    if n.prefixlen < 22:
        raise ValueError('La red es demasiado grande (máximo /22, 1022 equipos).')
    return n


def validar_herramienta(tipo: str, params: dict) -> None:
    if tipo not in HERRAMIENTAS:
        raise ValueError('Esa herramienta no existe.')
    if tipo in ('ping', 'traceroute', 'puerto'):
        validar_host(params.get('host'))
    if tipo == 'puerto':
        p = int(params.get('puerto') or 0)
        if not 1 <= p <= 65535:
            raise ValueError('El puerto debe estar entre 1 y 65535.')
    if tipo == 'dns' and not RE_HOST.match(str(params.get('nombre') or '')):
        raise ValueError('Escriba un nombre de dominio válido.')
    if tipo == 'http':
        u = str(params.get('url') or '')
        if not re.match(r'^https?://[A-Za-z0-9.-]{1,253}(:\d{1,5})?(/[^\s]*)?$', u):
            raise ValueError('Escriba una dirección que empiece por http:// o https://')
    if tipo == 'wol':
        validar_mac(params.get('mac'))


# ── ICMP y ARP de Windows (ctypes) ───────────────────────────────────────────
_ip = ctypes.windll.iphlpapi
_ip.IcmpCreateFile.restype = wintypes.HANDLE
_ip.IcmpSendEcho.argtypes = [wintypes.HANDLE, ctypes.c_ulong, ctypes.c_void_p, ctypes.c_ushort, ctypes.c_void_p,
                             ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong]
_ip.IcmpCloseHandle.argtypes = [wintypes.HANDLE]
_ip.SendARP.argtypes = [ctypes.c_ulong, ctypes.c_ulong, ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]


def _ip_a_entero(ip: str) -> int:
    return struct.unpack('<I', socket.inet_aton(ip))[0]


def ping_icmp(ip: str, timeout_ms: int = 1000) -> float | None:
    """Milisegundos de ida y vuelta, o None si no respondió."""
    try:
        destino = _ip_a_entero(socket.gethostbyname(ip))
    except OSError:
        return None
    h = _ip.IcmpCreateFile()
    if not h or h == -1:
        return None
    try:
        datos = b'PanelIncubApp'
        buf = ctypes.create_string_buffer(256)
        t0 = time.perf_counter()
        n = _ip.IcmpSendEcho(h, destino, datos, len(datos), None, buf, 256, timeout_ms)
        if n <= 0:
            return None
        _, estado, rtt = struct.unpack_from('<III', buf.raw, 0)
        if estado != 0:
            return None
        return float(rtt) if rtt else round((time.perf_counter() - t0) * 1000, 1)
    finally:
        _ip.IcmpCloseHandle(h)


def mac_de(ip: str) -> str | None:
    """MAC de un equipo de la red local por ARP (aunque bloquee el ping)."""
    mac = (ctypes.c_ulong * 2)()
    largo = ctypes.c_ulong(6)
    if _ip.SendARP(_ip_a_entero(ip), 0, ctypes.byref(mac), ctypes.byref(largo)) != 0 or largo.value != 6:
        return None
    b = bytes(mac)[:6]
    if b == b'\x00' * 6:
        return None
    return ':'.join(f'{x:02X}' for x in b)


def mac_aleatoria(mac: str) -> bool:
    try:
        return bool(int(mac.split(':')[0], 16) & 0x02)
    except (ValueError, AttributeError):
        return False


# ── Interfaces ───────────────────────────────────────────────────────────────
PS_INTERFACES = r'''
@(Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4Address } | ForEach-Object {
  $ip = $_.IPv4Address | Select-Object -First 1
  @{ nombre=$_.InterfaceAlias; ip=$ip.IPAddress; prefijo=$ip.PrefixLength;
     puerta=($_.IPv4DefaultGateway | Select-Object -First 1).NextHop; dns=@($_.DNSServer | Where-Object AddressFamily -eq 2 | ForEach-Object { $_.ServerAddresses }) | Select-Object -Unique;
     mac=$_.NetAdapter.MacAddress; tipo=[string]$_.NetAdapter.MediaType; estado=[string]$_.NetAdapter.Status; metrica=$_.IPv4Interface.InterfaceMetric } }) | ConvertTo-Json -Depth 4 -Compress
'''


def interfaces() -> list[dict]:
    def leer():
        datos, _ = sistema.powershell_json(PS_INTERFACES, timeout=90)
        res = []
        for x in sistema.lista(datos):
            if not x.get('ip') or str(x['ip']).startswith('169.254.'):
                continue
            try:
                red = str(ipaddress.IPv4Network(f"{x['ip']}/{x.get('prefijo') or 24}", strict=False))
            except ValueError:
                red = None
            mascara = str(ipaddress.IPv4Network(f"0.0.0.0/{x.get('prefijo') or 24}").netmask)
            res.append({'nombre': x.get('nombre'), 'ip': x.get('ip'), 'mascara': mascara, 'prefijo': x.get('prefijo'),
                        'red': red, 'puerta': x.get('puerta') or None,
                        'dns': [d for d in sistema.lista(x.get('dns')) if isinstance(d, str) and d],
                        'mac': (x.get('mac') or '').replace('-', ':') or None, 'tipo': x.get('tipo'),
                        'metrica': x.get('metrica')})
        # Primero el adaptador con puerta de enlace y menor métrica (la salida por defecto)
        res.sort(key=lambda i: (i['puerta'] is None, i.get('metrica') or 9999, 'ethernet' not in str(i['nombre']).lower()))
        return res
    return sistema.memo.obtener('red:interfaces', 300, leer)


def principal() -> dict | None:
    lst = interfaces()
    return next((i for i in lst if i['puerta']), lst[0] if lst else None)


def red_auto() -> ipaddress.IPv4Network | None:
    i = principal()
    if not i or not i.get('red'):
        return None
    n = ipaddress.IPv4Network(i['red'])
    if n.prefixlen < 22:      # redes enormes: solo el /24 propio
        n = ipaddress.IPv4Network(f"{i['ip']}/24", strict=False)
    return n


# ── DNS (consulta propia por UDP) ────────────────────────────────────────────
def consulta_dns(nombre: str, servidor: str, timeout: float = 2.0) -> tuple[list[str] | None, float | None, str | None]:
    """(lista de IPv4, ms, error). Lista vacía = no existe (NXDOMAIN) o sin registros A."""
    tid = random.randint(0, 0xFFFF)
    q = struct.pack('>HHHHHH', tid, 0x0100, 1, 0, 0, 0)
    for parte in nombre.strip('.').split('.'):
        q += bytes([len(parte)]) + parte.encode('idna')
    q += b'\x00' + struct.pack('>HH', 1, 1)
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(timeout)
    t0 = time.perf_counter()
    try:
        s.sendto(q, (servidor, 53))
        r, _ = s.recvfrom(2048)
    except OSError as e:
        return None, None, str(e) or 'sin respuesta'
    finally:
        s.close()
    ms = round((time.perf_counter() - t0) * 1000, 1)
    if len(r) < 12 or struct.unpack('>H', r[:2])[0] != tid:
        return None, ms, 'respuesta inválida'
    rcode = r[3] & 0x0F
    if rcode == 3:
        return [], ms, 'NXDOMAIN'
    qd, an = struct.unpack('>HH', r[4:8])
    i = 12

    def saltar_nombre(i):
        while i < len(r):
            n = r[i]
            if n == 0:
                return i + 1
            if n & 0xC0 == 0xC0:
                return i + 2
            i += n + 1
        return i
    for _ in range(qd):
        i = saltar_nombre(i) + 4
    ips = []
    for _ in range(an):
        i = saltar_nombre(i)
        if i + 10 > len(r):
            break
        tipo, _, _, largo = struct.unpack('>HHIH', r[i:i + 10])
        i += 10
        if tipo == 1 and largo == 4:
            ips.append(socket.inet_ntoa(r[i:i + 4]))
        i += largo
    return ips, ms, None


# ── NetBIOS (nombre de equipos Windows) ──────────────────────────────────────
def nombre_netbios(ip: str, timeout: float = 1.0) -> str | None:
    pregunta = struct.pack('>HHHHHH', random.randint(0, 0xFFFF), 0, 1, 0, 0, 0)
    pregunta += b'\x20' + b'CK' + b'A' * 30 + b'\x00' + struct.pack('>HH', 0x21, 1)
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(timeout)
    try:
        s.sendto(pregunta, (ip, 137))
        r, _ = s.recvfrom(2048)
    except OSError:
        return None
    finally:
        s.close()
    try:
        i = 12 + 34 + 4 + 4 + 2       # cabecera + nombre + tipo/clase + ttl + largo
        n = r[i]
        i += 1
        for _ in range(n):
            nombre = r[i:i + 15].decode('latin-1').strip()
            sufijo, banderas = r[i + 15], struct.unpack('>H', r[i + 16:i + 18])[0]
            i += 18
            if sufijo == 0 and not banderas & 0x8000 and nombre:
                return re.sub(r'[^\w.-]', '', nombre)[:40] or None
    except (IndexError, struct.error):
        return None
    return None


def nombre_dns(ip: str) -> str | None:
    try:
        n = socket.gethostbyaddr(ip)[0]
        return re.sub(r'[^\w.-]', '', n)[:80] or None
    except OSError:
        return None


# ── Fabricantes ──────────────────────────────────────────────────────────────
_FAB: dict[int, dict[str, str]] | None = None


def _cargar_fabricantes() -> dict[int, dict[str, str]]:
    global _FAB
    if _FAB is not None:
        return _FAB
    tablas: dict[int, dict[str, str]] = {6: {}, 7: {}, 9: {}}
    try:
        for linea in FABRICANTES.read_text(encoding='utf-8', errors='replace').splitlines():
            if not linea or linea.startswith('#'):
                continue
            p = linea.split('\t')
            if len(p) < 2:
                continue
            pref, _, bits = p[0].partition('/')
            hexa = pref.replace(':', '').replace('-', '').upper()
            n = {'28': 7, '36': 9}.get(bits, 6)
            tablas[n][hexa[:n]] = (p[2] if len(p) > 2 and p[2] else p[1]).strip()[:60]
    except OSError:
        pass
    _FAB = tablas
    return tablas


def fabricante(mac: str | None) -> str | None:
    if not mac:
        return None
    if mac_aleatoria(mac):
        return 'MAC aleatoria (celular o tableta)'
    h = mac.replace(':', '').upper()
    t = _cargar_fabricantes()
    for n in (9, 7, 6):
        if h[:n] in t[n]:
            return t[n][h[:n]]
    return None


def actualizar_fabricantes(trabajo: trabajos.Trabajo) -> dict:
    global _FAB
    fuentes = [('https://www.wireshark.org/download/automated/data/manuf', 'manuf'),
               ('https://standards-oui.ieee.org/oui/oui.csv', 'ieee')]
    for url, tipo in fuentes:
        trabajo.linea(f'Descargando {url} …')
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'PanelIncubApp/1.0'}), timeout=60) as r:
                datos = r.read(30_000_000).decode('utf-8', 'replace')
        except Exception as e:  # noqa: BLE001
            trabajo.linea(f'  No se pudo: {e}')
            continue
        if tipo == 'ieee':
            lineas = []
            for x in datos.splitlines()[1:]:
                m = re.match(r'^[^,]*,([0-9A-F]{6}),"?([^",]+)', x)
                if m:
                    a = m.group(1)
                    lineas.append(f'{a[:2]}:{a[2:4]}:{a[4:]}\t{m.group(2)}\t{m.group(2)}')
            datos = '\n'.join(lineas)
        n = sum(1 for x in datos.splitlines() if x and not x.startswith('#'))
        if n < 1000:
            trabajo.linea('  El archivo no parece una base de fabricantes; se prueba la otra fuente.')
            continue
        FABRICANTES.write_text(datos, encoding='utf-8')
        _FAB = None
        trabajo.linea(f'Listo: {n} fabricantes.')
        # Completa el inventario con los fabricantes nuevos
        with _candado:
            inv = _leer_inventario()
            for d in inv['dispositivos'].values():
                d['fabricante'] = fabricante(d.get('mac')) or d.get('fabricante')
            _guardar_inventario(inv)
        return {'fabricantes': n, 'fuente': url}
    raise RuntimeError('No se pudo descargar la base de fabricantes (¿hay internet?).')


# ── Inventario ───────────────────────────────────────────────────────────────
def _leer_inventario() -> dict:
    d = sistema.leer_json(INVENTARIO, None)
    if not isinstance(d, dict) or 'dispositivos' not in d:
        d = {'dispositivos': {}, 'puerta_mac': None, 'ultimo_escaneo': None}
    return d


def _guardar_inventario(d: dict) -> None:
    sistema.guardar_json(INVENTARIO, d)


def _tipo(d: dict, puerta: str | None) -> str:
    puertos = set(d.get('puertos') or [])
    fab = (d.get('fabricante') or '').lower()
    if d.get('ip') == puerta:
        return 'router'
    if puertos & {554, 34567, 37777} or any(x in fab for x in ('hikvision', 'dahua', 'axis', 'uniview', 'ezviz', 'reolink')):
        return 'camara'
    if puertos & {9100, 631, 515} or any(x in fab for x in ('epson', 'brother', 'canon', 'zebra', 'lexmark', 'kyocera', 'ricoh', 'xerox')):
        return 'impresora'
    if puertos & {502, 102, 44818, 4840, 20000, 47808} or any(x in fab for x in ('siemens', 'rockwell', 'schneider', 'omron', 'wago', 'phoenix', 'beckhoff', 'moxa')):
        return 'plc'
    if d.get('mac_aleatoria') or any(x in fab for x in ('apple', 'samsung', 'xiaomi', 'huawei', 'motorola', 'oppo', 'vivo', 'realme', 'oneplus')):
        return 'celular'
    if puertos & {3389, 445, 139} or any(x in fab for x in ('dell', 'lenovo', 'hewlett', 'asus', 'acer', 'intel', 'micro-star', 'gigabyte')):
        return 'pc'
    if any(x in fab for x in ('tp-link', 'ubiquiti', 'mikrotik', 'cisco', 'aruba', 'netgear', 'd-link', 'zte', 'tenda')):
        return 'red'
    return 'desconocido'


def inventario() -> list[dict]:
    with _candado:
        inv = _leer_inventario()
    p = principal() or {}
    lista = []
    for d in inv['dispositivos'].values():
        d = dict(d)
        d['tipo'] = _tipo(d, p.get('puerta'))
        lista.append(d)
    lista.sort(key=lambda d: tuple(int(x) for x in str(d.get('ip') or '0.0.0.0').split('.')))
    return lista


def actualizar_dispositivo(mac: str, nombre=None, notas=None, conocido=None) -> dict:
    mac = validar_mac(mac)
    with _candado:
        inv = _leer_inventario()
        d = inv['dispositivos'].get(mac)
        if not d:
            raise ValueError('Ese equipo no está en el inventario.')
        if nombre is not None:
            d['nombre'] = str(nombre).strip()[:80] or None
        if notas is not None:
            d['notas'] = str(notas).strip()[:500] or None
        if conocido is not None:
            d['conocido'] = bool(conocido)
        _guardar_inventario(inv)
    return d


def olvidar_dispositivo(mac: str) -> bool:
    mac = validar_mac(mac)
    with _candado:
        inv = _leer_inventario()
        ok = inv['dispositivos'].pop(mac, None) is not None
        _guardar_inventario(inv)
    return ok


def escanear_red(trabajo: trabajos.Trabajo, red: str | None = None) -> dict:
    t0 = time.time()
    n = validar_red(red) if red else red_auto()
    if not n:
        raise RuntimeError('No se encontró la red de la empresa (ningún adaptador con puerta de enlace).')
    p = principal() or {}
    hosts = [str(h) for h in n.hosts()]
    trabajo.linea(f'Buscando equipos en {n} ({len(hosts)} direcciones)…')
    vivos: dict[str, dict] = {}
    hechos = 0
    with ThreadPoolExecutor(max_workers=64) as ex:
        futuros = {ex.submit(lambda ip: (mac_de(ip), ping_icmp(ip, 600)), ip): ip for ip in hosts}
        for f in as_completed(futuros):
            ip = futuros[f]
            hechos += 1
            if hechos % 32 == 0:
                trabajo.avance(0.7 * hechos / len(hosts), None)
            mac, ms = f.result()
            if ip == p.get('ip'):
                mac = mac or (p.get('mac') or '').upper() or None
            if mac:
                vivos[ip] = {'mac': mac, 'ms': ms}
    trabajo.revisar()
    trabajo.linea(f'{len(vivos)} equipos responden. Buscando sus nombres…')
    with ThreadPoolExecutor(max_workers=32) as ex:
        nb = {ip: ex.submit(nombre_netbios, ip) for ip in vivos}
        dn = {ip: ex.submit(nombre_dns, ip) for ip in vivos}
        for ip in vivos:
            try:
                vivos[ip]['nombre_red'] = nb[ip].result(timeout=3) or dn[ip].result(timeout=4)
            except Exception:  # noqa: BLE001
                vivos[ip]['nombre_red'] = None
    trabajo.avance(0.95, None)
    ahora = sistema.ahora_iso()
    with _candado:
        inv = _leer_inventario()
        primera_vez = not inv['dispositivos']
        nuevos = []
        for d in inv['dispositivos'].values():
            d['en_linea'] = False
        macs_ip: dict[str, list[str]] = {}
        for ip, v in vivos.items():
            mac = v['mac']
            macs_ip.setdefault(mac, []).append(ip)
            d = inv['dispositivos'].get(mac)
            if not d:
                d = {'mac': mac, 'nombre': None, 'notas': None, 'conocido': False, 'primera_vez': ahora, 'ips': [], 'puertos': []}
                inv['dispositivos'][mac] = d
                if not primera_vez:
                    nuevos.append(d)
            d.update(ip=ip, ultima_vez=ahora, en_linea=True, ms=v.get('ms'), mac_aleatoria=mac_aleatoria(mac),
                     fabricante=fabricante(mac) or d.get('fabricante'), nombre_red=v.get('nombre_red') or d.get('nombre_red'))
            if ip not in d['ips']:
                d['ips'] = (d['ips'] + [ip])[-5:]
        if p.get('puerta') in vivos:
            mac_p = vivos[p['puerta']]['mac']
            inv['puerta_mac_anterior'] = inv.get('puerta_mac') if inv.get('puerta_mac') != mac_p else inv.get('puerta_mac_anterior')
            inv['puerta_mac'] = inv.get('puerta_mac') or mac_p
        inv['duplicadas'] = {m: ips for m, ips in macs_ip.items() if len(ips) > 1}
        inv['ultimo_escaneo'] = ahora
        inv['red'] = str(n)
        _guardar_inventario(inv)
    lista = inventario()
    en_linea = [d for d in lista if d.get('en_linea')]
    for d in en_linea:
        trabajo.linea(f"  {d['ip']:15} {d['mac']}  {d.get('fabricante') or '—':30.30}  {d.get('nombre_red') or ''}")
    if nuevos:
        trabajo.linea(f'NUEVOS en la red: {len(nuevos)}')
    if inv.get('duplicadas'):
        trabajo.linea(f"ATENCIÓN: la misma MAC en varias IP: {inv['duplicadas']}")
    return {'red': str(n), 'generado': ahora, 'segundos': round(time.time() - t0, 1), 'dispositivos': en_linea,
            'nuevos': [d for d in lista if d['mac'] in {x['mac'] for x in nuevos}], 'primera_vez': primera_vez}


# ── Puertos ──────────────────────────────────────────────────────────────────
def _titulo_web(host: str, puerto: int) -> tuple[str | None, str | None]:
    esquema = 'https' if puerto in puertos_conocidos.TLS else 'http'
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(f'{esquema}://{host}:{puerto}/', headers={'User-Agent': 'PanelIncubApp/1.0'})
        with urllib.request.urlopen(req, timeout=2.5, context=ctx) as r:
            cuerpo = r.read(16000).decode('utf-8', 'replace')
            servidor = r.headers.get('Server')
    except urllib.error.HTTPError as e:
        cuerpo, servidor = '', e.headers.get('Server') if e.headers else None
    except Exception:  # noqa: BLE001
        return None, None
    m = re.search(r'<title[^>]*>(.*?)</title>', cuerpo, re.I | re.S)
    titulo = re.sub(r'\s+', ' ', m.group(1)).strip()[:80] if m else None
    return titulo, (servidor or '')[:60] or None


def _abierto(host: str, puerto: int, timeout: float = 0.6) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        return s.connect_ex((host, puerto)) == 0
    except OSError:
        return False
    finally:
        s.close()


def escanear_puertos(trabajo: trabajos.Trabajo | None, host: str, perfil: str = 'comun') -> dict:
    host = validar_host(host)
    if perfil not in puertos_conocidos.PERFILES:
        raise ValueError('Perfil de escaneo no válido.')
    t0 = time.time()
    try:
        ip = socket.gethostbyname(host)
    except OSError as e:
        raise RuntimeError(f'No se encontró {host}.') from e
    lista = puertos_conocidos.PERFILES[perfil]
    if trabajo:
        trabajo.linea(f'Revisando {len(lista)} puertos de {host} ({ip})…')
    abiertos = []
    with ThreadPoolExecutor(max_workers=64) as ex:
        futuros = {ex.submit(_abierto, ip, p): p for p in lista}
        for i, f in enumerate(as_completed(futuros)):
            if trabajo and i % 50 == 0:
                trabajo.revisar()
                trabajo.avance(0.8 * i / len(lista), None)
            if f.result():
                abiertos.append(futuros[f])
    res = []
    for p in sorted(abiertos):
        servicio, riesgo, nota = puertos_conocidos.describir(p)
        titulo = servidor = None
        if p in puertos_conocidos.WEB:
            titulo, servidor = _titulo_web(ip, p)
            if p in (80, 8080, 81) and riesgo == 'info':
                riesgo = 'bajo'
        res.append({'puerto': p, 'servicio': servicio, 'riesgo': riesgo, 'nota': nota, 'titulo_web': titulo, 'servidor': servidor})
        if trabajo:
            trabajo.linea(f"  {p:>5} abierto  {servicio:28} [{riesgo}] {titulo or ''}")
    hallazgos = []
    peligrosos = [x for x in res if x['riesgo'] in ('critico', 'alto', 'medio')]
    if peligrosos:
        peor = min(peligrosos, key=lambda x: _ORDEN[x['riesgo']])['riesgo']
        hallazgos.append({'id': f'puertos_{ip}', 'categoria': 'red', 'nivel': peor,
                          'titulo': f"{host}: {', '.join(str(x['puerto']) + ' ' + x['servicio'] for x in peligrosos[:5])}",
                          'detalle': ' '.join(x['nota'] for x in peligrosos[:3]),
                          'recomendacion': 'Cierre o proteja con contraseña los servicios que no se usen; cambie las claves de fábrica.',
                          'arreglo': None, 'evidencia': f'{len(res)} puertos abiertos'})
    with _candado:
        inv = _leer_inventario()
        for d in inv['dispositivos'].values():
            if d.get('ip') == ip:
                d['puertos'] = [x['puerto'] for x in res]
                d['ultimo_escaneo_puertos'] = sistema.ahora_iso()
        _guardar_inventario(inv)
    if trabajo:
        trabajo.linea(f'{len(res)} puertos abiertos.')
    return {'host': host, 'ip': ip, 'perfil': perfil, 'generado': sistema.ahora_iso(), 'segundos': round(time.time() - t0, 1),
            'abiertos': res, 'hallazgos': hallazgos}


_ORDEN = {'critico': 0, 'alto': 1, 'medio': 2, 'bajo': 3, 'info': 4, 'ok': 5}


# ── Herramientas ─────────────────────────────────────────────────────────────
def _h_ping(t, p):
    host = validar_host(p.get('host'))
    n = max(1, min(int(p.get('cantidad') or 4), 50))
    tiempos = []
    for i in range(n):
        t.revisar()
        ms = ping_icmp(host, 1500)
        tiempos.append(ms)
        t.linea(f'Respuesta de {host}: {ms:.0f} ms' if ms is not None else f'{host}: sin respuesta')
        t.avance((i + 1) / n)
        if i < n - 1:
            time.sleep(1)
    ok = [x for x in tiempos if x is not None]
    r = {'host': host, 'enviados': n, 'recibidos': len(ok), 'perdida_pct': round((n - len(ok)) / n * 100, 1),
         'min': min(ok) if ok else None, 'prom': round(sum(ok) / len(ok), 1) if ok else None, 'max': max(ok) if ok else None}
    t.linea(f"Resumen: {r['recibidos']}/{n} respuestas, pérdida {r['perdida_pct']} %, mín/prom/máx {r['min']}/{r['prom']}/{r['max']} ms")
    return r


def _h_traceroute(t, p):
    host = validar_host(p.get('host'))
    codigo = trabajos.proceso_en_vivo(t, ['tracert', '-d', '-h', '20', '-w', '800', host], timeout=180, codificacion='oem')
    return {'host': host, 'codigo': codigo}


def _h_dns(t, p):
    nombre = str(p.get('nombre') or '').strip()
    if not RE_HOST.match(nombre):
        raise ValueError('Nombre no válido.')
    servidores = list(dict.fromkeys(((principal() or {}).get('dns') or []) + ['1.1.1.1', '8.8.8.8']))
    res = []
    for s in servidores:
        ips, ms, err = consulta_dns(nombre, s)
        res.append({'servidor': s, 'ips': ips, 'ms': ms, 'error': err})
        t.linea(f"{s:15} → {', '.join(ips) if ips else (err or 'sin registros')}  ({ms} ms)")
    prueba = f'no-existe-{random.randint(10**6, 10**7)}.incubapp-prueba.com'
    falsos = []
    for s in servidores:
        ips, _, err = consulta_dns(prueba, s)
        if ips:
            falsos.append(s)
    privadas = [r['servidor'] for r in res if r['ips'] and any(ipaddress.IPv4Address(x).is_private for x in r['ips'])
                and not nombre.endswith(('.local', '.lan'))]
    alertas = []
    if falsos:
        alertas.append(f"El DNS {', '.join(falsos)} responde a dominios que NO existen: puede estar redirigiendo (secuestro de DNS).")
    if privadas:
        alertas.append(f"El DNS {', '.join(privadas)} devuelve una IP privada para {nombre}: revise que no lo estén desviando.")
    for a in alertas:
        t.linea('ATENCIÓN: ' + a)
    if not alertas:
        t.linea('Sin señales de DNS manipulado.')
    return {'nombre': nombre, 'respuestas': res, 'alertas': alertas}


def _h_http(t, p):
    url = str(p.get('url') or '')
    validar_herramienta('http', {'url': url})
    t0 = time.perf_counter()
    res = {'url': url, 'codigo': None, 'ms': None, 'cabeceras': {}, 'faltan': [], 'cert_dias': None, 'final': None, 'error': None}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'PanelIncubApp/1.0'}), timeout=15) as r:
            res['codigo'], res['final'] = r.status, r.geturl()
            res['cabeceras'] = {k: v for k, v in r.headers.items() if k.lower() in (
                'server', 'strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options',
                'referrer-policy', 'cf-ray', 'content-type')}
    except urllib.error.HTTPError as e:
        res['codigo'] = e.code
    except Exception as e:  # noqa: BLE001
        res['error'] = str(getattr(e, 'reason', e))[:200]
    res['ms'] = round((time.perf_counter() - t0) * 1000)
    low = {k.lower() for k in res['cabeceras']}
    res['faltan'] = [n for n, k in (('HSTS', 'strict-transport-security'), ('X-Content-Type-Options', 'x-content-type-options'),
                                    ('X-Frame-Options', 'x-frame-options'), ('Referrer-Policy', 'referrer-policy')) if k not in low]
    if url.startswith('https://'):
        host = url.split('/')[2].split(':')[0]
        try:
            ctx = ssl.create_default_context()
            with socket.create_connection((host, 443), timeout=8) as s, ctx.wrap_socket(s, server_hostname=host) as c:
                res['cert_dias'] = int((ssl.cert_time_to_seconds(c.getpeercert()['notAfter']) - time.time()) // 86400)
        except Exception as e:  # noqa: BLE001
            res['cert_error'] = str(e)[:200]
    t.linea(f"{url} → {res['codigo'] or res['error']} en {res['ms']} ms")
    if res['final'] and res['final'] != url:
        t.linea(f"Redirigió a: {res['final']}")
    for k, v in res['cabeceras'].items():
        t.linea(f'  {k}: {v[:120]}')
    if res['cert_dias'] is not None:
        t.linea(f"Certificado: vence en {res['cert_dias']} días")
    if res['faltan']:
        t.linea('Faltan cabeceras de seguridad: ' + ', '.join(res['faltan']))
    return res


def _h_puerto(t, p):
    host = validar_host(p.get('host'))
    puerto = int(p.get('puerto') or 0)
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3)
    t0 = time.perf_counter()
    try:
        codigo = s.connect_ex((socket.gethostbyname(host), puerto))
        estado = 'abierto' if codigo == 0 else ('cerrado' if codigo in (10061, 111) else 'filtrado')
    except socket.timeout:
        estado = 'filtrado'
    except OSError as e:
        estado = f'error: {e}'
    finally:
        s.close()
    servicio, riesgo, nota = puertos_conocidos.describir(puerto)
    t.linea(f'{host}:{puerto} ({servicio}) → {estado} ({(time.perf_counter() - t0) * 1000:.0f} ms)')
    return {'host': host, 'puerto': puerto, 'estado': estado, 'servicio': servicio, 'riesgo': riesgo, 'nota': nota}


def _h_wol(t, p):
    mac = validar_mac(p.get('mac'))
    paquete = b'\xff' * 6 + bytes.fromhex(mac.replace(':', '')) * 16
    n = red_auto()
    destino = str(n.broadcast_address) if n else '255.255.255.255'
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    try:
        for _ in range(3):
            s.sendto(paquete, (destino, 9))
    finally:
        s.close()
    t.linea(f'Paquete de encendido enviado a {mac} por {destino}. Si el equipo tiene Wake-on-LAN activo, enciende en unos segundos.')
    return {'mac': mac, 'destino': destino}


def upnp(espera: float = 3.0) -> list[dict]:
    msg = ('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n').encode()
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    s.settimeout(0.5)
    ip_local = (principal() or {}).get('ip')
    if ip_local:
        try:
            s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(ip_local))
        except OSError:
            pass
    equipos: dict[str, dict] = {}
    try:
        s.sendto(msg, ('239.255.255.250', 1900))
        fin = time.time() + espera
        while time.time() < fin:
            try:
                datos, (ip, _) = s.recvfrom(4096)
            except socket.timeout:
                continue
            cab = {}
            for linea in datos.decode('utf-8', 'replace').split('\r\n')[1:]:
                k, _, v = linea.partition(':')
                cab[k.strip().lower()] = v.strip()[:160]
            e = equipos.setdefault(ip, {'ip': ip, 'servidor': cab.get('server'), 'ubicacion': cab.get('location'), 'tipos': set()})
            if cab.get('st'):
                e['tipos'].add(cab['st'])
    except OSError as e:
        registro.warning('UPnP: %s', e)
    finally:
        s.close()
    res = []
    for e in equipos.values():
        tipos = sorted(e.pop('tipos'))
        e['tipos'] = tipos[:12]
        e['router_upnp'] = any('InternetGatewayDevice' in x or 'WANIPConnection' in x for x in tipos)
        res.append(e)
    return sorted(res, key=lambda x: tuple(int(p) for p in x['ip'].split('.')))


def _h_upnp(t, p):
    equipos = upnp()
    for e in equipos:
        t.linea(f"{e['ip']:15} {e.get('servidor') or ''}{'  ← ROUTER CON UPnP ACTIVO' if e['router_upnp'] else ''}")
    if not equipos:
        t.linea('Ningún equipo respondió por UPnP.')
    return {'equipos': equipos, 'router_upnp': any(e['router_upnp'] for e in equipos)}


HERRAMIENTAS = {'ping': _h_ping, 'traceroute': _h_traceroute, 'dns': _h_dns, 'http': _h_http, 'puerto': _h_puerto,
                'wol': _h_wol, 'upnp': _h_upnp}


def herramienta(trabajo: trabajos.Trabajo, tipo: str, params: dict) -> dict:
    validar_herramienta(tipo, params)
    return HERRAMIENTAS[tipo](trabajo, params)


# ── Auditoría de la red ──────────────────────────────────────────────────────
def auditar_red(trabajo: trabajos.Trabajo) -> dict:
    t0 = time.time()
    inv = _leer_inventario()
    ult = sistema.leer_iso(inv.get('ultimo_escaneo'))
    if not ult or (sistema.ahora() - ult).total_seconds() > 1800:
        trabajo.linea('Primero se buscan los equipos de la red…')
        escanear_red(trabajo)
    equipos = [d for d in inventario() if d.get('en_linea')][:80]
    puertos = sorted(set(puertos_conocidos.PERFILES['rapido']) | set(puertos_conocidos.PERFILES['industrial']))
    hallazgos = []
    trabajo.linea(f'Revisando {len(puertos)} puertos en {len(equipos)} equipos…')
    ip_propia = (principal() or {}).get('ip')
    for i, d in enumerate(equipos):
        trabajo.revisar()
        trabajo.avance(0.1 + 0.75 * i / max(1, len(equipos)), None)
        if d['ip'] == ip_propia:
            continue
        with ThreadPoolExecutor(max_workers=32) as ex:
            abiertos = [p for p, ok in zip(puertos, ex.map(lambda p: _abierto(d['ip'], p, 0.5), puertos)) if ok]
        with _candado:
            inv2 = _leer_inventario()
            if d['mac'] in inv2['dispositivos']:
                inv2['dispositivos'][d['mac']]['puertos'] = abiertos
                _guardar_inventario(inv2)
        malos = [(p, *puertos_conocidos.describir(p)) for p in abiertos]
        malos = [m for m in malos if m[2] in ('critico', 'alto', 'medio')]
        quien = d.get('nombre') or d.get('nombre_red') or d.get('fabricante') or 'equipo'
        if abiertos:
            trabajo.linea(f"  {d['ip']:15} {quien[:30]:30} abiertos: {', '.join(map(str, abiertos))}")
        if malos:
            peor = min(malos, key=lambda m: _ORDEN[m[2]])[2]
            hallazgos.append({'id': f"equipo_{d['mac']}", 'categoria': 'red', 'nivel': peor,
                              'titulo': f"{d['ip']} ({quien}): {', '.join(f'{m[0]} {m[1]}' for m in malos[:4])}",
                              'detalle': ' '.join(m[3] for m in malos[:3]),
                              'recomendacion': 'Si el equipo no necesita ese servicio, apáguelo; si lo necesita, cambie la clave de fábrica '
                                               'y limite quién llega a él (por ejemplo, una red separada para cámaras y máquinas).',
                              'arreglo': None, 'evidencia': f"MAC {d['mac']}"})
    trabajo.avance(0.9, 'Buscando routers con UPnP…')
    for e in upnp():
        if e['router_upnp']:
            hallazgos.append({'id': f"upnp_{e['ip']}", 'categoria': 'red', 'nivel': 'medio',
                              'titulo': f"El router {e['ip']} tiene UPnP activo",
                              'detalle': 'Con UPnP, cualquier programa de la red (incluido un virus) puede abrir puertos hacia internet sin preguntar.',
                              'recomendacion': 'Desactive UPnP en la configuración del router si nada lo necesita.', 'arreglo': None,
                              'evidencia': e.get('servidor')})
    inv = _leer_inventario()
    for mac, ips in (inv.get('duplicadas') or {}).items():
        hallazgos.append({'id': f'arp_{mac}', 'categoria': 'red', 'nivel': 'alto',
                          'titulo': f"La misma MAC ({mac}) responde por varias IP: {', '.join(ips)}",
                          'detalle': 'Puede ser un equipo con dos direcciones, o alguien haciéndose pasar por otro equipo (suplantación ARP).',
                          'recomendacion': 'Identifique el equipo; si una de las IP es la puerta de enlace, revíselo de inmediato.',
                          'arreglo': None, 'evidencia': mac})
    if inv.get('puerta_mac_anterior'):
        hallazgos.append({'id': 'puerta_mac', 'categoria': 'red', 'nivel': 'alto',
                          'titulo': 'La MAC de la puerta de enlace cambió',
                          'detalle': f"Antes {inv['puerta_mac_anterior']}, ahora {inv.get('puerta_mac')}. Normal si se cambió el router; si no, "
                                     'alguien puede estar interceptando el tráfico.',
                          'recomendacion': 'Confirme con quien administra la red si cambiaron el router.', 'arreglo': None, 'evidencia': None})
    desconocidos = [d for d in equipos if not d.get('conocido')]
    if desconocidos:
        hallazgos.append({'id': 'sin_identificar', 'categoria': 'red', 'nivel': 'info',
                          'titulo': f'{len(desconocidos)} equipos en la red sin identificar',
                          'detalle': 'Póngales nombre y márquelos como conocidos en la lista de equipos: así el panel avisa cuando aparezca uno nuevo.',
                          'recomendacion': 'Revise la lista de equipos.', 'arreglo': None, 'evidencia': None})
    hallazgos.sort(key=lambda h: _ORDEN.get(h['nivel'], 9))
    resumen = {k: sum(1 for h in hallazgos if h['nivel'] == k) for k in _ORDEN}
    puntaje = max(0, 100 - sum({'critico': 25, 'alto': 10, 'medio': 4, 'bajo': 1}.get(h['nivel'], 0) for h in hallazgos))
    res = {'generado': sistema.ahora_iso(), 'segundos': round(time.time() - t0, 1), 'puntaje': puntaje, 'resumen': resumen,
           'hallazgos': hallazgos, 'equipos_revisados': len(equipos)}
    sistema.guardar_json(AUDITORIA, res)
    trabajo.linea(f"Listo: {len(hallazgos)} hallazgos (críticos {resumen['critico']}, altos {resumen['alto']}, medios {resumen['medio']}).")
    return res


def ultima_auditoria_red() -> dict | None:
    return sistema.leer_json(AUDITORIA, None)


# ── Monitor de internet ──────────────────────────────────────────────────────
OBJETIVOS = ('puerta', '1.1.1.1', '8.8.8.8')
MAX_MUESTRAS = 7 * 24 * 120


class MonitorRed:
    def __init__(self, ajustes: sistema.Ajustes) -> None:
        self.ajustes = ajustes
        self._detener = threading.Event()
        self._hilo = None
        self._c = threading.Lock()
        d = sistema.leer_json(CALIDAD, {}) or {}
        self._t: list = d.get('t', [])
        self._s: dict[str, list] = {k: d.get('series', {}).get(k, [None] * len(self._t)) for k in OBJETIVOS + ('dns_ms',)}
        self._alertas: list[dict] = []
        self._guardado = time.time()

    def iniciar(self) -> None:
        self._hilo = sistema.hilo(self._bucle, nombre='monitor-red')

    def detener(self) -> None:
        self._detener.set()
        self._guardar()

    def _bucle(self) -> None:
        self._detener.wait(5)
        while not self._detener.is_set():
            t0 = time.time()
            try:
                if self.ajustes.monitor_internet:
                    self._medir()
                self._vigilar_arp()
            except Exception:  # noqa: BLE001
                registro.exception('Monitor de red')
            if time.time() - self._guardado > 300:
                self._guardar()
            self._detener.wait(max(10, self.ajustes.intervalo_internet_s) - (time.time() - t0))

    def _medir(self) -> None:
        p = principal() or {}
        destinos = {'puerta': p.get('puerta'), '1.1.1.1': '1.1.1.1', '8.8.8.8': '8.8.8.8'}
        with ThreadPoolExecutor(max_workers=4) as ex:
            fut = {k: ex.submit(ping_icmp, ip, 1000) for k, ip in destinos.items() if ip}
            dns_srv = (p.get('dns') or ['1.1.1.1'])[0]
            fdns = ex.submit(consulta_dns, 'incubapp.cdhmaker.com', dns_srv, 2.0)
            valores = {k: f.result() for k, f in fut.items()}
            _, dms, err = fdns.result()
        with self._c:
            self._t.append(int(time.time()))
            for k in OBJETIVOS:
                self._s[k].append(valores.get(k))
            self._s['dns_ms'].append(dms if not err else None)
            if len(self._t) > MAX_MUESTRAS:
                cortar = len(self._t) - MAX_MUESTRAS
                del self._t[:cortar]
                for s in self._s.values():
                    del s[:cortar]

    def _vigilar_arp(self) -> None:
        p = principal() or {}
        if not p.get('puerta'):
            return
        mac = mac_de(p['puerta'])
        if not mac:
            return
        with _candado:
            inv = _leer_inventario()
            conocida = inv.get('puerta_mac')
            if not conocida:
                inv['puerta_mac'] = mac
                _guardar_inventario(inv)
                return
        alertas = []
        if mac != conocida:
            alertas.append({'id': 'puerta_mac', 'categoria': 'red', 'nivel': 'alto',
                            'titulo': 'La MAC de la puerta de enlace cambió: posible suplantación (ARP)',
                            'detalle': f'Antes {conocida}, ahora {mac}. Normal solo si se cambió el router.',
                            'recomendacion': 'Confirme con quien administra la red. Si nadie cambió el router, alguien puede estar interceptando el tráfico.',
                            'arreglo': None, 'evidencia': mac})
        for d in (inv.get('dispositivos') or {}).values():
            if d.get('mac') == mac and d.get('ip') not in (p['puerta'], None) and d.get('en_linea'):
                alertas.append({'id': 'puerta_duplicada', 'categoria': 'red', 'nivel': 'alto',
                                'titulo': f"La MAC de la puerta de enlace también la usa {d['ip']}",
                                'detalle': 'Un equipo se hace pasar por el router (suplantación ARP).',
                                'recomendacion': 'Ubique ese equipo y desconéctelo.', 'arreglo': None, 'evidencia': mac})
        self._alertas = alertas

    def _guardar(self) -> None:
        with self._c:
            datos = {'t': list(self._t), 'series': {k: list(v) for k, v in self._s.items()}}
        try:
            sistema.guardar_json(CALIDAD, datos)
        except OSError:
            pass
        self._guardado = time.time()

    def calidad(self, horas: float = 24) -> dict:
        corte = time.time() - max(0.1, min(float(horas), 168)) * 3600
        with self._c:
            i = next((n for n, t in enumerate(self._t) if t >= corte), len(self._t))
            t = self._t[i:]
            series = {k: v[i:] for k, v in self._s.items()}
        perdida = {k: round(sum(1 for x in v if x is None) / len(v) * 100, 1) if v else None
                   for k, v in series.items() if k in OBJETIVOS}
        cortes, inicio = [], None
        for n, ts in enumerate(t):
            caido = series['1.1.1.1'][n] is None and series['8.8.8.8'][n] is None
            if caido and inicio is None:
                inicio = ts
            elif not caido and inicio is not None:
                cortes.append({'inicio': sistema.iso(inicio), 'fin': sistema.iso(ts), 'segundos': ts - inicio, 'objetivo': 'internet'})
                inicio = None
        if inicio is not None:
            cortes.append({'inicio': sistema.iso(inicio), 'fin': None, 'segundos': int(time.time() - inicio), 'objetivo': 'internet'})
        return {'t': t, 'series': series, 'perdida': perdida, 'cortes': cortes[-100:]}

    def resumen(self) -> dict:
        p = principal() or {}
        c = self.calidad(10 / 60)
        ult = lambda k: next((x for x in reversed(c['series'].get(k) or []) if x is not None), None)  # noqa: E731
        internet_ms = ult('1.1.1.1') or ult('8.8.8.8')
        ahora_caido = bool(c['t']) and c['series']['1.1.1.1'][-1] is None and c['series']['8.8.8.8'][-1] is None
        perdida = max((c['perdida'].get(k) or 0) for k in ('1.1.1.1', '8.8.8.8')) if c['t'] else None
        prom = [x for x in (c['series'].get('1.1.1.1') or []) if x is not None]
        prom = sum(prom) / len(prom) if prom else None
        if not c['t']:
            nivel, texto = 'desconocido', 'Midiendo…' if self.ajustes.monitor_internet else 'Medición apagada en Ajustes'
        elif ahora_caido:
            nivel, texto = 'falla', 'Sin internet en este momento'
        elif (perdida or 0) > 5 or (prom or 0) > 150:
            nivel, texto = 'aviso', f'Internet inestable (pérdida {perdida:.0f} %, {prom or 0:.0f} ms)'
        else:
            nivel, texto = 'ok', f'Internet estable ({internet_ms:.0f} ms)' if internet_ms else 'Internet estable'
        with _candado:
            inv = _leer_inventario()
        disp = list(inv['dispositivos'].values())
        return {
            'generado': sistema.ahora_iso(), 'interfaces': interfaces(), 'puerta': p.get('puerta'), 'red': str(red_auto() or ''),
            'internet': {'nivel': nivel, 'texto': texto, 'puerta_ms': ult('puerta'), 'internet_ms': internet_ms,
                         'perdida_pct': perdida, 'dns_ms': ult('dns_ms')},
            'dispositivos': {'total': len(disp), 'en_linea': sum(1 for d in disp if d.get('en_linea')),
                             'conocidos': sum(1 for d in disp if d.get('conocido')),
                             'nuevos': sum(1 for d in disp if not d.get('conocido') and d.get('en_linea')),
                             'ultimo_escaneo': inv.get('ultimo_escaneo')},
            'alertas': list(self._alertas),
        }


_ = json  # (se usa en pruebas)
