"""Panel IncubApp · modo «servidor activo».

Para cuando el responsable no está en la planta: el equipo solo se maneja a distancia, desde
los equipos permitidos, y el botón de encendido no lo apaga.

Activar (un script elevado; Windows pide permiso de administrador):
  1. Botón de encendido y de suspender → «No hacer nada» (con y sin batería) y sin suspensión.
  2. Sin «Apagar» en la pantalla de inicio de sesión / bloqueo (ShutdownWithoutLogon = 0).
  3. Escritorio remoto con NLA; se apagan las reglas genéricas de «Escritorio remoto» del
     firewall y se crea «IncubApp acceso remoto» (3389) SOLO desde los equipos permitidos.
Desactivar deja el botón en «Apagar», vuelve el apagado a la pantalla de inicio y apaga el
escritorio remoto.

Lo que NO se puede bloquear por software: mantener el botón 4 s (apagado forzado del hardware)
o desconectar el cable. Eso se resuelve con un gabinete o cuarto con llave.
"""
from __future__ import annotations

import ipaddress
import re
import winreg

from . import sistema, trabajos
from .sistema import registro

RUTA = sistema.DATOS / 'modo.json'
REGLA = 'IncubApp acceso remoto'
GRUPO_RDP = '@FirewallAPI.dll,-28752'          # grupo «Escritorio remoto» (igual en todos los idiomas)
TAILSCALE = ipaddress.IPv4Network('100.64.0.0/10')
ACCIONES_BOTON = {0: 'nada', 1: 'suspender', 2: 'hibernar', 3: 'apagar', 4: 'apagar_pantalla'}
AVISOS = [
    'Mantener presionado el botón de encendido 4 segundos apaga el equipo a la fuerza (lo hace el hardware): '
    'eso no se puede bloquear por software. Proteja el equipo físicamente (gabinete o cuarto con llave).',
    'Desconectar el cable o un corte de luz también lo apagan. Al volver la corriente arranca solo si la BIOS tiene '
    '«After Power Loss → Power On».',
    'El acceso remoto pide la contraseña de Windows de este equipo: use una contraseña fuerte.',
]


# ── Validación ───────────────────────────────────────────────────────────────
def validar_permitidos(lista) -> list[str]:
    if not isinstance(lista, list) or not lista:
        raise ValueError('Agregue al menos un equipo o red permitida (por ejemplo la red de Tailscale 100.64.0.0/10).')
    salida = []
    for x in lista[:30]:
        texto = str(x).strip()
        try:
            red = ipaddress.IPv4Network(texto, strict=False)
        except ValueError as e:
            raise ValueError(f'«{texto[:40]}» no es una IP ni una red válida.') from e
        if not (red.is_private or red.subnet_of(TAILSCALE)):
            raise ValueError(f'«{texto}» es una dirección de internet: solo se permiten IP de la planta o de Tailscale.')
        if red.prefixlen < 10:
            raise ValueError(f'«{texto}» es demasiado amplia.')
        valor = str(red.network_address) if red.prefixlen == 32 else str(red)
        if valor not in salida:
            salida.append(valor)
    return salida


# ── Lectura del estado (sin administrador) ───────────────────────────────────
def _reg(ruta: str, nombre: str):
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, ruta) as k:
            return winreg.QueryValueEx(k, nombre)[0]
    except OSError:
        return None


def _boton(subgrupo: str) -> dict:
    """powercfg sale en el idioma de Windows: se toman los dos últimos valores hex (CA y CC).
    /qh y no /q: los botones son ajustes «ocultos» y /q no los muestra."""
    r = sistema.ejecutar(['powercfg', '/qh', 'SCHEME_CURRENT', 'SUB_BUTTONS', subgrupo], timeout=20, codificacion='oem')
    valores = re.findall(r':\s*0x([0-9a-fA-F]{8})\s*$', r.salida, re.M)
    if len(valores) < 2:
        return {'ac': 'desconocido', 'dc': 'desconocido'}
    ac, dc = (int(v, 16) for v in valores[-2:])
    return {'ac': ACCIONES_BOTON.get(ac, 'desconocido'), 'dc': ACCIONES_BOTON.get(dc, 'desconocido')}


PS_ESTADO = rf'''
$r = [ordered]@{{}}
$regla = Get-NetFirewallRule -DisplayName '{REGLA}' -ErrorAction SilentlyContinue
$r.regla = [bool]$regla
$r.regla_remotos = @()
if ($regla) {{ $r.regla_remotos = @(($regla | Select-Object -First 1 | Get-NetFirewallAddressFilter).RemoteAddress | ForEach-Object {{ [string]$_ }}) }}
$r.genericas = @(Get-NetFirewallRule -Group '{GRUPO_RDP}' -ErrorAction SilentlyContinue | Where-Object {{ $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' }}).Count
$svc = Get-Service -Name Tailscale -ErrorAction SilentlyContinue
$r.tailscale_servicio = if ($svc) {{ [string]$svc.Status }} else {{ $null }}
$r.tailscale_ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {{ $_.IPAddress -like '100.*' -and $_.InterfaceAlias -like '*Tailscale*' }} | Select-Object -First 1).IPAddress
$exe = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
$r.tailscale_nombre = $null
if (Test-Path $exe) {{ try {{ $s = & $exe status --json 2>$null | ConvertFrom-Json; $r.tailscale_nombre = ([string]$s.Self.DNSName).TrimEnd('.') }} catch {{ }} }}
$r.tailscale_instalado = [bool]($svc -or (Test-Path $exe))
$r | ConvertTo-Json -Compress
'''


