"""Panel IncubApp · ciberseguridad del servidor.

auditar() junta en UN script de PowerShell lo de Windows y en UN script de Ubuntu lo de
Linux/Docker/Supabase (cada uno tarda en arrancar en este equipo), revisa la web pública
desde Python y arma la lista de hallazgos con su recomendación. Cada revisión va protegida:
si una falla, queda como hallazgo «info» y la auditoría sigue.
Los arreglos automáticos solo corren con botón y confirmación; los de Windows piden
permiso de administrador (aviso de Windows).
"""
from __future__ import annotations

import datetime as _dt
import email.utils
import json
import shutil
import socket
import ssl
import time
import urllib.error
import urllib.request

from . import puertos_conocidos, secretos, sistema, trabajos
from .sistema import registro

tachar = secretos.tachar
RUTA = sistema.DATOS / 'seguridad.json'
PESOS = {'critico': 25, 'alto': 10, 'medio': 4, 'bajo': 1}
ORDEN = {'critico': 0, 'alto': 1, 'medio': 2, 'bajo': 3, 'info': 4, 'ok': 5}


def _h(id_, categoria, titulo, nivel, detalle='', recomendacion='', arreglo=None, evidencia=None) -> dict:
    return {'id': id_, 'categoria': categoria, 'titulo': titulo, 'nivel': nivel, 'detalle': detalle,
            'recomendacion': recomendacion, 'arreglo': arreglo, 'evidencia': evidencia}


# ── Recolección ──────────────────────────────────────────────────────────────
PS_WINDOWS = r'''
$r = [ordered]@{}
try { $m = Get-MpComputerStatus -ErrorAction Stop
  $r.defender = @{ activo=[bool]$m.AntivirusEnabled; tiempo_real=[bool]$m.RealTimeProtectionEnabled; firmas_dias=$m.AntivirusSignatureAge;
    rapido_dias=$m.QuickScanAge; servicio=[bool]$m.AMServiceEnabled; manipulacion=[bool]$m.IsTamperProtected } }
catch { $r.defender = @{ error = $_.Exception.Message } }
try { $r.firewall = @(Get-NetFirewallProfile -ErrorAction Stop | ForEach-Object { @{ nombre=[string]$_.Name; activo=[bool]$_.Enabled } }) } catch { $r.firewall = $null }
$regla = Get-NetFirewallRule -DisplayName 'IncubApp servidor local' -ErrorAction SilentlyContinue
if ($regla) { $pf = $regla | Get-NetFirewallPortFilter
  $r.regla = @{ existe=$true; activa=[string]$regla.Enabled; puertos=@($pf.LocalPort | ForEach-Object { [string]$_ }); perfiles=[string]$regla.Profile } }
else { $r.regla = @{ existe=$false } }
$r.perfiles_red = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | ForEach-Object { @{ interfaz=$_.InterfaceAlias; categoria=[string]$_.NetworkCategory } })
$r.ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  ForEach-Object { @{ interfaz=$_.InterfaceAlias; ip=$_.IPAddress; prefijo=$_.PrefixLength } })
$ts = Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -ErrorAction SilentlyContinue
$nla = Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -ErrorAction SilentlyContinue
$r.rdp = @{ activo = ($ts.fDenyTSConnections -eq 0); nla = ($nla.UserAuthentication -eq 1) }
try { $r.smb1 = [string](Get-SmbServerConfiguration -ErrorAction Stop).EnableSMB1Protocol } catch { $r.smb1 = 'sin_permiso' }
$inv = Get-LocalUser -ErrorAction SilentlyContinue | Where-Object { $_.SID.Value -like '*-501' }
$r.invitado = [bool]($inv -and $inv.Enabled)
$uac = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -ErrorAction SilentlyContinue
$r.uac = ($uac.EnableLUA -eq 1)
$wl = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -ErrorAction SilentlyContinue
$r.autologon = @{ activo = ([string]$wl.AutoAdminLogon -eq '1'); clave_guardada = [bool]$wl.DefaultPassword }
$r.compartidos = @(Get-SmbShare -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '\$$' } | ForEach-Object { @{ nombre=$_.Name; ruta=$_.Path } })
$hf = Get-HotFix -ErrorAction SilentlyContinue | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1
$r.ultimo_parche = if ($hf) { @{ id=$hf.HotFixID; fecha=$hf.InstalledOn.ToString('s') } } else { $null }
$r.hotspot = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' -and ($_.InterfaceDescription -match 'Wi-Fi Direct|Virtual Adapter|Hosted Network') } | ForEach-Object { $_.Name })
$pr = @{}; Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $pr[$_.Id] = $_.ProcessName }
$r.escucha = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object { @{ dir=$_.LocalAddress; puerto=$_.LocalPort; proceso=$pr[[int]$_.OwningProcess] } })
$r | ConvertTo-Json -Depth 5 -Compress
'''

