#!/usr/bin/env python3
"""Panel IncubApp · estado del lado de Ubuntu.

Lo corre el panel (desde Windows) con: bash estado.sh rapido|completo
Imprime UN solo JSON y nada más. Cada consulta tiene su propio tiempo límite: si una falla,
su campo queda en null y el resto sigue (el panel no se puede quedar sin datos porque un
contenedor no contesta).
"""
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

SRV = '/opt/incubapp/server'
APP = 'incubapp-incubapp-1'


def correr(cmd, timeout=8):
    """Corre un comando (lista o texto de bash). Devuelve (código, salida) sin lanzar."""
    try:
        p = subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, timeout=timeout,
                           executable='/bin/bash' if isinstance(cmd, str) else None)
        return p.returncode, p.stdout.decode('utf-8', 'replace')
    except subprocess.TimeoutExpired:
        return -9, ''
    except Exception as e:  # noqa: BLE001
        return -1, str(e)


def http(url, timeout=5):
    """Código HTTP y milisegundos con curl (como el vigilante de arranque.sh)."""
    c, out = correr(['curl', '-s', '-o', '/dev/null', '-m', str(timeout), '-w', '%{http_code} %{time_total}', url],
                    timeout + 2)
    try:
        codigo, t = out.split()
        return {'codigo': int(codigo), 'ms': round(float(t) * 1000)}
    except ValueError:
        return {'codigo': 0, 'ms': None}


def contenedores():
    c, out = correr(['docker', 'ps', '-a', '--no-trunc', '--format', '{{json .}}'], 25)
    if c != 0:
        return None
    lista = []
    for linea in out.splitlines():
        try:
            d = json.loads(linea)
        except ValueError:
            continue
        etiquetas = dict(x.split('=', 1) for x in (d.get('Labels') or '').split(',') if '=' in x)
        estado_txt = d.get('Status', '')
        salud = 'none'
        if '(healthy)' in estado_txt:
            salud = 'healthy'
        elif '(unhealthy)' in estado_txt:
            salud = 'unhealthy'
        elif 'health: starting' in estado_txt:
            salud = 'starting'
        lista.append({
            'nombre': d.get('Names', ''), 'estado': d.get('State', ''), 'estado_texto': estado_txt,
            'salud': salud, 'puertos': d.get('Ports', ''), 'imagen': d.get('Image', ''),
            'proyecto': etiquetas.get('com.docker.compose.project'),
            'servicio': etiquetas.get('com.docker.compose.service'),
        })
    if lista:
        # Inicio, reinicios y código de salida en una sola llamada.
        c, out = correr(['docker', 'inspect', '--format',
                         '{{.Name}}|{{.State.StartedAt}}|{{.RestartCount}}|{{.State.ExitCode}}|{{.HostConfig.RestartPolicy.Name}}|{{.State.FinishedAt}}']
                        + [x['nombre'] for x in lista], 25)
        extra = {}
        for linea in out.splitlines():
            p = linea.split('|')
            if len(p) == 6:
                extra[p[0].lstrip('/')] = p[1:]
        for x in lista:
            e = extra.get(x['nombre'])
            if e:
                x['iniciado'] = e[0] if not e[0].startswith('0001') else None
                x['reinicios'] = int(e[1]) if e[1].isdigit() else 0
                x['codigo_salida'] = int(e[2]) if e[2].lstrip('-').isdigit() else None
                x['politica'] = e[3]
                x['terminado'] = e[4] if not e[4].startswith('0001') else None
    return lista


def memoria():
    try:
        datos = {}
        with open('/proc/meminfo') as f:
            for linea in f:
                k, v = linea.split(':', 1)
                datos[k] = int(v.split()[0]) // 1024
        total = datos['MemTotal']
        disponible = datos.get('MemAvailable', datos.get('MemFree', 0))
        return {'ram_total_mb': total, 'ram_usada_mb': total - disponible,
                'swap_total_mb': datos.get('SwapTotal', 0),
                'swap_usada_mb': datos.get('SwapTotal', 0) - datos.get('SwapFree', 0)}
    except Exception:  # noqa: BLE001
        return None