def estado() -> dict:
    def leer():
        guardado = sistema.leer_json(RUTA, {}) or {}
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=3) as ex:     # powercfg y PowerShell a la vez: tardan
            f_boton, f_susp = ex.submit(_boton, 'PBUTTONACTION'), ex.submit(_boton, 'SBUTTONACTION')
            f_fw = ex.submit(sistema.powershell_json, PS_ESTADO, 60)
            boton, suspender, (fw, _) = f_boton.result(), f_susp.result(), f_fw.result()
        sin_sesion = _reg(r'SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System', 'ShutdownWithoutLogon')
        apagado_sin_sesion = sin_sesion != 0          # sin valor = Windows lo permite
        rdp_activo = _reg(r'System\CurrentControlSet\Control\Terminal Server', 'fDenyTSConnections') == 0
        nla = _reg(r'System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp', 'UserAuthentication') == 1
        puerto = _reg(r'System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp', 'PortNumber') or 3389
        fw = fw if isinstance(fw, dict) else {}
        remotos = [x for x in sistema.lista(fw.get('regla_remotos')) if x]
        genericas = int(fw.get('genericas') or 0)
        protecciones = [
            {'id': 'boton', 'titulo': 'Botón de encendido sin efecto',
             'ok': boton['ac'] == 'nada' and boton['dc'] == 'nada',
             'detalle': f"Al pulsarlo: {boton['ac'].replace('_', ' ')} (con corriente)"},
            {'id': 'suspender', 'titulo': 'Botón de suspender sin efecto',
             'ok': suspender['ac'] == 'nada' and suspender['dc'] == 'nada',
             'detalle': f"Al pulsarlo: {suspender['ac'].replace('_', ' ')}"},
            {'id': 'pantalla_inicio', 'titulo': 'Sin «Apagar» en la pantalla de inicio de sesión',
             'ok': not apagado_sin_sesion,
             'detalle': 'Nadie puede apagar desde la pantalla de bloqueo sin la contraseña' if not apagado_sin_sesion
             else 'Cualquiera puede apagar desde la pantalla de inicio de sesión'},
            {'id': 'remoto', 'titulo': 'Escritorio remoto con verificación previa (NLA)', 'ok': rdp_activo and nla,
             'detalle': ('Activo, pide usuario y contraseña antes de mostrar nada' if rdp_activo and nla
                         else 'Activo SIN NLA' if rdp_activo else 'Apagado')},
            {'id': 'firewall', 'titulo': 'Solo los equipos permitidos llegan al escritorio remoto',
             'ok': bool(fw.get('regla')) and genericas == 0 and bool(remotos) and 'Any' not in remotos,
             'detalle': (f"Permitidos: {', '.join(remotos)}" if fw.get('regla') else 'No hay regla de IncubApp')
             + (f' · {genericas} regla(s) genérica(s) de Windows abiertas a toda la red' if genericas else '')},
        ]
        n_ok = sum(1 for p in protecciones if p['ok'])
        return {
            'activo': n_ok == len(protecciones), 'parcial': 0 < n_ok < len(protecciones),
            'activado_en': guardado.get('activado_en') if n_ok == len(protecciones) else None,
            'permitidos': guardado.get('permitidos') or remotos or [str(TAILSCALE)],
            'boton_encendido': boton, 'boton_suspender': suspender, 'apagado_sin_sesion': apagado_sin_sesion,
            'escritorio_remoto': {'activo': rdp_activo, 'nla': nla, 'regla': bool(fw.get('regla')), 'regla_remotos': remotos,
                                  'reglas_genericas_abiertas': genericas > 0, 'puerto': puerto},
            'tailscale': {'instalado': bool(fw.get('tailscale_instalado')), 'servicio': fw.get('tailscale_servicio'),
                          'ip': fw.get('tailscale_ip'), 'nombre': fw.get('tailscale_nombre') or None},
            'equipo': {'nombre': __import__('os').environ.get('COMPUTERNAME'), 'ip_lan': _ip_lan(),
                       'usuario': __import__('os').environ.get('USERNAME')},
            'protecciones': protecciones, 'avisos': AVISOS,
        }
    return sistema.memo.obtener('modo:estado', 30, leer)


def _ip_lan() -> str | None:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 53))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