# En Ubuntu: Docker, permisos, valores de ejemplo de Supabase, RLS, la clave de servicio en
# la web y archivos con secretos en git. Los secretos se comparan DENTRO del script: solo
# sale sí/no, nunca el valor.
SH_LINUX = r'''
python3 - <<'PY'
import json, os, re, subprocess
def sh(c, t=20):
    try:
        p = subprocess.run(c, shell=True, capture_output=True, timeout=t, executable='/bin/bash')
        return p.returncode, p.stdout.decode('utf-8', 'replace')
    except Exception as e:
        return -1, str(e)
r = {}
_, ids = sh("docker ps -aq")
conts = []
if ids.strip():
    _, out = sh("docker inspect " + " ".join(ids.split()), 30)
    try:
        for c in json.loads(out):
            puertos = []
            for k, v in ((c.get('HostConfig') or {}).get('PortBindings') or {}).items():
                for b in v or []:
                    puertos.append({'puerto': int(b.get('HostPort') or 0), 'ip': b.get('HostIp') or '0.0.0.0', 'interno': k})
            conts.append({'nombre': c['Name'].lstrip('/'), 'privilegiado': c['HostConfig'].get('Privileged', False),
                          'reinicios': c.get('RestartCount', 0), 'estado': c['State']['Status'], 'puertos': puertos,
                          'red_host': c['HostConfig'].get('NetworkMode') == 'host',
                          'docker_sock': any('/var/run/docker.sock' in (m.get('Source') or '') for m in c.get('Mounts') or [])})
    except Exception as e:
        r['error_docker'] = str(e)
r['contenedores'] = conts
_, out = sh("ss -ltnpH")
r['escucha'] = []
for l in out.splitlines():
    p = l.split()
    if len(p) >= 4:
        dir_, _, puerto = p[3].rpartition(':')
        m = re.search(r'\(\("([^"]+)"', l)
        r['escucha'].append({'dir': dir_.strip('[]'), 'puerto': int(puerto) if puerto.isdigit() else 0, 'proceso': m.group(1) if m else None})
def permiso(f):
    try: return oct(os.stat(f).st_mode & 0o777)[2:]
    except OSError: return None
r['permisos'] = {'server_env': permiso('/opt/incubapp/server/.env'), 'tunel_env': permiso('/opt/incubapp/tunel.env'),
                 'n8n_env': permiso('/opt/incubapp/n8n/.env')}
env = {}
try:
    for l in open('/opt/incubapp/server/.env', encoding='utf-8', errors='replace'):
        k, _, v = l.strip().partition('=')
        env[k] = v.strip().strip('"')
except OSError:
    pass
EJEMPLO = {
    'JWT_SECRET': 'your-super-secret-jwt-token-with-at-least-32-characters-long',
    'POSTGRES_PASSWORD': 'your-super-secret-and-long-postgres-password',
    'DASHBOARD_PASSWORD': 'this_password_is_insecure_and_should_be_updated',
}
r['ejemplo'] = [k for k, v in EJEMPLO.items() if env.get(k) == v]
if env.get('ANON_KEY', '').startswith('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8i'):
    r['ejemplo'].append('ANON_KEY')
if env.get('SERVICE_ROLE_KEY', '').startswith('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyI'):
    r['ejemplo'].append('SERVICE_ROLE_KEY')
r['dashboard_corta'] = len(env.get('DASHBOARD_PASSWORD', '')) < 12 if env.get('DASHBOARD_PASSWORD') else None
r['auth'] = {k: env.get(k) for k in ('DISABLE_SIGNUP', 'ENABLE_EMAIL_AUTOCONFIRM', 'ENABLE_ANONYMOUS_USERS', 'ENABLE_PHONE_AUTOCONFIRM')}
def psql(q):
    c, o = sh("docker exec supabase-db psql -U postgres -d postgres -tAX -F '|' -c " + json.dumps(q), 20)
    return o.strip() if c == 0 else None
o = psql("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity order by 1")
r['sin_rls'] = o.splitlines() if o is not None else None
o = psql("select tablename||' ('||cmd||')' from pg_policies where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE','ALL') "
         "and (roles && array['anon','public']::name[]) and (coalesce(qual,'true')='true' and coalesce(with_check,'true')='true') order by 1")
r['politicas_abiertas'] = o.splitlines() if o is not None else None
expuesta = []
for k in ('SERVICE_ROLE_KEY', 'JWT_SECRET'):
    v = env.get(k)
    if v and len(v) > 20:
        try:
            p = subprocess.run(['docker', 'exec', 'incubapp-incubapp-1', 'grep', '-rlF', '-e', v, '/usr/share/nginx/html'],
                               capture_output=True, timeout=40)
            if p.stdout.strip():
                expuesta.append(k)
        except Exception:
            pass
r['clave_en_web'] = expuesta
_, out = sh("git -C /mnt/c/IncubApp ls-files")
r['git_env'] = [f for f in out.splitlines() if re.search(r'(^|/)\.env(\..+)?$|tunel\.env$|\.pem$|\.p12$|serviceAccount.*\.json$', f)
                and not f.endswith(('.env.example', '.env.production'))]
print(json.dumps(r))
PY
'''


def _windows() -> dict:
    datos, r = sistema.powershell_json(PS_WINDOWS, timeout=150)
    if not isinstance(datos, dict):
        raise RuntimeError(f'PowerShell no devolvió datos: {tachar(r.texto)[:300]}')
    return datos


def _linux() -> dict:
    datos, r = sistema.wsl_json(SH_LINUX, timeout=180)
    if not isinstance(datos, dict):
        raise RuntimeError(f'Ubuntu no devolvió datos: {tachar(r.texto)[:300]}')
    return datos