def disco():
    try:
        s = os.statvfs('/')
        return {'disco_total_gb': round(s.f_blocks * s.f_frsize / 1e9, 1),
                'disco_libre_gb': round(s.f_bavail * s.f_frsize / 1e9, 1)}
    except OSError:
        return None


def systemd():
    """Estado de los servicios de IncubApp en Ubuntu (fechas en epoch)."""
    unidades = ['docker.service', 'incubapp-arranque.service', 'incubapp-vigia.timer',
                'incubapp-vigia.service', 'incubapp-respaldo.timer']
    c, out = correr(['systemctl', 'show', '--timestamp=unix', '-p', 'Id', '-p', 'ActiveState', '-p', 'SubState',
                     '-p', 'Result', '-p', 'LastTriggerUSec', '-p', 'NextElapseUSecRealtime',
                     '-p', 'ExecMainExitTimestamp'] + unidades, 8)
    res = {}
    actual = {}
    for linea in out.splitlines() + ['']:
        if not linea.strip():
            if actual.get('Id'):
                res[actual['Id']] = actual
            actual = {}
            continue
        k, _, v = linea.partition('=')
        if v.startswith('@'):
            try:
                v = int(v[1:])
            except ValueError:
                pass
        elif v in ('', 'n/a'):
            v = None
        actual[k] = v
    return res or None


def psql(sql, timeout=8):
    c, out = correr(['docker', 'exec', 'supabase-db', 'psql', '-U', 'postgres', '-d', 'postgres',
                     '-tAX', '-F', '|', '-c', sql], timeout)
    return out.strip() if c == 0 else None


def base():
    r = {}
    v = psql("select pg_database_size(current_database()), pg_size_pretty(pg_database_size(current_database())),"
             " (select count(*) from pg_stat_activity),"
             " (select count(*) from auth.users),"
             " (select count(distinct user_id) from auth.sessions where coalesce(refreshed_at, updated_at, created_at) > now() - interval '15 minutes'),"
             " (select count(distinct user_id) from auth.sessions where coalesce(refreshed_at, updated_at, created_at) > now() - interval '60 minutes')")
    if v is None:
        return None
    p = v.split('|')
    if len(p) >= 6:
        r = {'tamano_bytes': int(p[0]), 'tamano': p[1], 'conexiones': int(p[2]), 'usuarios': int(p[3]),
             'activos_15min': int(p[4]), 'activos_1h': int(p[5])}
    t = psql("select n.nspname||'.'||c.relname, pg_size_pretty(pg_total_relation_size(c.oid)) from pg_class c"
             " join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','storage','auth')"
             " order by pg_total_relation_size(c.oid) desc limit 5")
    r['tablas_grandes'] = [{'tabla': a, 'tamano': b} for a, b in (x.split('|', 1) for x in (t or '').splitlines() if '|' in x)]
    return r


def tunel():
    c, out = correr(['docker', 'exec', APP, 'wget', '-q', '-T', '6', '-O', '-', 'http://incubapp-tunel:2000/metrics'], 15)
    if c != 0:
        # No se pudo preguntar (equipo muy cargado, app caída…): eso no dice que el túnel esté caído.
        return {'listo': None, 'conexiones': None, 'peticiones': None, 'errores': None, 'alcanzable': False}
    def valor(nombre):
        m = re.search(r'^' + nombre + r'(?:\{[^}]*\})?\s+([0-9.e+]+)', out, re.M)
        return int(float(m.group(1))) if m else None
    con = valor('cloudflared_tunnel_ha_connections') or 0
    return {'listo': con > 0, 'conexiones': con, 'peticiones': valor('cloudflared_tunnel_total_requests'),
            'errores': valor('cloudflared_tunnel_request_errors'), 'alcanzable': True}