# ── Activar / desactivar (con administrador) ─────────────────────────────────
def _script_activar(permitidos: list[str]) -> str:
    lista = ','.join("'" + p + "'" for p in permitidos)     # ya validadas: solo dígitos, puntos y /
    return rf'''
$perm = @({lista})
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS PBUTTONACTION 0
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS PBUTTONACTION 0
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS SBUTTONACTION 0
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS SBUTTONACTION 0
powercfg /setactive SCHEME_CURRENT
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
'1/3 Botón de encendido y de suspender: no hacen nada. Sin suspensión.'
$pol = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
Set-ItemProperty -Path $pol -Name ShutdownWithoutLogon -Value 0 -Type DWord
'2/3 La pantalla de inicio de sesión ya no tiene el botón de apagar.'
$ts = 'HKLM:\System\CurrentControlSet\Control\Terminal Server'
Set-ItemProperty -Path $ts -Name fDenyTSConnections -Value 0 -Type DWord
Set-ItemProperty -Path "$ts\WinStations\RDP-Tcp" -Name UserAuthentication -Value 1 -Type DWord
Set-Service -Name TermService -StartupType Automatic
Start-Service -Name TermService -ErrorAction SilentlyContinue
Get-NetFirewallRule -Group '{GRUPO_RDP}' -ErrorAction SilentlyContinue | Disable-NetFirewallRule
Get-NetFirewallRule -DisplayName '{REGLA}' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName '{REGLA}' -Description 'Panel IncubApp: escritorio remoto solo desde los equipos permitidos' -Direction Inbound -Protocol TCP -LocalPort 3389 -RemoteAddress $perm -Action Allow -Profile Any | Out-Null
New-NetFirewallRule -DisplayName '{REGLA}' -Description 'Panel IncubApp: escritorio remoto (UDP)' -Direction Inbound -Protocol UDP -LocalPort 3389 -RemoteAddress $perm -Action Allow -Profile Any | Out-Null
'3/3 Escritorio remoto activo (con NLA) solo desde: ' + ($perm -join ', ')
'LISTO: modo servidor activo.'
'''


SCRIPT_DESACTIVAR = rf'''
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS PBUTTONACTION 3
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS PBUTTONACTION 3
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS SBUTTONACTION 1
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS SBUTTONACTION 1
powercfg /setactive SCHEME_CURRENT
'1/3 El botón de encendido vuelve a apagar el equipo.'
Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name ShutdownWithoutLogon -Value 1 -Type DWord
'2/3 La pantalla de inicio de sesión vuelve a tener el botón de apagar.'
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -Value 1 -Type DWord
Get-NetFirewallRule -DisplayName '{REGLA}' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
'3/3 Escritorio remoto apagado y su regla del firewall quitada.'
'LISTO: modo servidor desactivado.'
'''


def activar(trabajo: trabajos.Trabajo, permitidos: list[str], bloquear: bool = False) -> dict:
    permitidos = validar_permitidos(permitidos)
    trabajo.linea('Activando el modo servidor… Windows le pedirá permiso de administrador en la pantalla: acéptelo.')
    trabajo.linea('Equipos permitidos para el escritorio remoto: ' + ', '.join(permitidos))
    r = sistema.powershell_admin(_script_activar(permitidos), timeout=600)
    trabajo.linea(r.texto or '(sin salida)')
    if not r.ok:
        raise RuntimeError(r.error or 'No se pudo activar el modo servidor.')
    sistema.guardar_json(RUTA, {'activo': True, 'activado_en': sistema.ahora_iso(), 'permitidos': permitidos})
    sistema.memo.olvidar('modo:estado')
    registro.info('Modo servidor ACTIVADO; permitidos: %s', permitidos)
    e = estado()
    faltan = [p['titulo'] for p in e['protecciones'] if not p['ok']]
    if faltan:
        trabajo.linea('ATENCIÓN: no quedaron aplicadas: ' + '; '.join(faltan))
    if bloquear:
        trabajo.linea('Bloqueando la pantalla…')
        bloquear_pantalla()
    return {'ok': not faltan, 'mensaje': 'Modo servidor activo.' if not faltan else 'Modo servidor aplicado a medias.',
            'estado': e}


def desactivar(trabajo: trabajos.Trabajo) -> dict:
    trabajo.linea('Desactivando el modo servidor… Windows le pedirá permiso de administrador: acéptelo.')
    trabajo.linea('Si está conectado por escritorio remoto, la conexión se cortará al terminar (es lo esperado).')
    r = sistema.powershell_admin(SCRIPT_DESACTIVAR, timeout=600)
    trabajo.linea(r.texto or '(sin salida)')
    if not r.ok:
        raise RuntimeError(r.error or 'No se pudo desactivar el modo servidor.')
    datos = sistema.leer_json(RUTA, {}) or {}
    datos.update(activo=False, desactivado_en=sistema.ahora_iso())
    sistema.guardar_json(RUTA, datos)
    sistema.memo.olvidar('modo:estado')
    registro.info('Modo servidor DESACTIVADO')
    return {'ok': True, 'mensaje': 'Modo servidor desactivado.', 'estado': estado()}


def bloquear_pantalla() -> dict:
    r = sistema.ejecutar(['rundll32.exe', 'user32.dll,LockWorkStation'], timeout=15)
    return {'ok': r.codigo == 0}