def _web(url: str) -> dict:
    d = {'url': url, 'cabeceras': {}, 'codigo': None, 'cert_dias': None, 'desfase_s': None, 'rutas': {}}
    req = urllib.request.Request(url, headers={'User-Agent': 'PanelIncubApp/1.0'})
    with urllib.request.urlopen(req, timeout=15) as r:
        d['codigo'] = r.status
        d['cabeceras'] = {k.lower(): v for k, v in r.headers.items()}
        indice = r.read(4000)
        fecha = r.headers.get('Date')
        if fecha:
            d['desfase_s'] = round(time.time() - email.utils.parsedate_to_datetime(fecha).timestamp())
    for ruta in ('/.env', '/.git/config', '/servidor-local/logs/publico.env'):
        try:
            with urllib.request.urlopen(urllib.request.Request(url.rstrip('/') + ruta, headers={'User-Agent': 'PanelIncubApp/1.0'}),
                                        timeout=10) as r:
                cuerpo = r.read(3000)
                # La app es una SPA: devuelve index.html con 200 para cualquier ruta. Eso no es una fuga.
                real = cuerpo[:200] != indice[:200] and (b'=' in cuerpo or b'[core]' in cuerpo)
                d['rutas'][ruta] = 'expuesta' if real else 'no'
        except urllib.error.HTTPError:
            d['rutas'][ruta] = 'no'
        except Exception:  # noqa: BLE001
            d['rutas'][ruta] = 'error'
    host = url.split('/')[2]
    ctx = ssl.create_default_context()
    with socket.create_connection((host, 443), timeout=10) as s, ctx.wrap_socket(s, server_hostname=host) as t:
        d['cert_dias'] = int((ssl.cert_time_to_seconds(t.getpeercert()['notAfter']) - time.time()) // 86400)
    return d


# ── Revisiones (cada una devuelve una lista de hallazgos) ───────────────────
def _rev_defender(w: dict) -> list:
    d = w.get('defender') or {}
    if d.get('error'):
        return [_h('defender', 'windows', 'No se pudo revisar Windows Defender', 'medio', d['error'],
                   'Revise que Windows Defender (Seguridad de Windows) esté instalado y activo.')]
    res = []
    if not d.get('activo'):
        res.append(_h('defender_apagado', 'windows', 'El antivirus de Windows está apagado', 'critico',
                      'Sin antivirus, un programa malicioso que llegue por USB, correo o descarga corre sin control.',
                      'Active Windows Defender o instale otro antivirus.', 'activar_defender'))
    if d.get('activo') and not d.get('tiempo_real'):
        res.append(_h('defender_tiempo_real', 'windows', 'La protección en tiempo real de Windows Defender está apagada', 'alto',
                      'El antivirus solo revisa cuando alguien lo pide: un archivo malicioso se puede ejecutar sin que lo detenga.',
                      'Active la protección en tiempo real (botón «Arreglar»; Windows pedirá permiso de administrador).',
                      'activar_defender', 'RealTimeProtectionEnabled = False'))
    f = d.get('firmas_dias')
    if isinstance(f, int) and f > 3:
        res.append(_h('defender_firmas', 'windows', f'Las firmas del antivirus tienen {f} días', 'medio' if f < 14 else 'alto',
                      'El antivirus no reconoce las amenazas más nuevas.', 'Actualice las firmas.', 'actualizar_firmas_defender'))
    q = d.get('rapido_dias')
    if isinstance(q, int) and q > 7:
        res.append(_h('defender_analisis', 'windows', f'No se hace un análisis del antivirus desde hace {q} días', 'medio',
                      'Un análisis rápido revisa los lugares donde suele esconderse el malware.',
                      'Haga un análisis rápido (tarda unos minutos y no detiene la app).', 'analisis_rapido_defender'))
    if not res:
        res.append(_h('defender', 'windows', 'Windows Defender activo y al día', 'ok'))
    return res


def _rev_firewall(w: dict) -> list:
    res = []
    perfiles = w.get('firewall') or []
    apagados = [p['nombre'] for p in perfiles if not p.get('activo')]
    if apagados:
        res.append(_h('firewall_apagado', 'windows', 'El firewall de Windows está apagado en: ' + ', '.join(apagados), 'critico',
                      'Sin firewall, cualquier equipo de la red llega a todos los servicios de este servidor.',
                      'Active el firewall en todos los perfiles.', 'activar_firewall'))
    elif perfiles:
        res.append(_h('firewall', 'windows', 'Firewall de Windows activo en todos los perfiles', 'ok'))
    regla = w.get('regla') or {}
    if regla.get('existe') and '8000' in (regla.get('puertos') or []):
        res.append(_h('firewall_8000', 'red', 'El firewall deja entrar desde la red al puerto 8000 (API de Supabase directa)', 'medio',
                      'La app ya entra por el puerto 80 (nginx), que reenvía la API. El 8000 abierto deja a cualquier equipo de la '
                      'red hablar con la API sin pasar por la app.',
                      'Quite el 8000 de la regla «IncubApp servidor local» (deja 80 y 443).', 'cerrar_puerto_8000',
                      f"Regla «IncubApp servidor local»: {', '.join(regla.get('puertos') or [])} ({regla.get('perfiles')})"))
    for p in w.get('perfiles_red') or []:
        if p.get('categoria') == 'Public':
            res.append(_h('red_publica', 'red', f"La red «{p.get('interfaz')}» está marcada como Pública", 'bajo',
                          'La regla de IncubApp solo abre puertos en redes Privadas/Dominio: si la red de la planta quedó como '
                          'Pública, los demás equipos podrían no llegar a la app por la IP local.',
                          'Si es la red de la empresa, márquela como Privada (Configuración → Red → Propiedades).'))
    return res


def _rev_windows_varios(w: dict) -> list:
    res = []
    hotspot = [i for i in w.get('ips') or [] if str(i.get('ip', '')).startswith('192.168.137.')]
    if hotspot or w.get('hotspot'):
        ev = ', '.join(f"{i['interfaz']} {i['ip']}" for i in hotspot) or ', '.join(w.get('hotspot') or [])
        res.append(_h('zona_wifi', 'red', 'El servidor está compartiendo su conexión (zona Wi-Fi / conexión compartida)', 'medio',
                      'El servidor arma su propia red aparte de la de la empresa: los equipos que se conecten ahí quedan '
                      'junto al servidor sin pasar por el router ni sus controles.',
                      'Apague «Zona con cobertura inalámbrica móvil» en Configuración → Red e Internet, si nadie la necesita.',
                      None, ev))
    rdp = w.get('rdp') or {}
    if rdp.get('activo'):
        res.append(_h('rdp', 'windows', 'El Escritorio remoto está activado' + ('' if rdp.get('nla') else ' SIN autenticación previa (NLA)'),
                      'alto' if not rdp.get('nla') else 'medio',
                      'Es el blanco número uno de los ataques de contraseña.', 'Desactívelo si no se usa, o deje NLA y una clave fuerte.'))
    else:
        res.append(_h('rdp', 'windows', 'Escritorio remoto desactivado', 'ok'))
    smb1 = str(w.get('smb1'))
    if smb1 == 'True':
        res.append(_h('smb1', 'windows', 'SMBv1 está activado', 'alto', 'Versión vieja de carpetas compartidas que usaron WannaCry y otros ransomware.',
                      'Desactive SMBv1.', 'desactivar_smb1'))
    elif smb1 == 'sin_permiso':
        res.append(_h('smb1', 'windows', 'SMBv1: hace falta permiso de administrador para revisarlo', 'info'))
    else:
        res.append(_h('smb1', 'windows', 'SMBv1 desactivado', 'ok'))
    if w.get('invitado'):
        res.append(_h('invitado', 'windows', 'La cuenta Invitado está activa', 'medio', 'Permite entrar al equipo sin contraseña.',
                      'Desactívela.', 'desactivar_invitado'))
    if w.get('uac') is False:
        res.append(_h('uac', 'windows', 'El Control de cuentas de usuario (UAC) está apagado', 'alto',
                      'Cualquier programa corre con permisos de administrador sin preguntar.', 'Active UAC.'))
    al = w.get('autologon') or {}
    if al.get('activo') and al.get('clave_guardada'):
        res.append(_h('autologon', 'windows', 'Windows entra solo con la contraseña guardada en el registro (sin cifrar)', 'alto',
                      'Cualquiera que lea el registro obtiene la contraseña de la cuenta.',
                      'Use Autologon de Sysinternals (la guarda cifrada) o quite el inicio automático.'))
    sistema_win = {'System', 'svchost', 'lsass', 'wininit', 'services', 'spoolsv', 'vmms', 'CastSrv'}
    vistos = set()
    for e in w.get('escucha') or []:
        puerto, proc, d = e.get('puerto'), e.get('proceso'), str(e.get('dir') or '')
        if d.startswith('127.') or d == '::1' or proc in sistema_win or (puerto, proc) in vistos:
            continue
        vistos.add((puerto, proc))
        servicio, riesgo, nota = puertos_conocidos.describir(int(puerto or 0))
        if riesgo in ('critico', 'alto', 'medio'):
            res.append(_h(f'win_puerto_{puerto}', 'red', f'{proc or "Un programa"} de Windows escucha en el puerto {puerto} ({servicio}) para toda la red',
                          riesgo, nota + ' Este programa está instalado en Windows, aparte de Supabase.',
                          'Si no se usa, desinstálelo o detenga su servicio; si se usa, que escuche solo en 127.0.0.1 o ciérrelo en el firewall.',
                          None, f'{d}:{puerto}'))
    for s in w.get('compartidos') or []:
        res.append(_h('compartido_' + str(s.get('nombre')), 'windows', f"Carpeta compartida en la red: {s.get('nombre')}", 'bajo',
                      f"Ruta: {s.get('ruta')}. Revise quién tiene acceso.", 'Quítela si no se usa.'))
    p = w.get('ultimo_parche')
    if p and p.get('fecha'):
        dias = (sistema.ahora().replace(tzinfo=None) - _dt.datetime.fromisoformat(p['fecha'])).days
        nivel = 'ok' if dias <= 45 else ('medio' if dias <= 90 else 'alto')
        res.append(_h('parches', 'windows', f"Última actualización de Windows instalada hace {dias} días ({p.get('id')})", nivel,
                      '' if nivel == 'ok' else 'Las actualizaciones corrigen fallas que los atacantes ya conocen.',
                      '' if nivel == 'ok' else 'Instale las actualizaciones pendientes en una hora de poco uso (el equipo puede reiniciarse).'))
    return res


def _rev_linux(lx: dict) -> list:
    res = []
    expuestos = []
    for c in lx.get('contenedores') or []:
        if c.get('privilegiado'):
            res.append(_h('privilegiado_' + c['nombre'], 'docker', f"El contenedor {c['nombre']} corre en modo privilegiado", 'alto',
                          'Un contenedor privilegiado puede tomar control de Ubuntu.', 'Quite «privileged» si no hace falta.'))
        if c.get('docker_sock') and not c['nombre'].startswith('supabase-'):
            res.append(_h('docker_sock_' + c['nombre'], 'docker', f"{c['nombre']} tiene acceso al control de Docker", 'medio',
                          'Quien controle ese contenedor controla todos los demás.', 'Revise si de verdad lo necesita.'))
        if c.get('estado') != 'running':
            continue          # apagado (p. ej. supavisor): no publica nada ni importa cuántas veces se reinició antes
        if (c.get('reinicios') or 0) >= 5:
            res.append(_h('reinicios_' + c['nombre'], 'docker', f"{c['nombre']} se ha reiniciado {c['reinicios']} veces", 'medio',
                          'Un contenedor que se cae y vuelve en bucle suele tener un error de configuración.', 'Revise su registro.'))
        for p in c.get('puertos') or []:
            if p['ip'] in ('0.0.0.0', '', '::'):
                expuestos.append((c['nombre'], p['puerto']))
    for nombre, puerto in expuestos:
        servicio, riesgo, nota = puertos_conocidos.describir(puerto)
        if puerto == 4040:
            res.append(_h('ngrok_4040', 'red', 'El inspector de ngrok (puerto 4040) está abierto a toda la red', 'alto',
                          'Cualquiera en la red que abra http://<servidor>:4040 ve todas las peticiones a la app con sus sesiones y '
                          'claves. Además ngrok ya no hace falta: la app entra por Cloudflare.',
                          'Detenga ngrok (botón «Arreglar»: lo apaga y le quita el arranque automático).', 'ngrok_solo_local',
                          f'{nombre} publica 0.0.0.0:4040'))
        elif puerto == 80:
            res.append(_h('puerto_80', 'red', 'La app escucha en el puerto 80 para la red local', 'ok',
                          'Es lo esperado: así los equipos de la planta entran por la IP del servidor.'))
        elif puerto == 8000:
            res.append(_h('puerto_8000_docker', 'red', 'La API de Supabase (8000) escucha en todas las interfaces', 'bajo',
                          'Con la red de WSL en espejo, cualquier equipo de la red llega a la API directa si el firewall lo deja '
                          '(ver el hallazgo del firewall).', 'Cierre el 8000 en el firewall; la app no lo necesita.', 'cerrar_puerto_8000'))
        elif riesgo in ('critico', 'alto', 'medio'):
            res.append(_h(f'puerto_{puerto}', 'red', f'{nombre} publica el puerto {puerto} ({servicio}) a toda la red', riesgo, nota,
                          'Publíquelo solo en 127.0.0.1 si nadie de la red lo necesita.'))
    perm = lx.get('permisos') or {}
    malos = [f"{k}={v}" for k, v in perm.items() if v and v not in ('600', '400')]
    if malos:
        res.append(_h('permisos_env', 'supabase', 'Los archivos con las claves del servidor los puede leer cualquier usuario de Ubuntu', 'medio',
                      'Deben tener permisos 600 (solo root).', 'Corrija los permisos.', 'permisos_env', ', '.join(malos)))
    elif perm:
        res.append(_h('permisos_env', 'supabase', 'Los archivos de claves tienen permisos correctos (600)', 'ok'))
    if lx.get('ejemplo'):
        res.append(_h('secretos_ejemplo', 'supabase', 'Supabase usa claves DE EJEMPLO públicas: ' + ', '.join(lx['ejemplo']), 'critico',
                      'Son las claves que vienen en la documentación de Supabase: cualquiera puede fabricar un acceso de administrador.',
                      'Genere claves nuevas (soporte) y reconstruya la app.'))
    else:
        res.append(_h('secretos_ejemplo', 'supabase', 'Las claves de Supabase son propias (no las de ejemplo)', 'ok'))
    if lx.get('dashboard_corta'):
        res.append(_h('dashboard_clave', 'supabase', 'La contraseña del tablero de Supabase (Studio) es corta', 'medio',
                      'Con ella se administra toda la base de datos.', 'Póngale al menos 12 caracteres.'))
    a = lx.get('auth') or {}
    if str(a.get('DISABLE_SIGNUP')).lower() != 'true':
        res.append(_h('registro_abierto', 'app', 'Cualquiera en internet puede crear una cuenta en IncubApp', 'info',
                      'El registro está abierto (DISABLE_SIGNUP=false). La app lo usa para el registro con empresa; las cuentas '
                      'nuevas quedan sin permisos hasta que un administrador las asigne.',
                      'Revise de vez en cuando «Usuarios nuevos» en la pestaña de accesos.'))
    if str(a.get('ENABLE_EMAIL_AUTOCONFIRM')).lower() == 'true':
        res.append(_h('autoconfirmar', 'app', 'Las cuentas nuevas no tienen que confirmar el correo', 'bajo',
                      'Alguien puede registrarse con un correo ajeno.', 'Con el correo ya funcionando, se puede pedir confirmación.'))
    if str(a.get('ENABLE_ANONYMOUS_USERS')).lower() == 'true':
        res.append(_h('anonimos', 'app', 'Supabase permite usuarios anónimos', 'medio', '', 'Desactívelo si la app no lo usa.'))
    sin_rls = lx.get('sin_rls')
    if sin_rls:
        res.append(_h('sin_rls', 'supabase', f'{len(sin_rls)} tabla(s) sin protección por filas (RLS)', 'alto',
                      'Con la clave pública de la app (que va dentro de la página) cualquiera puede leer y cambiar esas tablas '
                      'por la API.', 'Active RLS con políticas en esas tablas (soporte).', None, ', '.join(sin_rls[:20])))
    elif sin_rls is not None:
        res.append(_h('sin_rls', 'supabase', 'Todas las tablas de la app tienen protección por filas (RLS)', 'ok'))
    pa = lx.get('politicas_abiertas')
    if pa:
        res.append(_h('politicas_abiertas', 'supabase', f'{len(pa)} política(s) dejan escribir a cualquiera sin iniciar sesión', 'alto',
                      'Políticas para «anon/public» con condición «true» en INSERT/UPDATE/DELETE.', 'Revíselas con soporte.',
                      None, ', '.join(pa[:15])))
    if lx.get('clave_en_web'):
        res.append(_h('clave_en_web', 'app', 'La clave de servicio de Supabase aparece en los archivos de la página web', 'critico',
                      'Quien abra la app puede leerla y saltarse toda la seguridad de la base de datos.',
                      'Quítela del build de la app y genere claves nuevas.', None, ', '.join(lx['clave_en_web'])))
    else:
        res.append(_h('clave_en_web', 'app', 'La página web no lleva claves secretas', 'ok'))
    if lx.get('git_env'):
        res.append(_h('git_env', 'app', 'Hay archivos con secretos guardados en git', 'alto',
                      'Cualquiera con acceso al repositorio de GitHub los ve.', 'Sáquelos del repositorio y cambie esas claves.',
                      None, ', '.join(lx['git_env'][:10])))
    return res


def _rev_web(web: dict) -> list:
    res = []
    cab = web.get('cabeceras') or {}
    faltan = []
    if 'strict-transport-security' not in cab:
        faltan.append('HSTS')
    if cab.get('x-content-type-options', '').lower() != 'nosniff':
        faltan.append('X-Content-Type-Options')
    if 'x-frame-options' not in cab and 'frame-ancestors' not in cab.get('content-security-policy', ''):
        faltan.append('X-Frame-Options')
    if 'referrer-policy' not in cab:
        faltan.append('Referrer-Policy')
    if faltan:
        res.append(_h('cabeceras', 'web', 'A la web pública le faltan cabeceras de seguridad: ' + ', '.join(faltan), 'bajo',
                      'Protegen contra que metan la app dentro de otra página o la degraden a HTTP.',
                      'Agréguelas en nginx.conf (o en Cloudflare).'))
    else:
        res.append(_h('cabeceras', 'web', 'La web pública tiene las cabeceras de seguridad', 'ok'))
    dias = web.get('cert_dias')
    if dias is not None:
        res.append(_h('certificado', 'web', f'El certificado de {web["url"]} vence en {dias} días',
                      'ok' if dias >= 15 else ('alto' if dias < 5 else 'medio'),
                      '' if dias >= 15 else 'Cloudflare lo renueva solo; si no, revise el dominio en Cloudflare.'))
    expuestas = [r for r, v in (web.get('rutas') or {}).items() if v == 'expuesta']
    if expuestas:
        res.append(_h('archivos_expuestos', 'web', 'La web pública entrega archivos internos: ' + ', '.join(expuestas), 'critico',
                      'Pueden contener claves.', 'Bloquéelos en nginx.conf.'))
    else:
        res.append(_h('archivos_expuestos', 'web', 'La web no entrega .env ni la carpeta .git', 'ok'))
    d = web.get('desfase_s')
    if d is not None and abs(d) > 120:
        res.append(_h('hora', 'windows', f'El reloj del servidor está desfasado {abs(d)} s', 'medio',
                      'Con la hora mal, los inicios de sesión (tokens) y los certificados fallan.', 'Sincronice la hora de Windows.'))
    return res


def _rev_respaldo_disco() -> list:
    res = []
    try:
        lineas = (sistema.SERVIDOR_LOCAL / 'logs' / 'ultimo-respaldo.txt').read_text(encoding='utf-8').split()
        f = sistema.leer_iso(lineas[0])
        horas = (sistema.ahora() - f).total_seconds() / 3600 if f else None
        if not f or (lineas[1:2] != ['OK']):
            res.append(_h('respaldo', 'respaldo', 'El último respaldo falló', 'alto', 'Si se daña el disco o hay ransomware no hay copia reciente.',
                          'Revise el registro de respaldos y haga uno ahora.'))
        elif horas > 50:
            res.append(_h('respaldo', 'respaldo', f'No hay respaldo desde hace {horas:.0f} horas', 'alto', '', 'Haga un respaldo ahora.'))
        else:
            res.append(_h('respaldo', 'respaldo', f'Respaldo al día (hace {horas:.0f} h, en OneDrive)', 'ok'))
    except (OSError, IndexError):
        res.append(_h('respaldo', 'respaldo', 'No hay registro de respaldos', 'alto', '', 'Active el respaldo (4-ACTIVAR-RESPALDO.bat).'))
    u = shutil.disk_usage('C:\\')
    libre = u.free / u.total * 100
    if libre < 10:
        res.append(_h('disco', 'windows', f'Queda poco disco en C: ({libre:.0f} %)', 'alto' if libre < 5 else 'medio',
                      'Sin disco, la base de datos y los respaldos fallan.', 'Libere espacio (por ejemplo «Liberar espacio de Docker»).'))
    return res


# ── Auditoría ────────────────────────────────────────────────────────────────
def auditar(trabajo: trabajos.Trabajo | None = None) -> dict:
    t0 = time.time()
    linea = (lambda x: trabajo.linea(x)) if trabajo else (lambda x: None)
    avance = (lambda f, x: trabajo.avance(f, x)) if trabajo else (lambda f, x: None)
    hallazgos: list[dict] = []
    datos: dict = {}

    def paso(nombre, funcion, *args):
        try:
            return funcion(*args)
        except Exception as e:  # noqa: BLE001
            registro.exception('Auditoría: %s', nombre)
            hallazgos.append(_h('error_' + nombre, 'windows' if nombre == 'windows' else 'supabase',
                                f'No se pudo revisar: {nombre}', 'info', tachar(str(e))[:400]))
            return None

    avance(0.05, 'Revisando Windows (antivirus, firewall, cuentas, actualizaciones)…')
    datos['windows'] = paso('windows', _windows)
    if trabajo:
        trabajo.revisar()
    avance(0.4, 'Revisando Ubuntu, Docker y Supabase…')
    datos['linux'] = paso('ubuntu', _linux)
    if trabajo:
        trabajo.revisar()
    avance(0.75, 'Revisando la web pública…')
    datos['web'] = paso('web', _web, sistema.Ajustes.cargar().url_publica or sistema.URL_PUBLICA)
    for nombre, f, d in (('defender', _rev_defender, datos['windows']), ('firewall', _rev_firewall, datos['windows']),
                         ('windows', _rev_windows_varios, datos['windows']), ('linux', _rev_linux, datos['linux']),
                         ('web', _rev_web, datos['web'])):
        if d:
            r = paso(nombre, f, d)
            hallazgos.extend(r or [])
    hallazgos.extend(paso('respaldo', _rev_respaldo_disco) or [])
    hallazgos.sort(key=lambda h: (ORDEN.get(h['nivel'], 9), h['categoria']))
    resumen = {k: sum(1 for h in hallazgos if h['nivel'] == k) for k in ORDEN}
    puntaje = max(0, 100 - sum(PESOS.get(h['nivel'], 0) for h in hallazgos))
    resultado = {'generado': sistema.ahora_iso(), 'segundos': round(time.time() - t0, 1), 'puntaje': puntaje,
                 'resumen': resumen, 'hallazgos': hallazgos}
    sistema.guardar_json(RUTA, resultado)
    linea(f"Puntaje: {puntaje}/100 · críticos {resumen['critico']}, altos {resumen['alto']}, medios {resumen['medio']}")
    for h in hallazgos:
        if h['nivel'] not in ('ok', 'info'):
            linea(f"[{h['nivel'].upper()}] {h['titulo']}")
    return resultado


def ultima_auditoria() -> dict | None:
    return sistema.leer_json(RUTA, None)


# ── Arreglos ─────────────────────────────────────────────────────────────────
ARREGLOS = [
    {'id': 'activar_defender', 'titulo': 'Activar la protección en tiempo real', 'admin': True, 'peligro': 'bajo',
     'descripcion': 'Enciende la protección en tiempo real de Windows Defender. No afecta a la app.',
     'ps': "Set-MpPreference -DisableRealtimeMonitoring $false; Start-Sleep 2; 'Tiempo real: ' + (Get-MpComputerStatus).RealTimeProtectionEnabled"},
    {'id': 'analisis_rapido_defender', 'titulo': 'Análisis rápido del antivirus', 'admin': True, 'peligro': 'bajo',
     'descripcion': 'Revisa con Windows Defender los lugares donde suele esconderse el malware (5-15 min).',
     'ps': "Update-MpSignature -ErrorAction SilentlyContinue; Start-MpScan -ScanType QuickScan; 'Análisis terminado. Amenazas: ' + @(Get-MpThreatDetection -ErrorAction SilentlyContinue).Count"},
    {'id': 'actualizar_firmas_defender', 'titulo': 'Actualizar las firmas del antivirus', 'admin': True, 'peligro': 'bajo',
     'descripcion': 'Descarga las definiciones de virus más nuevas.',
     'ps': "Update-MpSignature; 'Firmas: ' + (Get-MpComputerStatus).AntivirusSignatureLastUpdated"},
    {'id': 'cerrar_puerto_8000', 'titulo': 'Cerrar el puerto 8000 a la red', 'admin': True, 'peligro': 'bajo',
     'descripcion': 'Deja la regla «IncubApp servidor local» solo con 80 y 443. La app sigue igual (entra por el 80).',
     'ps': "Set-NetFirewallRule -DisplayName 'IncubApp servidor local' -LocalPort 80,443; 'Regla: ' + (((Get-NetFirewallRule -DisplayName 'IncubApp servidor local') | Get-NetFirewallPortFilter).LocalPort -join ',')"},
    {'id': 'activar_firewall', 'titulo': 'Activar el firewall de Windows', 'admin': True, 'peligro': 'bajo',
     'descripcion': 'Enciende el firewall en los perfiles Dominio, Privado y Público.',
     'ps': "Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled True; Get-NetFirewallProfile | ForEach-Object { $_.Name + ': ' + $_.Enabled }"},
    {'id': 'desactivar_smb1', 'titulo': 'Desactivar SMBv1', 'admin': True, 'peligro': 'medio',
     'descripcion': 'Apaga la versión antigua de carpetas compartidas. Equipos con Windows XP dejarían de ver las carpetas de este equipo.',
     'ps': "Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force; 'SMBv1: ' + (Get-SmbServerConfiguration).EnableSMB1Protocol"},
    {'id': 'desactivar_invitado', 'titulo': 'Desactivar la cuenta Invitado', 'admin': True, 'peligro': 'bajo',
     'descripcion': 'Desactiva la cuenta Invitado de Windows.',
     'ps': "Get-LocalUser | Where-Object { $_.SID.Value -like '*-501' } | Disable-LocalUser; 'Invitado desactivado'"},
    {'id': 'ngrok_solo_local', 'titulo': 'Apagar ngrok', 'admin': False, 'peligro': 'bajo',
     'descripcion': 'Detiene ngrok (antiguo) y le quita el arranque automático. La app sigue entrando por Cloudflare. Cierra el inspector del puerto 4040.',
     'sh': "docker update --restart=no incubapp-ngrok-1 && docker stop incubapp-ngrok-1 && echo 'ngrok detenido y sin arranque automático.'"},
    {'id': 'permisos_env', 'titulo': 'Corregir permisos de los archivos de claves', 'admin': False, 'peligro': 'bajo',
     'descripcion': 'Deja los .env del servidor con permiso 600 (solo root).',
     'sh': "for f in /opt/incubapp/server/.env /opt/incubapp/tunel.env /opt/incubapp/n8n/.env; do [ -f \"$f\" ] && chmod 600 \"$f\" && echo \"600 $f\"; done"},
]
_POR_ID = {a['id']: a for a in ARREGLOS}


def arreglos() -> list[dict]:
    return [{k: a[k] for k in ('id', 'titulo', 'descripcion', 'admin', 'peligro')} for a in ARREGLOS]


def aplicar_arreglo(trabajo: trabajos.Trabajo, id_: str) -> dict:
    a = _POR_ID.get(id_)
    if not a:
        raise ValueError('Ese arreglo no existe.')
    trabajo.linea(f"Aplicando: {a['titulo']}")
    if a.get('ps'):
        trabajo.linea('Windows le pedirá permiso de administrador en la pantalla: acéptelo para continuar.')
        r = sistema.powershell_admin(a['ps'], timeout=1800)
    else:
        r = sistema.wsl(a['sh'], timeout=120)
    trabajo.linea(tachar(r.texto) or '(sin salida)')
    if not r.ok:
        raise RuntimeError(r.error or 'No se pudo aplicar el arreglo.')
    return {'ok': True, 'mensaje': f"Listo: {a['titulo']}. Vuelva a auditar para confirmar."}


# ── Puertos, conexiones y accesos ────────────────────────────────────────────
PS_ESCUCHA = r'''
$p = @{}; Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $p[$_.Id] = $_.ProcessName }
@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object { @{ dir=$_.LocalAddress; puerto=$_.LocalPort; pid=$_.OwningProcess; proceso=$p[[int]$_.OwningProcess] } }) | ConvertTo-Json -Compress
'''


def puertos_escuchando() -> list[dict]:
    res = []
    win, _ = sistema.powershell_json(PS_ESCUCHA, timeout=60)
    vistos = set()
    for x in sistema.lista(win):
        clave = (x.get('dir'), x.get('puerto'))
        if clave in vistos:
            continue
        vistos.add(clave)
        res.append(_puerto(x.get('puerto'), x.get('dir'), x.get('proceso'), None, 'windows'))
    lx, _ = sistema.wsl_json(r'''python3 - <<'PY'
import json, re, subprocess
ss = subprocess.run(['ss', '-ltnpH'], capture_output=True, text=True).stdout
dp = subprocess.run(['docker', 'ps', '--format', '{{.Names}}|{{.Ports}}'], capture_output=True, text=True).stdout
mapa = {}
for l in dp.splitlines():
    n, _, ps = l.partition('|')
    for m in re.finditer(r':(\d+)->', ps):
        mapa[int(m.group(1))] = n
out = []
for l in ss.splitlines():
    p = l.split()
    if len(p) < 4: continue
    d, _, pt = p[3].rpartition(':')
    m = re.search(r'\(\("([^"]+)"', l)
    pt = int(pt) if pt.isdigit() else 0
    out.append({'dir': d.strip('[]').split('%')[0], 'puerto': pt, 'proceso': m.group(1) if m else None, 'contenedor': mapa.get(pt)})
print(json.dumps(out))
PY''', timeout=40)
    for x in lx or []:
        clave = ('u', x.get('dir'), x.get('puerto'))
        if clave in vistos:
            continue
        vistos.add(clave)
        res.append(_puerto(x.get('puerto'), x.get('dir'), x.get('proceso'), x.get('contenedor'), 'ubuntu'))
    res.sort(key=lambda p: (not p['expuesto'], ORDEN.get(p['riesgo'], 9), p['puerto']))
    return res


def _puerto(puerto, direccion, proceso, contenedor, lado) -> dict:
    direccion = str(direccion or '')
    local = direccion.startswith('127.') or direccion in ('::1', 'localhost') or direccion.startswith('10.255.255.')
    servicio, riesgo, nota = puertos_conocidos.describir(int(puerto or 0))
    if local:
        riesgo, nota = 'ok', 'Solo accesible desde este equipo.' + (f' ({servicio})' if servicio != 'Desconocido' else '')
    elif puerto == 80:
        riesgo, nota = 'ok', 'La app para la red local (esperado).'
    elif proceso in ('System', 'svchost', 'lsass', 'wininit', 'services', 'spoolsv') and puerto in (135, 139, 445) or (puerto or 0) >= 49152:
        riesgo = 'info' if riesgo != 'critico' else riesgo
    return {'puerto': puerto, 'direccion': direccion, 'proceso': proceso, 'contenedor': contenedor, 'lado': lado,
            'expuesto': not local, 'servicio': servicio, 'riesgo': riesgo, 'nota': nota}


PS_CONEXIONES = r'''
$p = @{}; Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $p[$_.Id] = @($_.ProcessName, $_.Path) }
@(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object { $_.RemoteAddress -notin @('127.0.0.1','::1') } |
  ForEach-Object { $x = $p[[int]$_.OwningProcess]; @{ local="$($_.LocalAddress):$($_.LocalPort)"; remoto=$_.RemoteAddress; puerto=$_.RemotePort; pid=$_.OwningProcess; proceso=$x[0]; ruta=$x[1] } }) | ConvertTo-Json -Compress
'''
PUERTOS_NORMALES = {80, 443, 53, 7844, 8443, 5228, 993, 587, 8025, 2525, 465, 25, 3478, 445, 22}


def conexiones_activas() -> list[dict]:
    datos, _ = sistema.powershell_json(PS_CONEXIONES, timeout=60)
    res = []
    for x in sistema.lista(datos):
        nota = None
        ruta = str(x.get('ruta') or '')
        if '\\temp\\' in ruta.lower() or '\\appdata\\local\\temp' in ruta.lower():
            nota = 'Programa que corre desde una carpeta temporal (sospechoso)'
        elif x.get('puerto') not in PUERTOS_NORMALES and not str(x.get('remoto', '')).startswith(('192.168.', '10.', '172.')):
            nota = f"Puerto remoto poco común ({x.get('puerto')})"
        res.append({'local': x.get('local'), 'remoto': f"{x.get('remoto')}:{x.get('puerto')}", 'proceso': x.get('proceso'),
                    'pid': x.get('pid'), 'ruta': ruta or None, 'estado': 'Established', 'nota': nota})
    res.sort(key=lambda c: (c['nota'] is None, c['proceso'] or ''))
    return res


def accesos_app(horas: int = 24) -> dict:
    horas = max(1, min(int(horas), 24 * 31))
    script = f'''docker logs --since {horas}h supabase-auth 2>&1 | python3 -c '
import json, sys, collections
ok = collections.Counter(); ult = {{}}; fall_ip = collections.Counter(); ok_ip = collections.Counter(); fallidos = 0
for l in sys.stdin:
    i = l.find("{{")
    if i < 0: continue
    try: d = json.loads(l[i:])
    except ValueError: continue
    if d.get("path") != "/token" or d.get("grant_type") != "password": continue
    ip = d.get("remote_addr") or "?"
    if d.get("status") == 200:
        u = ((d.get("auth_event") or {{}}).get("actor_username")) or "?"
        ok[u] += 1; ult[u] = d.get("time"); ok_ip[ip] += 1
    elif d.get("status") in (400, 401, 422, 429):
        fallidos += 1; fall_ip[ip] += 1
print(json.dumps({{"ok": ok, "ult": ult, "fall_ip": fall_ip, "ok_ip": ok_ip, "fallidos": fallidos}}))
'
echo '@@'
docker exec supabase-db psql -U postgres -d postgres -tAX -F '|' -c "select email, created_at from auth.users where created_at > now() - interval '{horas} hours' order by created_at desc limit 50"
'''
    r = sistema.wsl(script, timeout=120)
    parte, _, nuevos_txt = r.salida.partition('@@')
    try:
        d = json.loads(parte.strip() or '{}')
    except ValueError:
        d = {}
    ok, ult, fall_ip, ok_ip = d.get('ok') or {}, d.get('ult') or {}, d.get('fall_ip') or {}, d.get('ok_ip') or {}
    nuevos = [{'correo': a, 'creado': b} for a, _, b in (x.partition('|') for x in nuevos_txt.strip().splitlines()) if a]
    alertas = []
    for ip, n in fall_ip.items():
        if n > 10:
            alertas.append(_h('fuerza_bruta_' + ip, 'app', f'{n} intentos fallidos de inicio de sesión desde {ip}', 'alto' if n > 30 else 'medio',
                              'Muchos intentos fallidos seguidos desde una misma dirección pueden ser alguien adivinando contraseñas.',
                              'Si no reconoce la dirección, bloquéela en Cloudflare (Security → WAF → Tools).'))
    return {'generado': sistema.ahora_iso(), 'horas': horas, 'ingresos_ok': sum(ok.values()), 'fallidos': d.get('fallidos', 0),
            'por_usuario': sorted(({'correo': u, 'ok': n, 'fallidos': None, 'ultimo': ult.get(u)} for u, n in ok.items()),
                                  key=lambda x: -x['ok']),
            'por_ip': sorted(({'ip': ip, 'fallidos': fall_ip.get(ip, 0), 'ok': ok_ip.get(ip, 0)} for ip in set(fall_ip) | set(ok_ip)),
                             key=lambda x: (-x['fallidos'], -x['ok']))[:50],
            'usuarios_nuevos': nuevos, 'alertas': alertas,
            'nota': 'Los intentos fallidos se cuentan por dirección IP (Supabase no registra el correo cuando la clave es incorrecta).'}