def asistente():
    """True responde · False no responde · None no se pudo preguntar (se venció el tiempo)."""
    c, _ = correr(['docker', 'exec', APP, 'wget', '-q', '-T', '6', '-O', '/dev/null', 'http://incubapp-asistente:8080/'], 15)
    return True if c == 0 else (None if c == -9 else False)


def lector():
    c, out = correr('docker logs --tail 20 --timestamps incubapp-lector 2>&1', 8)
    return out.splitlines()[-20:] if c == 0 else None


def vigilante():
    c, out = correr(['tail', '-n', '30', '/var/log/incubapp-arranque.log'], 4)
    return out.splitlines() if c == 0 else []


def correo():
    smtp = {}
    try:
        with open(f'{SRV}/.env', encoding='utf-8', errors='replace') as f:
            for linea in f:
                k, _, v = linea.strip().partition('=')
                if k in ('SMTP_HOST', 'SMTP_PORT', 'SMTP_ADMIN_EMAIL'):
                    smtp[k] = v.strip().strip('"')
    except OSError:
        return None
    return {'host': smtp.get('SMTP_HOST') or None, 'puerto': smtp.get('SMTP_PORT') or None,
            'remitente': smtp.get('SMTP_ADMIN_EMAIL') or None}


def stats():
    c, out = correr(['docker', 'stats', '--no-stream', '--format', '{{json .}}'], 20)
    if c != 0:
        return None
    unidades = {'b': 1, 'kib': 1024, 'kb': 1000, 'mib': 1024**2, 'mb': 1000**2, 'gib': 1024**3, 'gb': 1000**3}

    def mb(texto):
        m = re.match(r'([0-9.]+)\s*([A-Za-z]+)', texto.strip())
        if not m:
            return None
        return round(float(m.group(1)) * unidades.get(m.group(2).lower(), 1) / 1024**2, 1)
    res = {}
    for linea in out.splitlines():
        try:
            d = json.loads(linea)
        except ValueError:
            continue
        usado, _, limite = (d.get('MemUsage') or '').partition('/')
        try:
            cpu = float((d.get('CPUPerc') or '0').rstrip('%'))
        except ValueError:
            cpu = None
        res[d.get('Name')] = {'cpu': cpu, 'mem_mb': mb(usado), 'mem_limite_mb': mb(limite)}
    return res


def leer(ruta):
    try:
        with open(ruta, encoding='utf-8', errors='replace') as f:
            return f.read().strip()
    except OSError:
        return None


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else 'rapido'
    t0 = time.time()
    trabajos = {
        'contenedores': contenedores,
        'app': lambda: http('http://127.0.0.1/'),
        'api': lambda: http('http://127.0.0.1/auth/v1/health'),
        'memoria': memoria,
        'disco': disco,
        'systemd': systemd,
    }
    if modo == 'completo':
        trabajos.update({
            'stats': stats, 'base': base, 'tunel': tunel, 'asistente': asistente, 'lector': lector,
            'n8n': lambda: http('http://127.0.0.1:5678/healthz', 4), 'vigilante': vigilante, 'correo': correo,
            'docker_version': lambda: correr(['docker', 'version', '-f', '{{.Server.Version}}'], 6)[1].strip() or None,
            'respaldo_destino': lambda: leer('/opt/incubapp/respaldo-destino'),
            'tunel_configurado': lambda: os.path.exists('/opt/incubapp/tunel.env'),
        })
    salida = {'modo': modo}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futuros = {k: ex.submit(f) for k, f in trabajos.items()}
        for k, fut in futuros.items():
            try:
                salida[k] = fut.result(timeout=30)
            except Exception:  # noqa: BLE001
                salida[k] = None
    try:
        with open('/proc/loadavg') as f:
            salida['carga'] = [float(x) for x in f.read().split()[:3]]
    except OSError:
        salida['carga'] = None
    salida['docker_ok'] = salida.get('contenedores') is not None
    salida['segundos'] = round(time.time() - t0, 2)
    print(json.dumps(salida, ensure_ascii=False))


if __name__ == '__main__':
    main()
