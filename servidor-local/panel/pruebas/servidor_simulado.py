"""Panel IncubApp · servidor SIMULADO para desarrollar la interfaz.

Sirve la carpeta web/ y responde las rutas /api/… con datos falsos que tienen las formas
EXACTAS de DISENO.md (ESTADO, METRICAS, EVENTO, ACCION, TRABAJO, AUDITORIA, RED…). No toca
el sistema: no corre comandos, no abre puertos fuera de 127.0.0.1 y no escanea nada.

    python pruebas/servidor_simulado.py            → http://127.0.0.1:8799/entrar?llave=prueba
    python pruebas/servidor_simulado.py --puerto 8800

Acepta cualquier llave/cookie (pero exige que haya cookie, para poder ver la pantalla de
«sin sesión» entrando directo a /). Exige la cabecera X-Panel: 1 en todo lo que no sea GET,
igual que el panel real, y manda la misma Content-Security-Policy.

Controles para probar la interfaz (GET, sin sesión):
    /sim?nivel=falla|aviso|ok|auto     fuerza el estado general
    /sim?r503=/api/red                 esa ruta responde 503 (llamar otra vez para quitarlo)
    /sim?caida=20                      durante 20 s no responde nada (conexión perdida)
    /sim?sin_sesion=1|0                responde 401 a todo
"""
from __future__ import annotations

import argparse
import datetime as _dt
import http.server
import json
import math
import mimetypes
import random
import re
import socketserver
import threading
import time
import urllib.parse
import uuid
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / 'web'
ZONA = _dt.timezone(_dt.timedelta(hours=-5))
INICIO = time.time()
CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'"

SIM = {'nivel': 'auto', 'r503': set(), 'caida_hasta': 0.0, 'sin_sesion': False}
CANDADO = threading.Lock()
rnd = random.Random(7)


def iso(ts: float | None) -> str | None:
    if ts is None:
        return None
    return _dt.datetime.fromtimestamp(ts, ZONA).isoformat(timespec='seconds')


def ahora_iso() -> str:
    return iso(time.time())


# ═══════════════════════════ ESTADO ═══════════════════════════
CONTENEDORES = [
    # nombre, servicio, proyecto, imagen, puertos, mem, limite, cpu, salud, sobra, desde_h
    ('incubapp-incubapp-1', 'incubapp', 'incubapp', 'incubapp-incubapp:latest', '0.0.0.0:80->80/tcp', 18.2, 5926, 0.1, 'none', False, 30),
    ('supabase-db', 'db', 'supabase', 'supabase/postgres:15.8.1.060', '5432/tcp', 434.6, 5926, 8.8, 'healthy', False, 30),
    ('supabase-auth', 'auth', 'supabase', 'supabase/gotrue:v2.177.0', '', 21.4, 5926, 0.0, 'healthy', False, 30),
    ('supabase-rest', 'rest', 'supabase', 'postgrest/postgrest:v12.2.12', '3000/tcp', 31.0, 5926, 0.2, 'none', False, 30),
    ('supabase-storage', 'storage', 'supabase', 'supabase/storage-api:v1.25.7', '5000/tcp', 96.3, 5926, 0.1, 'healthy', False, 30),
    ('realtime-dev.supabase-realtime', 'realtime', 'supabase', 'supabase/realtime:v2.34.47', '', 164.7, 5926, 1.4, 'healthy', False, 30),
    ('supabase-envoy', 'envoy', 'supabase', 'envoyproxy/envoy:v1.33-latest', '0.0.0.0:8000->8000/tcp, 0.0.0.0:8443->8443/tcp', 43.1, 5926, 0.6, 'healthy', False, 30),
    ('supabase-meta', 'meta', 'supabase', 'supabase/postgres-meta:v0.91.0', '8080/tcp', 72.8, 5926, 0.0, 'healthy', False, 30),
    ('supabase-edge-functions', 'functions', 'supabase', 'supabase/edge-runtime:v1.69.6', '', 58.0, 5926, 0.0, 'none', False, 30),
    ('supabase-studio', 'studio', 'supabase', 'supabase/studio:2025.06.30', '3000/tcp', 0, 5926, 0, 'none', True, 30),
    ('supabase-pooler', 'supavisor', 'supabase', 'supabase/supavisor:2.5.7', '', 0, 5926, 0, 'none', True, 30),
    ('supabase-imgproxy', 'imgproxy', 'supabase', 'darthsim/imgproxy:v3.8.0', '8080/tcp', 0, 5926, 0, 'none', True, 30),
    ('supabase-correo-plantillas-1', 'correo-plantillas', 'supabase', 'nginx:alpine', '80/tcp', 3.9, 5926, 0.0, 'none', False, 30),
    ('incubapp-tunel', 'tunel', 'incubapp', 'cloudflare/cloudflared:latest', '', 24.6, 5926, 0.3, 'none', False, 6.5),
    ('incubapp-ngrok-1', 'ngrok', 'incubapp', 'ngrok/ngrok:latest', '0.0.0.0:4040->4040/tcp', 15.0, 5926, 0.0, 'none', False, 30),
    ('incubapp-lector', 'lector', 'incubapp', 'incubapp-lector:latest', '', 212.5, 1024, 0.4, 'none', False, 30),
    ('incubapp-asistente', 'asistente', 'incubapp', 'incubapp-asistente:latest', '8080/tcp', 188.0, 1024, 0.2, 'healthy', False, 2.1),
    ('incubapp-n8n', 'n8n', 'incubapp', 'n8nio/n8n:1.110.1', '127.0.0.1:5678->5678/tcp', 241.3, 5926, 0.5, 'none', False, 30),
]
DETENIDOS: set[str] = set()       # los que la simulación «apagó» con acciones


def _cpu_actual() -> float:
    t = time.time()
    return round(max(1.0, 14 + 9 * math.sin(t / 47) + rnd.uniform(-4, 6)), 1)


def contenedores() -> list[dict]:
    salida = []
    for (nombre, servicio, proyecto, imagen, puertos, mem, limite, cpu, salud, sobra, desde_h) in CONTENEDORES:
        apagado = sobra or nombre in DETENIDOS
        if apagado:
            estado, salud_, texto, nivel = 'exited', 'none', 'Exited (0) 30 hours ago', 'apagado'
        else:
            estado, salud_ = 'running', salud
            texto = f'Up {int(desde_h)} hours' + (f' ({salud})' if salud != 'none' else '')
            nivel = 'ok'
        if nombre == 'incubapp-asistente' and not apagado:
            nivel = 'aviso'
        c = {
            'nombre': nombre, 'servicio': servicio, 'proyecto': proyecto, 'estado': estado,
            'salud': salud_, 'estado_texto': texto, 'desde': iso(time.time() - desde_h * 3600),
            'reinicios': 3 if nombre == 'incubapp-asistente' else 0,
            'cpu': None if apagado else round(max(0.0, cpu + rnd.uniform(-0.3, 0.6)), 1),
            'mem_mb': None if apagado else round(mem * rnd.uniform(0.97, 1.03), 1),
            'mem_limite_mb': limite, 'puertos': '' if apagado else puertos,
            'imagen': imagen, 'nivel': nivel, 'sobra': sobra,
        }
        salida.append(c)
    return salida


def _comp(id_, nombre, grupo, nivel, estado, detalle=None, desde_h=30.0, contenedor=None, acciones=None, datos=None):
    return {'id': id_, 'nombre': nombre, 'grupo': grupo, 'nivel': nivel, 'estado': estado,
            'detalle': detalle, 'desde': iso(time.time() - desde_h * 3600), 'contenedor': contenedor,
            'acciones': acciones or [], 'datos': datos or {}}


def componentes(forzado: str) -> list[dict]:
    cpu = _cpu_actual()
    falla = forzado == 'falla'
    aviso = forzado == 'aviso'
    ms_app = rnd.randint(22, 60)
    det = lambda n: 'apagado' if n in DETENIDOS else None  # noqa: E731
    lista = [
        _comp('equipo', 'Equipo Windows', 'Servidor', 'ok', f'CPU {cpu:.0f} % · RAM 50 % · Disco C: 47 % libre',
              'DESKTOP-ROMOGM3 · Windows 11 Pro 24H2 · Intel Core i3-4160 · 12 GB RAM', 30),
        _comp('wsl', 'Ubuntu (WSL)', 'Servidor', 'ok', 'Ubuntu encendido · RAM 2,3 de 5,8 GB',
              'Ubuntu-24.04 · systemd activo · red en espejo (192.168.5.28)', 30, None,
              ['arrancar_servidor', 'reiniciar_wsl']),
        _comp('docker', 'Docker', 'Servidor', 'ok', 'Docker 29.5.3 · 15 de 18 contenedores encendidos',
              'Docker Engine 29.5.3 · 3 apagados a propósito (studio, pooler, imgproxy)', 30, None,
              ['estado_docker', 'limpiar_docker']),
        _comp('app', 'App IncubApp', 'Acceso', 'falla' if falla else 'ok',
              'No responde (502)' if falla else f'Responde en {ms_app} ms',
              'curl http://127.0.0.1/ → 502 Bad Gateway' if falla else 'curl http://127.0.0.1/ → 200',
              0.05 if falla else 30, 'incubapp-incubapp-1', ['reiniciar_app', 'reiniciar_contenedor']),
        _comp('api', 'API de Supabase', 'Acceso', 'falla' if falla else 'ok',
              'No responde' if falla else f'Responde en {ms_app + 14} ms (401)',
              '/auth/v1/health por nginx', 0.05 if falla else 30, 'supabase-envoy', ['reiniciar_supabase']),
        _comp('publico', 'Dirección pública', 'Acceso', 'aviso' if aviso else 'ok',
              'Responde lento (2,4 s)' if aviso else f'https://incubapp.cdhmaker.com responde en {rnd.randint(300, 520)} ms',
              'Certificado válido por 75 días más (Cloudflare)', 5),
        _comp('tunel', 'Túnel de Cloudflare', 'Acceso', 'ok', 'Conectado con 4 conexiones',
              'incubapp-tunel · /ready = 200 · 1.590 peticiones, 0 errores', 6.5, 'incubapp-tunel',
              ['recrear_tunel', 'reiniciar_contenedor']),
        _comp('ngrok', 'ngrok (antiguo)', 'Acceso', 'aviso', 'Encendido; ya no hace falta',
              'Expone el inspector en el puerto 4040 a toda la red. La app entra por Cloudflare.', 30,
              'incubapp-ngrok-1', ['detener_contenedor']),
        _comp('base', 'Base de datos', 'Supabase', 'falla' if falla else 'ok',
              'No acepta conexiones' if falla else 'Responde · 252 MB · 40 conexiones',
              'Postgres 15.8 · 52 usuarios · 3 activos en 15 min', 30, 'supabase-db', ['reiniciar_contenedor']),
        _comp('auth', 'Cuentas (auth)', 'Supabase', 'ok', 'Sano', None, 30, 'supabase-auth', ['reiniciar_contenedor']),
        _comp('rest', 'API REST', 'Supabase', 'ok', 'Encendido', None, 30, 'supabase-rest', ['reiniciar_contenedor']),
        _comp('storage', 'Archivos y fotos', 'Supabase', 'ok', 'Sano', None, 30, 'supabase-storage', ['reiniciar_contenedor']),
        _comp('realtime', 'Tiempo real', 'Supabase', 'ok', 'Sano', None, 30, 'realtime-dev.supabase-realtime', ['reiniciar_contenedor']),
        _comp('envoy', 'Puerta de la API (envoy)', 'Supabase', 'ok', 'Sano · puerto 8000', None, 30, 'supabase-envoy', ['reiniciar_contenedor']),
        _comp('meta', 'Meta', 'Supabase', 'ok', 'Sano', None, 30, 'supabase-meta', ['reiniciar_contenedor']),
        _comp('edge', 'Funciones (edge)', 'Supabase', 'ok', 'Encendido', None, 30, 'supabase-edge-functions', ['reiniciar_contenedor']),
        _comp('studio', 'Studio', 'Supabase', 'apagado', 'Apagado a propósito en producción',
              'Se enciende solo para administrar la base y se vuelve a apagar.', 30, 'supabase-studio', ['studio_encender']),
        _comp('pooler', 'Supavisor (pooler)', 'Supabase', 'apagado', 'Apagado a propósito en producción', None, 30, 'supabase-pooler'),
        _comp('imgproxy', 'imgproxy', 'Supabase', 'apagado', 'Apagado a propósito en producción', None, 30, 'supabase-imgproxy'),
        _comp('correo', 'Correo', 'Supabase', 'ok', 'SMTP configurado · plantillas en español',
              'SMTP_HOST=mail.smtp2go.com (puerto 2525)', 26, 'supabase-correo-plantillas-1', ['probar_correo']),
        _comp('lector', 'Lector de fotos', 'Servicios IncubApp', 'ok', 'Encendido', None, 30, 'incubapp-lector', ['reiniciar_contenedor']),
        _comp('asistente', 'Asistente de voz', 'Servicios IncubApp', 'aviso', 'Responde lento (2,1 s) · 3 reinicios',
              'GET http://incubapp-asistente:8080/ → 200 en 2.140 ms', 2.1, 'incubapp-asistente', ['reiniciar_contenedor']),
        _comp('n8n', 'n8n', 'Servicios IncubApp', 'ok', 'Responde (healthz)', None, 30, 'incubapp-n8n', ['reiniciar_contenedor']),
        _comp('respaldo', 'Respaldo diario', 'Mantenimiento', 'ok', 'Último hace 8 h · OK',
              'Próximo: hoy 2:00 a. m. · destino OneDrive\\IncubApp-Respaldos', 8.6, None, ['respaldo_ahora']),
        _comp('vigilante', 'Vigilante', 'Mantenimiento', 'ok', 'Revisó hace 40 s', 'incubapp-vigia.timer activo (cada minuto)', 30, None, ['revisar_todo']),
        _comp('arranque', 'Arranque automático', 'Mantenimiento', 'ok', 'Tarea «IncubApp Servidor» lista',
              'incubapp-arranque.service: active (exited)', 30, None, ['arranque_completo']),
        _comp('version', 'Versión de la app', 'Mantenimiento', 'ok', 'main · 1b5731a · 3 cambios locales',
              'Merge pull request #12 … (hace 2 h)', 2, None, ['actualizar_app']),
    ]
    for c in lista:
        if c['contenedor'] in DETENIDOS:
            c['nivel'] = 'falla' if c['id'] in ('app', 'base', 'auth', 'rest', 'tunel') else 'apagado'
            c['estado'] = 'Detenido (simulado)'
            c['acciones'] = ['encender_contenedor']
    return lista


def estado() -> dict:
    forzado = SIM['nivel']
    comps = componentes(forzado)
    fallas = sum(1 for c in comps if c['nivel'] == 'falla')
    avisos = sum(1 for c in comps if c['nivel'] == 'aviso')
    criticos = {'app', 'api', 'base', 'wsl', 'docker'}
    if any(c['nivel'] == 'falla' and c['id'] in criticos for c in comps):
        nivel, titulo = 'falla', 'IncubApp NO está disponible'
        detalle = 'La app no responde. ' + ', '.join(c['nombre'] for c in comps if c['nivel'] == 'falla') + ' en falla.'
    elif fallas or avisos:
        nivel, titulo = 'aviso', 'IncubApp funciona con avisos'
        detalle = f'Todo lo esencial responde. {avisos} aviso(s): ' + '; '.join(
            f"{c['nombre']}: {c['estado']}" for c in comps if c['nivel'] in ('aviso', 'falla'))
    else:
        nivel, titulo, detalle = 'ok', 'IncubApp funcionando', 'Todo responde.'
    if forzado == 'desconocido':
        nivel, titulo, detalle = 'desconocido', 'Revisando el servidor…', 'Todavía no hay datos del primer ciclo.'
    cpu = _cpu_actual()
    ram_usada = int(6100 + 300 * math.sin(time.time() / 90))
    return {
        'generado': ahora_iso(),
        'ciclo_completo': iso(time.time() - (time.time() % 60)),
        'resumen': {'nivel': nivel, 'titulo': titulo, 'detalle': detalle, 'fallas': fallas, 'avisos': avisos},
        'componentes': comps,
        'contenedores': contenedores(),
        'equipo': {'nombre': 'DESKTOP-ROMOGM3', 'windows': 'Windows 11 Pro', 'ip': '192.168.5.28',
                   'cpu': cpu, 'ram_total_mb': 12207, 'ram_usada_mb': ram_usada,
                   'ram_pct': round(ram_usada / 12207 * 100, 1),
                   'discos': [{'unidad': 'C:', 'total_gb': 451.0, 'libre_gb': 214.0, 'pct': 52.6},
                              {'unidad': 'D:', 'total_gb': 931.5, 'libre_gb': 88.2, 'pct': 90.5}],
                   'encendido_desde': iso(INICIO - 30 * 3600), 'usuario': 'Admin Mantenimiento'},
        'wsl': {'estado': 'Running', 'systemd': True, 'ram_total_mb': 5926, 'ram_usada_mb': 2283,
                'swap_usada_mb': 12, 'disco_total_gb': 1007, 'disco_libre_gb': 923,
                'carga': [0.52, 0.41, 0.33], 'docker': '29.5.3'},
        'base': {'tamano': '252 MB', 'tamano_bytes': 264241152, 'conexiones': 40, 'usuarios': 52,
                 'activos_15min': 3,
                 'tablas_grandes': [{'tabla': 'public.machine_checks', 'tamano': '40 MB'},
                                    {'tabla': 'storage.objects', 'tamano': '31 MB'},
                                    {'tabla': 'public.round_reports', 'tamano': '22 MB'},
                                    {'tabla': 'public.work_orders', 'tamano': '18 MB'},
                                    {'tabla': 'auth.audit_log_entries', 'tamano': '9 MB'}]},
        'tunel': {'listo': True, 'conexiones': 4, 'peticiones': 1590 + int(time.time() - INICIO) // 3, 'errores': 0},
        'respaldo': {'ultimo': iso(time.time() - 8.6 * 3600), 'resultado': 'OK', 'horas': 8.6,
                     'proximo': iso(time.time() + 15.4 * 3600),
                     'destino': '/mnt/c/Users/Admin Mantenimiento/OneDrive - Antioqueña de Incubacion/IncubApp-Respaldos',
                     'registro': ['2026-10-01 02:00:01 Inicia respaldo', '2026-10-01 02:03:44 Base: incubapp-2026-10-01_0200.tar (81 MB)',
                                  '2026-10-01 02:09:12 Fotos: 37 archivos nuevos', '2026-10-01 02:09:13 OK']},
        'vigilante': {'activo': True, 'ultima': iso(time.time() - 40), 'proxima': iso(time.time() + 20),
                      'registro': ['[10:39:01] vigía: app 200, api 401 → todo bien']},
        'git': {'rama': 'main', 'commit': '1b5731a', 'mensaje': 'Merge pull request #12 from HenryStark866/claude/blissful-pasteur-pwx5gl',
                'fecha': iso(time.time() - 7200), 'cambios_locales': 3, 'pendientes_remoto': None},
        'publico': {'url': 'https://incubapp.cdhmaker.com', 'codigo': 502 if forzado == 'falla' else 200,
                    'ms': rnd.randint(300, 520), 'cert_dias': 75, 'error': None},
    }


def metricas(horas: float) -> dict:
    horas = max(0.1, min(168.0, horas))
    fin = int(time.time() // 60 * 60)
    n = int(horas * 60)
    t = [fin - (n - 1 - i) * 60 for i in range(n)]
    r = random.Random(11)
    cpu, ram, wsl, app, mem = [], [], [], [], []
    for i, ts in enumerate(t):
        hora = (ts / 3600) % 24
        dia = 1.0 if 6 <= ((hora - 5) % 24) <= 18 else 0.6
        hueco = (fin - ts) // 60 in range(300, 309)        # 9 minutos sin datos (panel apagado)
        if hueco:
            for s in (cpu, ram, wsl, app, mem):
                s.append(None)
            continue
        cpu.append(round(max(1, (10 + 8 * math.sin(ts / 1700) + r.uniform(-3, 5)) * dia + (35 if i % 360 == 7 else 0)), 1))
        ram.append(round(48 + 4 * math.sin(ts / 5000) + r.uniform(-0.6, 0.6), 1))
        wsl.append(round(38 + 3 * math.sin(ts / 7000) + r.uniform(-0.4, 0.4), 1))
        app.append(int(max(8, 30 + 15 * math.sin(ts / 900) + r.uniform(-8, 25) + (800 if i % 997 == 3 else 0))))
        mem.append(round(1650 + 80 * math.sin(ts / 9000) + r.uniform(-15, 15), 1))
    return {'t': t, 'series': {'cpu': cpu, 'ram_pct': ram, 'wsl_ram_pct': wsl, 'app_ms': app, 'contenedores_mem_mb': mem},
            'disponibilidad': {'app': 99.8, 'api': 99.9, 'publico': 98.1, 'tunel': 97.0, 'base': 100.0,
                               'auth': 100.0, 'wsl': 100.0, 'docker': 100.0, 'asistente': 93.4, 'n8n': 99.2,
                               'respaldo': 100.0, 'vigilante': 99.5}}


NOMBRES = {c['id']: c['nombre'] for c in componentes('auto')}


def _eventos_base() -> list[dict]:
    r = random.Random(5)
    salida = []
    ts = time.time() - 60
    plantillas = [
        ('tunel', 'aviso', 'ok', 'El túnel perdió 2 de sus 4 conexiones con Cloudflare'),
        ('tunel', 'ok', 'aviso', 'El túnel volvió a tener 4 conexiones'),
        ('asistente', 'aviso', 'ok', 'El asistente de voz responde lento (2,1 s)'),
        ('publico', 'falla', 'ok', 'La dirección pública no responde (502)'),
        ('publico', 'ok', 'falla', 'La dirección pública volvió a responder'),
        ('respaldo', 'ok', 'aviso', 'Respaldo diario terminado: OK'),
        ('app', 'falla', 'ok', 'La app no responde (Connection refused)'),
        ('app', 'ok', 'falla', 'La app volvió a responder en 41 ms'),
        ('wsl', 'aviso', 'ok', 'Ubuntu está usando más del 85 % de su memoria'),
        ('wsl', 'ok', 'aviso', 'La memoria de Ubuntu volvió a la normalidad'),
        ('vigilante', 'aviso', 'ok', 'El vigilante no corre hace 4 minutos'),
        ('vigilante', 'ok', 'aviso', 'El vigilante volvió a correr'),
    ]
    for i in range(70):
        ts -= r.uniform(900, 5400)
        comp, nivel, antes, msj = plantillas[i % len(plantillas)]
        salida.append({'t': iso(ts), 'componente': comp, 'nombre': NOMBRES.get(comp, comp),
                       'nivel': nivel, 'antes': antes, 'mensaje': msj})
    salida.append({'t': iso(INICIO), 'componente': 'panel', 'nombre': 'Panel', 'nivel': 'ok', 'antes': None,
                   'mensaje': 'El panel arrancó'})
    salida.sort(key=lambda e: e['t'], reverse=True)
    return salida


EVENTOS = _eventos_base()


def eventos(limite: int) -> list[dict]:
    with CANDADO:
        return EVENTOS[:limite]


def evento(comp: str, nivel: str, antes: str | None, mensaje: str) -> None:
    with CANDADO:
        EVENTOS.insert(0, {'t': ahora_iso(), 'componente': comp, 'nombre': NOMBRES.get(comp, comp),
                           'nivel': nivel, 'antes': antes, 'mensaje': mensaje})


# ═══════════════════════════ ACCIONES ═══════════════════════════
P_CONT = {'nombre': 'contenedor', 'etiqueta': 'Servicio', 'tipo': 'contenedor', 'opciones': [], 'requerido': True}
ACCIONES = [
    {'id': 'revisar_todo', 'titulo': 'Revisar y reparar', 'grupo': 'Servidor', 'peligro': 'bajo', 'admin': False,
     'descripcion': 'Corre la misma revisión del vigilante: comprueba la app y la API y levanta lo que falte.',
     'confirmar': None, 'parametros': []},
    {'id': 'arranque_completo', 'titulo': 'Arranque completo', 'grupo': 'Servidor', 'peligro': 'medio', 'admin': False,
     'descripcion': 'Repite el arranque de encendido: Docker, Supabase (sin los que sobran), la app y el túnel.',
     'confirmar': 'Los servicios que estén caídos se van a recrear. Los usuarios pueden notar cortes de unos segundos.', 'parametros': []},
    {'id': 'arrancar_servidor', 'titulo': 'Arrancar el servidor', 'grupo': 'Servidor', 'peligro': 'bajo', 'admin': False,
     'descripcion': 'Lanza la tarea «IncubApp Servidor» de Windows y espera a que Ubuntu responda. Sirve si Ubuntu está detenido.',
     'confirmar': None, 'parametros': []},
    {'id': 'reiniciar_wsl', 'titulo': 'Reiniciar Ubuntu (WSL)', 'grupo': 'Servidor', 'peligro': 'alto', 'admin': False,
     'descripcion': 'Apaga Ubuntu por completo (wsl --shutdown) y lo vuelve a arrancar con la tarea de Windows.',
     'confirmar': 'La app, la base de datos y el túnel se van a caer entre 2 y 5 minutos. Nadie en la planta podrá usar IncubApp mientras tanto.',
     'parametros': []},
    {'id': 'reiniciar_contenedor', 'titulo': 'Reiniciar un servicio', 'grupo': 'Servicios', 'peligro': 'medio', 'admin': False,
     'descripcion': 'Reinicia un contenedor de Docker (docker restart).',
     'confirmar': 'El servicio se va a reiniciar. Tarda unos segundos.', 'parametros': [P_CONT]},
    {'id': 'detener_contenedor', 'titulo': 'Detener un servicio', 'grupo': 'Servicios', 'peligro': 'alto', 'admin': False,
     'descripcion': 'Detiene un contenedor. El vigilante puede volver a encenderlo si es esencial.',
     'confirmar': 'El servicio va a quedar apagado. Si la app lo necesita, dejará de funcionar.', 'parametros': [P_CONT]},
    {'id': 'encender_contenedor', 'titulo': 'Encender un servicio', 'grupo': 'Servicios', 'peligro': 'bajo', 'admin': False,
     'descripcion': 'Enciende un contenedor detenido (docker start).', 'confirmar': None, 'parametros': [P_CONT]},
    {'id': 'reiniciar_app', 'titulo': 'Reiniciar la app', 'grupo': 'Servicios', 'peligro': 'medio', 'admin': False,
     'descripcion': 'Reinicia el contenedor de la app (nginx). Los usuarios pueden ver un error unos segundos.',
     'confirmar': 'La app va a dejar de responder unos 5 segundos.', 'parametros': []},
    {'id': 'reiniciar_supabase', 'titulo': 'Reiniciar Supabase', 'grupo': 'Servicios', 'peligro': 'alto', 'admin': False,
     'descripcion': 'Reinicia todos los servicios de Supabase (menos los que sobran en producción).',
     'confirmar': 'La app no podrá iniciar sesión ni guardar datos durante 1 a 2 minutos.', 'parametros': []},
    {'id': 'recrear_tunel', 'titulo': 'Recrear el túnel', 'grupo': 'Servicios', 'peligro': 'medio', 'admin': False,
     'descripcion': 'Vuelve a crear el contenedor de Cloudflare Tunnel con su configuración.',
     'confirmar': 'Desde internet no se podrá entrar a la app durante unos 30 segundos.', 'parametros': []},
    {'id': 'studio_encender', 'titulo': 'Encender Studio', 'grupo': 'Servicios', 'peligro': 'bajo', 'admin': False,
     'descripcion': 'Enciende Supabase Studio para administrar la base. Recuerde apagarlo al terminar.', 'confirmar': None, 'parametros': []},
    {'id': 'studio_apagar', 'titulo': 'Apagar Studio', 'grupo': 'Servicios', 'peligro': 'bajo', 'admin': False,
     'descripcion': 'Apaga Supabase Studio (en producción va apagado).', 'confirmar': None, 'parametros': []},
    {'id': 'respaldo_ahora', 'titulo': 'Respaldar ahora', 'grupo': 'Mantenimiento', 'peligro': 'bajo', 'admin': False,
     'descripcion': 'Corre el respaldo de la base y de las fotos a OneDrive, igual que el de las 2:00 a. m.',
     'confirmar': 'El respaldo tarda entre 3 y 10 minutos y usa bastante disco.', 'parametros': []},
    {'id': 'actualizar_app', 'titulo': 'Actualizar la app', 'grupo': 'Mantenimiento', 'peligro': 'medio', 'admin': False,
     'descripcion': 'Trae la última versión de GitHub, aplica migraciones y reconstruye la app (7-ACTUALIZAR-APP).',
     'confirmar': 'La app se va a reconstruir. Tarda de 5 a 15 minutos y al final se reinicia.', 'parametros': []},
    {'id': 'limpiar_docker', 'titulo': 'Liberar espacio de Docker', 'grupo': 'Mantenimiento', 'peligro': 'medio', 'admin': False,
     'descripcion': 'Borra imágenes sin uso y la caché de compilación de más de 7 días. Muestra el espacio antes y después.',
     'confirmar': 'Se borran imágenes que no usa ningún contenedor. La próxima actualización puede tardar un poco más.', 'parametros': []},
    {'id': 'probar_correo', 'titulo': 'Probar el correo', 'grupo': 'Diagnóstico', 'peligro': 'bajo', 'admin': False,
     'descripcion': 'Manda un correo real de «recuperar contraseña» a una cuenta existente y muestra la respuesta.',
     'confirmar': None, 'parametros': [{'nombre': 'correo', 'etiqueta': 'Correo de la cuenta', 'tipo': 'correo', 'opciones': [], 'requerido': True}]},
    {'id': 'diagnostico_red_wsl', 'titulo': 'Diagnóstico de red de Ubuntu', 'grupo': 'Diagnóstico', 'peligro': 'bajo', 'admin': False,
     'descripcion': 'Revisa DNS, rutas y salida a internet desde Ubuntu (diag-red.sh).', 'confirmar': None, 'parametros': []},
    {'id': 'estado_docker', 'titulo': 'Estado de Docker', 'grupo': 'Diagnóstico', 'peligro': 'bajo', 'admin': False,
     'descripcion': 'Muestra el espacio que usa Docker y un resumen de docker info.', 'confirmar': None, 'parametros': []},
    {'id': 'reporte_soporte', 'titulo': 'Reporte de soporte', 'grupo': 'Diagnóstico', 'peligro': 'bajo', 'admin': False,
     'descripcion': 'Arma un ZIP con el estado, los eventos, la auditoría y los registros recientes (sin contraseñas) para enviar a soporte.',
     'confirmar': None, 'parametros': []},
    {'id': 'abrir', 'titulo': 'Abrir', 'grupo': 'Abrir', 'peligro': 'bajo', 'admin': False,
     'descripcion': 'Abre una página o carpeta del servidor.', 'confirmar': None,
     'parametros': [{'nombre': 'destino', 'etiqueta': 'Qué abrir', 'tipo': 'opcion', 'requerido': True,
                     'opciones': ['app_local', 'publico', 'studio', 'n8n', 'carpeta_registros', 'carpeta_respaldos', 'carpeta_reportes']}]},
]


def acciones() -> list[dict]:
    nombres = [c['nombre'] for c in contenedores()]
    salida = []
    for a in ACCIONES:
        a = json.loads(json.dumps(a))
        for p in a['parametros']:
            if p['tipo'] == 'contenedor':
                p['opciones'] = nombres
        salida.append(a)
    return salida


# ═══════════════════════════ TRABAJOS ═══════════════════════════
class TrabajoSim:
    def __init__(self, tipo, titulo, exclusivo=None):
        self.id = uuid.uuid4().hex[:12]
        self.tipo, self.titulo, self.exclusivo = tipo, titulo, exclusivo
        self.estado = 'corriendo'
        self.inicio = time.time()
        self.fin = None
        self.codigo = None
        self.error = None
        self.progreso = None
        self.resultado = None
        self.lineas: list[str] = []
        self.cancelar_ev = threading.Event()

    def linea(self, texto):
        for parte in str(texto).split('\n'):
            self.lineas.append(parte[:2000])

    def como_dict(self, desde=0, con_lineas=True):
        total = len(self.lineas)
        return {'id': self.id, 'tipo': self.tipo, 'titulo': self.titulo, 'estado': self.estado,
                'inicio': iso(self.inicio), 'fin': iso(self.fin),
                'segundos': round((self.fin or time.time()) - self.inicio, 1),
                'codigo': self.codigo, 'error': self.error, 'progreso': self.progreso,
                'resultado': self.resultado if self.estado != 'corriendo' else None,
                'desde': desde, 'lineas': self.lineas[desde:] if con_lineas else [], 'total_lineas': total}


TRABAJOS: dict[str, TrabajoSim] = {}
ORDEN: list[str] = []


def lanzar(tipo, titulo, guion, resultado=None, exclusivo=None, falla=None, velocidad=1.0):
    """guion: lista de (segundos, línea, progreso|None). resultado: función → dict.
    falla: mensaje de error para terminar en 'error'."""
    if exclusivo:
        for t in TRABAJOS.values():
            if t.exclusivo == exclusivo and t.estado == 'corriendo':
                return t
    t = TrabajoSim(tipo, titulo, exclusivo)
    with CANDADO:
        TRABAJOS[t.id] = t
        ORDEN.append(t.id)

    def correr():
        try:
            for (seg, texto, prog) in guion:
                if t.cancelar_ev.wait(seg * velocidad):
                    t.linea('— Cancelado —')
                    t.estado = 'cancelado'
                    t.fin = time.time()
                    return
                if texto is not None:
                    t.linea(texto)
                if prog is not None:
                    t.progreso = prog
            if falla:
                t.linea(f'ERROR: {falla}')
                t.estado, t.codigo, t.error = 'error', 1, falla
            else:
                t.resultado = resultado() if callable(resultado) else resultado
                t.estado, t.codigo = 'ok', 0
                t.progreso = 1.0
        except Exception as e:  # noqa: BLE001
            t.linea(f'ERROR: {e}')
            t.estado, t.codigo, t.error = 'error', 1, str(e)
        t.fin = time.time()
    threading.Thread(target=correr, daemon=True).start()
    return t


def guion_simple(lineas, paso=0.45, progreso=False):
    n = len(lineas)
    return [(paso, l, ((i + 1) / n) if progreso else None) for i, l in enumerate(lineas)]


def lanzar_accion(id_, parametros):
    cat = {a['id']: a for a in acciones()}
    if id_ not in cat:
        raise KeyError(f'No existe la acción «{id_}».')
    a = cat[id_]
    for p in a['parametros']:
        v = (parametros or {}).get(p['nombre'])
        if p.get('requerido') and not v:
            raise ValueError(f'Falta «{p["etiqueta"]}».')
        if p['tipo'] == 'contenedor' and v not in p['opciones']:
            raise ValueError(f'«{v}» no es un servicio de este servidor.')
        if p['tipo'] == 'correo' and not re.fullmatch(r'[^@\s]+@[^@\s]+\.[A-Za-z]{2,}', v or ''):
            raise ValueError('Escriba un correo válido, por ejemplo nombre@incubant.co.')
        if p['tipo'] == 'opcion' and v not in p['opciones']:
            raise ValueError(f'«{v}» no es una opción válida.')
    c = (parametros or {}).get('contenedor')
    if id_ == 'abrir':
        t = lanzar('abrir', f'Abrir {parametros["destino"]}', [], resultado={'ok': True, 'destino': parametros['destino']})
        time.sleep(0.05)
        return t
    if id_ == 'reiniciar_contenedor':
        return lanzar(id_, f'Reiniciar {c}', guion_simple([
            f'$ docker restart {c}', c, f'Esperando a que {c} quede sano…', 'Estado: starting', 'Estado: healthy',
            f'Listo: {c} está encendido y sano.']), {'ok': True, 'contenedor': c})
    if id_ == 'detener_contenedor':
        def fin():
            DETENIDOS.add(c)
            evento('docker', 'aviso', 'ok', f'Se detuvo {c} desde el panel')
            return {'ok': True}
        return lanzar(id_, f'Detener {c}', guion_simple([f'$ docker stop {c}', c, f'{c} quedó detenido.']), fin)
    if id_ == 'encender_contenedor':
        def fin():
            DETENIDOS.discard(c)
            return {'ok': True}
        return lanzar(id_, f'Encender {c}', guion_simple([f'$ docker start {c}', c, 'Encendido.']), fin)
    if id_ == 'respaldo_ahora':
        return lanzar(id_, 'Respaldo ahora', guion_simple([
            '== Respaldo IncubApp 2026-10-01 10:47 ==', 'Base de datos: pg_dump -Fc …', '  roles…', '  esquema public…',
            '  datos (252 MB)…', '  comprimido: incubapp-2026-10-01_1047.tar (81 MB)', 'Fotos: rsync incremental…',
            '  15.197 archivos revisados, 37 nuevos (12,4 MB)', 'Limpieza: se borraron 1 respaldo(s) de más de 14 días',
            'Resultado: OK'], 0.7, True), {'archivo': 'base-de-datos/incubapp-2026-10-01_1047.tar', 'resultado': 'OK'},
            exclusivo='respaldo')
    if id_ == 'reporte_soporte':
        return lanzar(id_, 'Reporte de soporte', guion_simple([
            'Reuniendo el estado actual…', 'Eventos de los últimos 7 días (412)…', 'Última auditoría de seguridad…',
            'Registros de los contenedores (últimas 500 líneas, sin contraseñas)…', 'Registro del vigilante…',
            'Registro del respaldo…', 'Comprimiendo…', 'Listo.'], 0.5, True),
            {'archivo': 'C:\\IncubApp\\servidor-local\\logs\\panel\\reportes\\soporte-2026-10-01_1047.zip', 'tamano': '1,8 MB'})
    if id_ == 'probar_correo':
        falla = 'El servidor de correo rechazó la conexión (535 Authentication failed)' if 'falla' in parametros['correo'] else None
        return lanzar(id_, f'Probar correo a {parametros["correo"]}', guion_simple([
            f'Pidiendo a Supabase un correo de recuperación para {parametros["correo"]}…',
            'POST /auth/v1/recover → 200', 'Revisando el registro de auth…',
            'mail.smtp2go.com:2525 respondió 250 OK' if not falla else 'mail.smtp2go.com:2525 respondió 535']),
            {'ok': True, 'mensaje': 'El correo salió. Revise la bandeja de entrada (y el spam).'}, falla=falla)
    if id_ == 'estado_docker':
        return lanzar(id_, 'Estado de Docker', guion_simple([
            '$ docker system df', 'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE',
            'Images          21        16        9.214GB   1.902GB (20%)', 'Containers      18        15        212.4MB   0B (0%)',
            'Local Volumes   6         5         1.31GB    0B (0%)', 'Build Cache     74        0         2.877GB   2.877GB', '',
            '$ docker info (resumen)', 'Server Version: 29.5.3', 'Storage Driver: overlayfs', 'Cgroup Driver: systemd',
            'Kernel Version: 6.6.87.2-microsoft-standard-WSL2', 'Total Memory: 5.787GiB', 'CPUs: 4'], 0.25),
            {'imagenes': 21, 'contenedores': 18, 'recuperable': '4,8 GB'})
    if id_ == 'reiniciar_wsl':
        return lanzar(id_, 'Reiniciar Ubuntu', guion_simple(['wsl --shutdown', 'Esperando 8 s…', 'Lanzando la tarea «IncubApp Servidor»…',
                                                             'Ubuntu responde.', 'Docker responde.', 'La app responde (200).'], 1.0, True), {'ok': True})
    if id_ == 'actualizar_app':
        return lanzar(id_, 'Actualizar la app', guion_simple([
            '$ git pull', 'Already up to date.', 'Migraciones: 0 pendientes', '$ docker compose build incubapp',
            '#1 [internal] load build definition from Dockerfile', '#5 [build 3/6] RUN npm ci', '#8 [build 6/6] RUN npm run build',
            'vite v5.4.2 building for production...', '✓ 1834 modules transformed.', '#12 exporting to image', '$ docker compose up -d incubapp',
            'Container incubapp-incubapp-1  Recreated', 'La app responde (200).'], 0.6, True), {'ok': True})
    # genérico
    titulo = cat[id_]['titulo']
    return lanzar(id_, titulo, guion_simple([f'== {titulo} ==', 'Revisando…', 'docker ps: 15 encendidos', 'app: 200 en 31 ms',
                                             'api: 401 en 44 ms', 'Todo responde. Nada que reparar.']), {'ok': True})


# ═══════════════════════════ REGISTROS ═══════════════════════════
def fuentes_registro():
    f = [{'id': f'contenedor:{c["nombre"]}', 'nombre': c['nombre'], 'grupo': 'Contenedores'} for c in contenedores()]
    f += [{'id': 'vigilante', 'nombre': 'Vigilante (arranque.sh)', 'grupo': 'Servidor'},
          {'id': 'respaldo', 'nombre': 'Respaldo', 'grupo': 'Servidor'},
          {'id': 'arranque_windows', 'nombre': 'Arranque de Windows', 'grupo': 'Servidor'},
          {'id': 'actualizar', 'nombre': 'Actualizar app', 'grupo': 'Mantenimiento'},
          {'id': 'correo', 'nombre': 'Configurar correo', 'grupo': 'Mantenimiento'},
          {'id': 'panel', 'nombre': 'Este panel', 'grupo': 'Panel'}]
    return f


def leer_registro(fuente, lineas, filtro):
    r = random.Random(hash(fuente) & 0xffff)
    base = time.time() - 3600
    salida = []
    total = 400 + int(time.time() - INICIO) // 4         # crece con el tiempo (para «seguir el final»)
    niveles = ['info'] * 12 + ['warn'] * 2 + ['error']
    for i in range(total):
        ts = _dt.datetime.fromtimestamp(base + i * 9, ZONA).strftime('%Y-%m-%dT%H:%M:%S')
        n = niveles[r.randrange(len(niveles))]
        if fuente.startswith('contenedor:supabase-auth'):
            msj = {'info': '{"component":"api","level":"info","method":"GET","path":"/health","status":200}',
                   'warn': '{"level":"warning","msg":"Request rate limited","remote_addr":"190.85.12.4"}',
                   'error': '{"level":"error","msg":"Invalid login credentials","grant_type":"password"}'}[n]
        elif fuente.startswith('contenedor:'):
            msj = {'info': f'GET /rest/v1/machine_checks?select=* 200 {r.randint(3, 80)}ms',
                   'warn': 'WARN: slow query took 1532ms', 'error': 'ERROR: connection reset by peer'}[n]
        else:
            msj = {'info': 'vigía: app 200, api 401 → todo bien', 'warn': 'AVISO: el túnel tiene 2 conexiones',
                   'error': 'ERROR: la app no respondió; levantando incubapp…'}[n]
        salida.append(f'{ts} {n.upper():5} {msj}')
    salida.append('2026-10-01T10:44:12 INFO  SMTP_PASS=«oculto» (ejemplo de línea tachada)')
    salida.append('<script>alert("esto debe verse como texto")</script> <b>no es negrita</b>')
    if filtro:
        salida = [l for l in salida if filtro.lower() in l.lower()]
    nombre = next((x['nombre'] for x in fuentes_registro() if x['id'] == fuente), fuente)
    return {'fuente': fuente, 'nombre': nombre, 'generado': ahora_iso(), 'lineas': salida[-lineas:]}


# ═══════════════════════════ SEGURIDAD ═══════════════════════════
def H(id_, cat, nivel, titulo, detalle, recomendacion, arreglo=None, evidencia=None):
    return {'id': id_, 'categoria': cat, 'titulo': titulo, 'nivel': nivel, 'detalle': detalle,
            'recomendacion': recomendacion, 'arreglo': arreglo, 'evidencia': evidencia}


ARREGLADOS: set[str] = set()


def auditoria_dict():
    hs = [
        H('ngrok_4040', 'red', 'alto', 'El inspector de ngrok (puerto 4040) está abierto a toda la red',
          'Cualquier equipo de la red puede ver en http://192.168.5.28:4040 las peticiones que pasan por ngrok, con sus claves y sesiones.',
          'ngrok ya no hace falta (la app entra por Cloudflare). Deténgalo y quítele el reinicio automático.', 'ngrok_solo_local',
          '0.0.0.0:4040 → incubapp-ngrok-1'),
        H('puerto_8000', 'windows', 'medio', 'El puerto 8000 (API de Supabase) está abierto en el firewall',
          'La app entra por el puerto 80; el 8000 abierto a la red deja hablar directo con la API.',
          'Quite el 8000 de la regla «IncubApp servidor local».', 'cerrar_puerto_8000', 'Regla: TCP 80,443,8000 (Privado, Dominio)'),
        H('defender_tiempo_real', 'windows', 'ok', 'La protección en tiempo real de Windows Defender está encendida',
          'Defender vigila los archivos en tiempo real.', 'Nada que hacer.', None, 'RealTimeProtectionEnabled = True'),
        H('defender_firmas', 'windows', 'bajo', 'Las firmas de Defender tienen 4 días',
          'Las definiciones de virus se actualizan solas con Windows Update; 4 días es aceptable pero conviene que sean de hoy.',
          'Actualice las firmas.', 'actualizar_firmas_defender', 'AntivirusSignatureAge = 4'),
        H('defender_analisis', 'windows', 'info', 'Último análisis rápido: hace 6 días', 'Defender analiza el equipo cuando está inactivo.',
          'Puede lanzar un análisis rápido ahora.', 'analisis_rapido_defender', 'QuickScanAge = 6'),
        H('firewall_perfiles', 'windows', 'ok', 'El firewall está encendido en los tres perfiles', '', 'Nada que hacer.', None, 'Dominio: on · Privado: on · Público: on'),
        H('rdp', 'windows', 'info', 'Escritorio remoto está apagado', '', 'Nada que hacer.', None, None),
        H('smb1', 'windows', 'alto', 'SMBv1 está activado',
          'SMBv1 es el protocolo que usó WannaCry. Ningún equipo moderno lo necesita.', 'Desactívelo (pide permiso de administrador y luego reiniciar).',
          'desactivar_smb1', 'SMB1Protocol = Enabled'),
        H('invitado', 'windows', 'ok', 'La cuenta Invitado está desactivada', '', 'Nada que hacer.', None, None),
        H('uac', 'windows', 'ok', 'El control de cuentas (UAC) está activo', '', 'Nada que hacer.', None, None),
        H('compartidos', 'windows', 'medio', 'Hay una carpeta compartida en la red: «Planos»',
          'C:\\Planos se comparte con «Todos» con permiso de lectura.', 'Si no hace falta, deje de compartirla o limite el permiso a usuarios concretos.',
          None, 'Planos → C:\\Planos (Everyone: Read)'),
        H('actualizaciones', 'windows', 'aviso' if False else 'bajo', 'La última actualización de Windows fue hace 23 días',
          'Las actualizaciones de seguridad salen el segundo martes de cada mes.', 'Busque actualizaciones en Configuración → Windows Update (fuera del horario de la planta).', None,
          'KB5065426 · 2026-09-08'),
        H('docker_privilegiados', 'docker', 'ok', 'Ningún contenedor corre en modo privilegiado', '', 'Nada que hacer.', None, None),
        H('docker_reinicios', 'docker', 'medio', 'incubapp-asistente se reinició 3 veces en 2 horas',
          'Un contenedor que se reinicia en bucle suele tener un error de configuración o se queda sin memoria.',
          'Revise sus registros en la sección Registros.', None, 'RestartCount = 3'),
        H('env_secretos_ejemplo', 'supabase', 'ok', 'Las claves de Supabase no son las de ejemplo', '', 'Nada que hacer.', None, None),
        H('env_permisos', 'supabase', 'medio', 'El archivo .env de Supabase lo puede leer cualquier usuario de Ubuntu',
          'Tiene la contraseña de la base y la clave de servicio.', 'Deje los permisos en 600 (solo root).', 'permisos_env', '-rw-r--r-- /opt/incubapp/server/.env'),
        H('rls', 'supabase', 'alto', '2 tablas de public no tienen seguridad por filas (RLS)',
          'Con la clave anon, que viaja en la app y es pública, cualquiera puede leer esas tablas.',
          'Active RLS y cree políticas en: public.tmp_import, public.mantum_cache.', None, 'public.tmp_import, public.mantum_cache'),
        H('service_role_web', 'app', 'ok', 'La clave de servicio no aparece en los archivos de la app', '', 'Nada que hacer.', None, None),
        H('env_git', 'app', 'ok', 'Ningún .env con secretos está en git', '', 'Nada que hacer.', None, None),
        H('signup', 'supabase', 'info', 'El registro de cuentas nuevas está abierto (DISABLE_SIGNUP=false)',
          'Cualquiera con la dirección puede crear una cuenta (queda sin empresa hasta que la asignen).', 'Si no se usa, ciérrelo.', None, None),
        H('cert', 'web', 'ok', 'El certificado de https://incubapp.cdhmaker.com vence en 75 días', '', 'Cloudflare lo renueva solo.', None, 'Vence: 2026-12-15'),
        H('cabeceras', 'web', 'bajo', 'Falta la cabecera Strict-Transport-Security (HSTS)', 'Sin HSTS un navegador podría entrar por http la primera vez.',
          'Actívela en Cloudflare → SSL/TLS → Edge Certificates.', None, 'X-Content-Type-Options: nosniff · X-Frame-Options: SAMEORIGIN · Referrer-Policy: strict-origin'),
        H('env_web', 'web', 'ok', '/.env y /.git/config no se sirven', '', 'Nada que hacer.', None, '404 · 404'),
        H('respaldo_reciente', 'respaldo', 'ok', 'El último respaldo es de hace 8 h y terminó bien', '', 'Nada que hacer.', None, None),
        H('disco', 'windows', 'ok', 'El disco C: tiene 214 GB libres (47 %)', '', 'Nada que hacer.', None, None),
        H('hora', 'windows', 'ok', 'La hora del equipo está sincronizada (diferencia 0,2 s)', '', 'Nada que hacer.', None, None),
        H('wifi_compartido', 'red', 'info', 'No hay zona Wi-Fi ni conexión compartida activa', '', 'Nada que hacer.', None, None),
        H('revision_fallida', 'windows', 'info', 'No se pudo revisar el inicio de sesión automático',
          'La consulta al registro tardó más de 10 s.', 'Vuelva a auditar más tarde.', None, 'Tiempo agotado'),
    ]
    for h in hs:
        if h['arreglo'] in ARREGLADOS:
            h['nivel'] = 'ok'
            h['titulo'] += ' (arreglado)'
            h['arreglo'] = None
    resumen = {k: 0 for k in ('critico', 'alto', 'medio', 'bajo', 'info', 'ok')}
    for h in hs:
        resumen[h['nivel']] = resumen.get(h['nivel'], 0) + 1
    puntaje = max(0, 100 - resumen['critico'] * 25 - resumen['alto'] * 10 - resumen['medio'] * 5 - resumen['bajo'] * 2)
    return {'generado': ahora_iso(), 'segundos': 12.3, 'puntaje': puntaje, 'resumen': resumen, 'hallazgos': hs}


ULTIMA_AUDITORIA = {'dato': None}
ULTIMA_AUDITORIA['dato'] = auditoria_dict()
ULTIMA_AUDITORIA['dato']['generado'] = iso(time.time() - 3 * 3600)

ARREGLOS = [
    {'id': 'activar_defender', 'titulo': 'Encender la protección en tiempo real', 'descripcion': 'Activa la protección en tiempo real de Windows Defender.', 'admin': True, 'peligro': 'bajo'},
    {'id': 'analisis_rapido_defender', 'titulo': 'Análisis rápido de Defender', 'descripcion': 'Lanza un análisis rápido (5 a 15 minutos; el equipo puede ir más lento).', 'admin': True, 'peligro': 'bajo'},
    {'id': 'actualizar_firmas_defender', 'titulo': 'Actualizar firmas de Defender', 'descripcion': 'Descarga las definiciones de virus más recientes.', 'admin': True, 'peligro': 'bajo'},
    {'id': 'cerrar_puerto_8000', 'titulo': 'Cerrar el puerto 8000', 'descripcion': 'Quita el 8000 de la regla de firewall «IncubApp servidor local». La app sigue entrando por el 80.', 'admin': True, 'peligro': 'medio'},
    {'id': 'ngrok_solo_local', 'titulo': 'Detener ngrok', 'descripcion': 'Detiene el contenedor de ngrok y le quita el reinicio automático. La app sigue publicada por Cloudflare.', 'admin': False, 'peligro': 'medio'},
    {'id': 'activar_firewall', 'titulo': 'Encender el firewall', 'descripcion': 'Enciende el firewall de Windows en los tres perfiles.', 'admin': True, 'peligro': 'bajo'},
    {'id': 'desactivar_smb1', 'titulo': 'Desactivar SMBv1', 'descripcion': 'Quita el protocolo SMBv1. Hay que reiniciar Windows para que termine de aplicarse.', 'admin': True, 'peligro': 'medio'},
    {'id': 'desactivar_invitado', 'titulo': 'Desactivar la cuenta Invitado', 'descripcion': 'Desactiva la cuenta Invitado de Windows.', 'admin': True, 'peligro': 'bajo'},
    {'id': 'permisos_env', 'titulo': 'Proteger el .env', 'descripcion': 'Deja los archivos .env y tunel.env con permisos 600 (solo root).', 'admin': False, 'peligro': 'bajo'},
]


def lanzar_auditoria():
    pasos = ['Windows Defender…', 'Firewall…', 'Puertos escuchando…', 'Zona Wi-Fi / conexión compartida…', 'Escritorio remoto…',
             'SMBv1…', 'Cuenta Invitado…', 'UAC…', 'Inicio de sesión automático… (tiempo agotado)', 'Carpetas compartidas…',
             'Windows Update…', 'Docker: puertos publicados…', 'Docker: privilegiados y reinicios…', 'Supabase: .env…',
             'Supabase: tablas sin RLS…', 'App: clave de servicio en los archivos…', 'Git: .env versionado…',
             'Web pública: certificado y cabeceras…', 'Web pública: /.env y /.git…', 'Respaldo…', 'Disco…', 'Hora…']
    guion = [(0.35, f'[{i + 1}/{len(pasos)}] {p}', (i + 1) / len(pasos)) for i, p in enumerate(pasos)]
    guion.append((0.3, 'Puntaje: calculando…', None))

    def fin():
        d = auditoria_dict()
        ULTIMA_AUDITORIA['dato'] = d
        return d
    return lanzar('auditoria', 'Auditoría de seguridad', guion, fin, exclusivo='auditoria')


def puertos():
    return [
        {'puerto': 80, 'direccion': '0.0.0.0', 'proceso': 'docker-proxy', 'contenedor': 'incubapp-incubapp-1', 'lado': 'ubuntu', 'expuesto': True, 'riesgo': 'bajo', 'nota': 'La app (nginx). Es el que debe estar abierto.'},
        {'puerto': 8000, 'direccion': '0.0.0.0', 'proceso': 'docker-proxy', 'contenedor': 'supabase-envoy', 'lado': 'ubuntu', 'expuesto': True, 'riesgo': 'medio', 'nota': 'API de Supabase. No hace falta abierta a la red.'},
        {'puerto': 8443, 'direccion': '0.0.0.0', 'proceso': 'docker-proxy', 'contenedor': 'supabase-envoy', 'lado': 'ubuntu', 'expuesto': True, 'riesgo': 'medio', 'nota': None},
        {'puerto': 4040, 'direccion': '0.0.0.0', 'proceso': 'docker-proxy', 'contenedor': 'incubapp-ngrok-1', 'lado': 'ubuntu', 'expuesto': True, 'riesgo': 'alto', 'nota': 'Inspector de ngrok: muestra el tráfico con sus claves a cualquiera de la red.'},
        {'puerto': 5678, 'direccion': '127.0.0.1', 'proceso': 'docker-proxy', 'contenedor': 'incubapp-n8n', 'lado': 'ubuntu', 'expuesto': False, 'riesgo': 'bajo', 'nota': 'n8n solo desde este equipo.'},
        {'puerto': 135, 'direccion': '0.0.0.0', 'proceso': 'svchost', 'contenedor': None, 'lado': 'windows', 'expuesto': True, 'riesgo': 'bajo', 'nota': 'RPC de Windows (normal).'},
        {'puerto': 445, 'direccion': '0.0.0.0', 'proceso': 'System', 'contenedor': None, 'lado': 'windows', 'expuesto': True, 'riesgo': 'medio', 'nota': 'Carpetas compartidas (SMB).'},
        {'puerto': 5040, 'direccion': '0.0.0.0', 'proceso': 'svchost', 'contenedor': None, 'lado': 'windows', 'expuesto': False, 'riesgo': 'bajo', 'nota': None},
        {'puerto': 8770, 'direccion': '127.0.0.1', 'proceso': 'pythonw', 'contenedor': None, 'lado': 'windows', 'expuesto': False, 'riesgo': 'bajo', 'nota': 'Este panel.'},
        {'puerto': 22, 'direccion': '0.0.0.0', 'proceso': 'sshd', 'contenedor': None, 'lado': 'ubuntu', 'expuesto': True, 'riesgo': 'medio', 'nota': 'SSH de Ubuntu abierto a la red.'},
    ]


def conexiones():
    return [
        {'local': '192.168.5.28:51234', 'remoto': '104.16.1.1:443', 'proceso': 'cloudflared', 'pid': 2211, 'estado': 'Established', 'nota': None},
        {'local': '192.168.5.28:51240', 'remoto': '198.41.200.13:7844', 'proceso': 'cloudflared', 'pid': 2211, 'estado': 'Established', 'nota': None},
        {'local': '192.168.5.28:80', 'remoto': '192.168.5.41:50122', 'proceso': 'docker-proxy', 'pid': 1180, 'estado': 'Established', 'nota': None},
        {'local': '192.168.5.28:4040', 'remoto': '192.168.5.77:61002', 'proceso': 'docker-proxy', 'pid': 1203, 'estado': 'Established', 'nota': 'Alguien de la red está mirando el inspector de ngrok'},
        {'local': '192.168.5.28:52011', 'remoto': '20.42.65.92:443', 'proceso': 'MsMpEng', 'pid': 4120, 'estado': 'Established', 'nota': None},
        {'local': '192.168.5.28:52100', 'remoto': '45.155.205.233:6667', 'proceso': 'desconocido', 'pid': 9932, 'estado': 'SynSent', 'nota': 'Puerto inusual (IRC): revisar qué programa es'},
        {'local': '127.0.0.1:8770', 'remoto': '127.0.0.1:52200', 'proceso': 'pythonw', 'pid': 7788, 'estado': 'Established', 'nota': None},
    ]


def accesos(horas):
    return {'generado': ahora_iso(), 'horas': horas, 'ingresos_ok': 47 if horas <= 24 else 312, 'fallidos': 9 if horas <= 24 else 41,
            'por_usuario': [
                {'correo': 'supervisor.turno@incubant.co', 'ok': 12, 'fallidos': 0, 'ultimo': iso(time.time() - 900)},
                {'correo': 'auxiliar.mantenimiento@incubant.co', 'ok': 9, 'fallidos': 1, 'ultimo': iso(time.time() - 3000)},
                {'correo': 'operario3@incubant.co', 'ok': 8, 'fallidos': 6, 'ultimo': iso(time.time() - 5000)},
                {'correo': 'lider.planta@incubant.co', 'ok': 6, 'fallidos': 0, 'ultimo': iso(time.time() - 8000)},
                {'correo': '<img src=x onerror=alert(1)>@x.co', 'ok': 0, 'fallidos': 2, 'ultimo': iso(time.time() - 9000)},
            ],
            'por_ip': [{'ip': '190.85.12.4', 'fallidos': 6}, {'ip': '192.168.5.41', 'fallidos': 1}, {'ip': '45.155.205.233', 'fallidos': 2}],
            'usuarios_nuevos': [{'correo': 'nuevo.operario@incubant.co', 'creado': iso(time.time() - 20000)}],
            'alertas': [H('fallidos_ip', 'app', 'medio', '6 ingresos fallidos desde 190.85.12.4 en 1 hora',
                          'Puede ser alguien que olvidó su contraseña o un intento de adivinarla.',
                          'Si no reconoce la IP, cambie la contraseña de la cuenta afectada (operario3@incubant.co).', None, '190.85.12.4 → operario3@incubant.co')]}


# ═══════════════════════════ RED ═══════════════════════════
DISPOSITIVOS = [
    {'ip': '192.168.5.1', 'mac': 'B0:4E:26:11:22:33', 'fabricante': 'TP-Link', 'nombre_red': 'router.local', 'nombre': 'Router principal', 'notas': 'Rack de oficina', 'conocido': True, 'tipo': 'router', 'puertos': [53, 80, 443]},
    {'ip': '192.168.5.28', 'mac': '00:23:24:AA:BB:CC', 'fabricante': 'Lenovo', 'nombre_red': 'DESKTOP-ROMOGM3', 'nombre': 'Servidor IncubApp', 'notas': '', 'conocido': True, 'tipo': 'pc', 'puertos': [80, 135, 445, 4040, 8000]},
    {'ip': '192.168.5.41', 'mac': '3C:52:82:01:02:03', 'fabricante': 'HP Inc.', 'nombre_red': 'PC-SUPERVISOR', 'nombre': 'PC supervisor', 'notas': '', 'conocido': True, 'tipo': 'pc', 'puertos': [135, 445]},
    {'ip': '192.168.5.50', 'mac': 'C0:56:E3:44:55:66', 'fabricante': 'Hangzhou Hikvision', 'nombre_red': 'IPCAM-SALA1', 'nombre': 'Cámara sala 1', 'notas': '', 'conocido': True, 'tipo': 'camara', 'puertos': [80, 554, 8000]},
    {'ip': '192.168.5.51', 'mac': 'C0:56:E3:44:55:67', 'fabricante': 'Hangzhou Hikvision', 'nombre_red': 'IPCAM-SALA2', 'nombre': 'Cámara sala 2', 'notas': '', 'conocido': True, 'tipo': 'camara', 'puertos': [80, 554]},
    {'ip': '192.168.5.60', 'mac': '00:1B:1B:0A:0B:0C', 'fabricante': 'Siemens AG', 'nombre_red': None, 'nombre': 'PLC incubadora 3', 'notas': 'S7-1200', 'conocido': True, 'tipo': 'plc', 'puertos': [102, 80]},
    {'ip': '192.168.5.70', 'mac': '00:26:AB:12:34:56', 'fabricante': 'Seiko Epson', 'nombre_red': 'EPSON-L3250', 'nombre': '', 'notas': '', 'conocido': True, 'tipo': 'impresora', 'puertos': [80, 631, 9100]},
    {'ip': '192.168.5.77', 'mac': '9A:1F:22:CC:DD:EE', 'fabricante': None, 'nombre_red': 'Galaxy-A54', 'nombre': '', 'notas': '', 'conocido': False, 'tipo': 'celular', 'puertos': [], 'mac_aleatoria': True},
    {'ip': '192.168.5.88', 'mac': 'DC:A6:32:98:76:54', 'fabricante': 'Raspberry Pi Trading', 'nombre_red': '<b>pwn</b><img src=x onerror=alert(1)>', 'nombre': '', 'notas': '', 'conocido': False, 'tipo': 'desconocido', 'puertos': [22, 8080]},
    {'ip': '192.168.5.90', 'mac': '50:EB:F6:01:23:45', 'fabricante': 'ASUSTek', 'nombre_red': 'PORTATIL-HENRY', 'nombre': 'Portátil Henry', 'notas': '', 'conocido': True, 'tipo': 'pc', 'puertos': []},
    {'ip': '192.168.5.101', 'mac': 'F4:F5:D8:AA:00:11', 'fabricante': 'Google', 'nombre_red': None, 'nombre': '', 'notas': '', 'conocido': False, 'tipo': 'desconocido', 'puertos': []},
    {'ip': '192.168.5.120', 'mac': '00:0E:C6:77:88:99', 'fabricante': 'ASIX Electronics', 'nombre_red': None, 'nombre': 'Báscula pesaje', 'notas': '', 'conocido': True, 'tipo': 'desconocido', 'puertos': [502]},
]
_t0 = time.time()
for _i, _d in enumerate(DISPOSITIVOS):
    _d.setdefault('mac_aleatoria', False)
    _d['primera_vez'] = iso(_t0 - (40 - _i * 3) * 86400 if _d['conocido'] else _t0 - 3600 * (_i - 5))
    _d['ultima_vez'] = iso(_t0 - (0 if _i % 4 else 7200))
    _d['en_linea'] = bool(_i % 4)


def red_resumen():
    return {'generado': ahora_iso(),
            'interfaces': [{'nombre': 'Ethernet', 'ip': '192.168.5.28', 'mascara': '255.255.255.0', 'puerta': '192.168.5.1',
                            'dns': ['192.168.5.1', '1.1.1.1'], 'mac': '00:23:24:AA:BB:CC', 'tipo': 'ethernet'},
                           {'nombre': 'vEthernet (WSL)', 'ip': '172.24.0.1', 'mascara': '255.255.240.0', 'puerta': None,
                            'dns': [], 'mac': '00:15:5D:01:02:03', 'tipo': 'virtual'}],
            'puerta': '192.168.5.1', 'red': '192.168.5.0/24',
            'internet': {'nivel': 'ok', 'puerta_ms': 1, 'internet_ms': rnd.randint(18, 35), 'perdida_pct': 0, 'dns_ms': 12, 'texto': 'Internet estable'},
            'dispositivos': {'total': len(DISPOSITIVOS), 'conocidos': sum(d['conocido'] for d in DISPOSITIVOS),
                             'nuevos': sum(not d['conocido'] for d in DISPOSITIVOS), 'ultimo_escaneo': iso(time.time() - 1500)},
            'alertas': [H('equipos_nuevos', 'red', 'medio', '3 equipos nuevos sin identificar en la red',
                          'Aparecieron en el último escaneo y nadie les ha puesto nombre.', 'Revíselos en Red → Dispositivos y márquelos como conocidos.', None,
                          '192.168.5.77, 192.168.5.88, 192.168.5.101')]}


def calidad(horas):
    horas = max(0.1, min(168.0, horas))
    paso = 30 if horas <= 6 else 60 if horas <= 24 else 300
    fin = int(time.time() // paso * paso)
    n = int(horas * 3600 / paso)
    t = [fin - (n - 1 - i) * paso for i in range(n)]
    r = random.Random(3)
    s = {'puerta': [], '1.1.1.1': [], '8.8.8.8': [], 'dns_ms': []}
    corte_ini = fin - int(horas * 3600 * 0.35)
    corte_fin = corte_ini + 4 * 60
    for ts in t:
        if corte_ini <= ts <= corte_fin:
            s['puerta'].append(round(r.uniform(0.6, 2.2), 1))
            s['1.1.1.1'].append(None)
            s['8.8.8.8'].append(None)
            s['dns_ms'].append(None)
            continue
        s['puerta'].append(round(r.uniform(0.6, 2.5) + (12 if r.random() < 0.01 else 0), 1))
        s['1.1.1.1'].append(round(18 + 6 * math.sin(ts / 3000) + r.uniform(-3, 12), 1))
        s['8.8.8.8'].append(round(24 + 6 * math.sin(ts / 3300) + r.uniform(-3, 14), 1))
        s['dns_ms'].append(round(10 + r.uniform(-4, 20), 1))
    cortes = [{'inicio': iso(corte_ini), 'fin': iso(corte_fin), 'segundos': corte_fin - corte_ini, 'objetivo': 'internet'}]
    return {'t': t, 'series': s, 'perdida': {'puerta': 0.0, '1.1.1.1': 0.8, '8.8.8.8': 0.9}, 'cortes': cortes}


def lanzar_escaneo(red):
    red = red or '192.168.5.0/24'
    guion = [(0.3, f'Barrido de {red} (254 direcciones, 64 a la vez)…', 0.02)]
    for i, d in enumerate(DISPOSITIVOS):
        guion.append((0.25, f'  {d["ip"]:<15} {d["mac"]}  {d.get("fabricante") or "fabricante desconocido"}', (i + 1) / (len(DISPOSITIVOS) + 2)))
    guion.append((0.3, 'Buscando nombres (DNS y NetBIOS)…', 0.95))
    guion.append((0.3, f'Listo: {len(DISPOSITIVOS)} equipos, 3 sin identificar.', 1.0))

    def fin():
        nuevos = [d for d in DISPOSITIVOS if not d['conocido']]
        return {'red': red, 'generado': ahora_iso(), 'segundos': 8.4, 'dispositivos': DISPOSITIVOS, 'nuevos': nuevos}
    return lanzar('escaneo_red', f'Escanear la red {red}', guion, fin, exclusivo='escaneo_red')


def lanzar_puertos(host, perfil):
    if not re.fullmatch(r'(\d{1,3}\.){3}\d{1,3}|[A-Za-z0-9.-]{1,253}', host or ''):
        raise ValueError('Escriba una IP (192.168.5.1) o un nombre válido.')
    if perfil not in ('rapido', 'comun', 'industrial', 'completo'):
        raise ValueError('Perfil no válido.')
    abiertos = [
        {'puerto': 53, 'servicio': 'DNS', 'riesgo': 'bajo', 'nota': None, 'titulo_web': None},
        {'puerto': 80, 'servicio': 'HTTP', 'riesgo': 'medio', 'nota': 'Página de administración sin cifrar', 'titulo_web': 'TP-LINK <Router> & "Admin"'},
        {'puerto': 443, 'servicio': 'HTTPS', 'riesgo': 'bajo', 'nota': None, 'titulo_web': 'TP-Link'},
        {'puerto': 23, 'servicio': 'Telnet', 'riesgo': 'alto', 'nota': 'Telnet manda la contraseña sin cifrar', 'titulo_web': None},
    ]
    n = {'rapido': 20, 'comun': 100, 'industrial': 40, 'completo': 1100}[perfil]
    guion = [(0.3, f'Escaneando {n} puertos de {host} (perfil {perfil})…', 0.05)]
    for i, a in enumerate(abiertos):
        guion.append((0.4, f'  {a["puerto"]}/tcp abierto  {a["servicio"]}', (i + 1) / (len(abiertos) + 1)))
    guion.append((0.3, f'Listo: {len(abiertos)} abiertos de {n}.', 1.0))
    res = {'host': host, 'perfil': perfil, 'generado': ahora_iso(), 'segundos': 3.2, 'abiertos': abiertos,
           'hallazgos': [H('telnet', 'red', 'alto', f'{host} tiene Telnet (23) abierto', 'Telnet manda usuario y contraseña sin cifrar.',
                           'Desactívelo en la configuración del equipo y use SSH o HTTPS.', None, '23/tcp abierto')]}
    return lanzar('puertos', f'Puertos de {host}', guion, res)


def lanzar_herramienta(tipo, p):
    host = p.get('host') or ''
    if tipo in ('ping', 'traceroute', 'puerto') and not re.fullmatch(r'(\d{1,3}\.){3}\d{1,3}|[A-Za-z0-9.-]{1,253}', host):
        raise ValueError('Escriba una IP (192.168.5.1) o un nombre válido.')
    if tipo == 'ping':
        n = int(p.get('cantidad') or 4)
        if not 1 <= n <= 50:
            raise ValueError('La cantidad debe estar entre 1 y 50.')
        tiempos = [round(random.uniform(0.6, 3.0), 1) for _ in range(n)]
        guion = [(0.2, f'Haciendo ping a {host} ({n} veces)…', None)] + [
            (0.5, f'Respuesta desde {host}: tiempo={x} ms TTL=64', (i + 1) / n) for i, x in enumerate(tiempos)]
        res = {'host': host, 'enviados': n, 'recibidos': n, 'perdida_pct': 0.0, 'min_ms': min(tiempos),
               'prom_ms': round(sum(tiempos) / n, 1), 'max_ms': max(tiempos), 'tiempos': tiempos}
        return lanzar('herramienta', f'Ping a {host}', guion, res)
    if tipo == 'traceroute':
        saltos = [{'salto': 1, 'ip': '192.168.5.1', 'nombre': 'router.local', 'ms': 1.1},
                  {'salto': 2, 'ip': '10.20.0.1', 'nombre': None, 'ms': 6.4},
                  {'salto': 3, 'ip': None, 'nombre': None, 'ms': None},
                  {'salto': 4, 'ip': '181.48.0.9', 'nombre': 'static-181-48-0-9.une.net.co', 'ms': 14.2},
                  {'salto': 5, 'ip': host, 'nombre': None, 'ms': 21.7}]
        guion = [(0.2, f'Ruta hacia {host}, máximo 30 saltos', None)] + [
            (0.6, f'{s["salto"]:>3}  {(str(s["ms"]) + " ms") if s["ms"] else "*":>8}  {s["ip"] or "Tiempo de espera agotado"}', None) for s in saltos]
        return lanzar('herramienta', f'Traceroute a {host}', guion, {'host': host, 'saltos': saltos})
    if tipo == 'dns':
        nombre = p.get('nombre') or ''
        if not re.fullmatch(r'[A-Za-z0-9.-]{1,253}', nombre):
            raise ValueError('Escriba un nombre válido, por ejemplo incubapp.cdhmaker.com.')
        res = {'nombre': nombre, 'resultados': [
            {'servidor': '192.168.5.1 (el del equipo)', 'direcciones': ['104.21.32.1', '172.67.150.2'], 'ms': 14, 'error': None},
            {'servidor': '1.1.1.1', 'direcciones': ['104.21.32.1', '172.67.150.2'], 'ms': 19, 'error': None},
            {'servidor': '8.8.8.8', 'direcciones': ['104.21.32.1', '172.67.150.2'], 'ms': 27, 'error': None}],
            'coinciden': True, 'nota': 'Los tres DNS responden lo mismo.'}
        return lanzar('herramienta', f'DNS de {nombre}', guion_simple([f'Preguntando {nombre}…', '  192.168.5.1 → 104.21.32.1, 172.67.150.2 (14 ms)',
                                                                       '  1.1.1.1 → 104.21.32.1, 172.67.150.2 (19 ms)', '  8.8.8.8 → 104.21.32.1, 172.67.150.2 (27 ms)'], 0.4), res)
    if tipo == 'http':
        url = p.get('url') or ''
        if not re.fullmatch(r'https?://[^\s]{1,300}', url):
            raise ValueError('Escriba una dirección que empiece por http:// o https://')
        res = {'url': url, 'codigo': 200, 'ms': 431, 'titulo': 'IncubApp', 'servidor': 'cloudflare',
               'cabeceras': {'Strict-Transport-Security': None, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN',
                             'Content-Security-Policy': None, 'Referrer-Policy': 'strict-origin-when-cross-origin'},
               'certificado': {'emisor': "Google Trust Services (WE1)", 'vence': '2026-12-15', 'dias': 75, 'nombres': ['incubapp.cdhmaker.com']}}
        return lanzar('herramienta', f'HTTP {url}', guion_simple([f'GET {url}', 'HTTP/2 200 en 431 ms', 'server: cloudflare',
                                                                  'Certificado: Google Trust Services, vence en 75 días']), res)
    if tipo == 'puerto':
        puerto = int(p.get('puerto') or 0)
        if not 1 <= puerto <= 65535:
            raise ValueError('El puerto debe estar entre 1 y 65535.')
        abierto = puerto in (53, 80, 443)
        return lanzar('herramienta', f'Puerto {host}:{puerto}', guion_simple([f'Conectando a {host}:{puerto}…',
                                                                              'Abierto (respondió en 2 ms)' if abierto else 'Cerrado o filtrado (sin respuesta en 2 s)']),
                      {'host': host, 'puerto': puerto, 'abierto': abierto, 'ms': 2 if abierto else None, 'servicio': {53: 'DNS', 80: 'HTTP', 443: 'HTTPS'}.get(puerto)})
    if tipo == 'wol':
        mac = p.get('mac') or ''
        if not re.fullmatch(r'([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}', mac):
            raise ValueError('Escriba una MAC válida, por ejemplo 00:23:24:AA:BB:CC.')
        return lanzar('herramienta', f'Encender {mac}', guion_simple([f'Mandando paquete mágico a {mac} (broadcast 192.168.5.255:9)…', 'Enviado.']),
                      {'mac': mac, 'enviado': True})
    if tipo == 'upnp':
        res = {'dispositivos': [
            {'ip': '192.168.5.1', 'servidor': 'Linux/3.10 UPnP/1.0 TP-LINK/1.0', 'tipo': 'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
             'ubicacion': 'http://192.168.5.1:1900/gateway.xml', 'nombre': 'Archer C6'},
            {'ip': '192.168.5.70', 'servidor': 'EPSON_Linux UPnP/1.0', 'tipo': 'urn:schemas-upnp-org:device:Printer:1',
             'ubicacion': 'http://192.168.5.70:80/upnp.xml', 'nombre': 'EPSON L3250'}],
            'hallazgos': [H('upnp_igd', 'red', 'medio', 'El router permite que los equipos abran puertos solos (UPnP IGD)',
                            'Un programa malicioso en cualquier equipo podría abrir un puerto hacia internet sin que nadie lo note.',
                            'Desactive UPnP en la configuración del router si no lo usa.', None, 'InternetGatewayDevice:1 en 192.168.5.1')]}
        return lanzar('herramienta', 'Buscar equipos UPnP', guion_simple(['Mandando M-SEARCH a 239.255.255.250:1900…', 'Respuesta de 192.168.5.1',
                                                                          'Respuesta de 192.168.5.70', 'Listo: 2 equipos.'], 0.6), res)
    raise ValueError(f'Herramienta desconocida: {tipo}')


ULTIMA_AUD_RED = {'dato': None}


def lanzar_auditoria_red():
    def fin():
        hs = [H('arp_ok', 'red', 'ok', 'La MAC de la puerta de enlace no cambió', '', 'Nada que hacer.', None, 'B0:4E:26:11:22:33'),
              H('telnet_router', 'red', 'alto', 'El router 192.168.5.1 tiene Telnet abierto', 'Telnet manda la contraseña sin cifrar.',
                'Desactívelo en la configuración del router.', None, '192.168.5.1:23'),
              H('camara_http', 'red', 'medio', 'Las cámaras se administran por http sin cifrar', '', 'Cambie la contraseña por defecto y use https si el equipo lo permite.', None, '192.168.5.50:80, 192.168.5.51:80'),
              H('plc_expuesto', 'red', 'medio', 'El PLC 192.168.5.60 responde a S7 (102) desde toda la red',
                'Cualquier equipo de la oficina puede hablar con el PLC.', 'Separe la red de la planta (VLAN) o limite el acceso en el firewall del router.', None, '192.168.5.60:102'),
              H('desconocidos', 'red', 'bajo', '3 equipos sin identificar', '', 'Póngales nombre en Dispositivos.', None, None),
              H('dns_ok', 'red', 'ok', 'El DNS de la red responde igual que 1.1.1.1', '', 'Nada que hacer.', None, None)]
        resumen = {k: sum(1 for h in hs if h['nivel'] == k) for k in ('critico', 'alto', 'medio', 'bajo', 'info', 'ok')}
        d = {'generado': ahora_iso(), 'segundos': 21.0, 'puntaje': 72, 'resumen': resumen, 'hallazgos': hs}
        ULTIMA_AUD_RED['dato'] = d
        return d
    pasos = ['Puerta de enlace y ARP…', 'DNS…', 'UPnP…', 'Puertos de administración de los equipos…', 'Equipos industriales…', 'Equipos sin identificar…']
    return lanzar('auditoria_red', 'Auditoría de la red', [(0.6, p, (i + 1) / len(pasos)) for i, p in enumerate(pasos)], fin, exclusivo='auditoria_red')


AJUSTES = {'intervalo_rapido_s': 10, 'intervalo_completo_s': 60, 'notificaciones': True, 'url_publica': 'https://incubapp.cdhmaker.com',
           'red_escanear': 'auto', 'escaneo_red_min': 30, 'auditoria_min': 360, 'monitor_internet': True, 'intervalo_internet_s': 30,
           'abrir_al_iniciar': True, 'extra': {}}


# ═══════════════════════════ HTTP ═══════════════════════════
class Manejador(http.server.BaseHTTPRequestHandler):
    server_version = 'PanelSimulado/1.0'
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):  # silencio salvo errores
        if args and str(args[1] if len(args) > 1 else '').startswith(('4', '5')):
            super().log_message(fmt, *args)

    # ── respuestas ──
    def _enviar(self, codigo, cuerpo: bytes, tipo='application/json; charset=utf-8', extra=None):
        self.send_response(codigo)
        self.send_header('Content-Type', tipo)
        self.send_header('Content-Length', str(len(cuerpo)))
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(cuerpo)

    def json(self, datos, codigo=200):
        self._enviar(codigo, json.dumps(datos, ensure_ascii=False).encode('utf-8'))

    def error_(self, codigo, mensaje):
        self.json({'error': mensaje}, codigo)

    def _cuerpo(self):
        n = int(self.headers.get('Content-Length') or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode('utf-8') or '{}')
        except ValueError:
            return None

    def _caido(self):
        if time.time() < SIM['caida_hasta']:
            self.close_connection = True
            try:
                self.connection.shutdown(2)
            except OSError:
                pass
            return True
        return False

    def do_GET(self):
        if self._caido():
            return
        u = urllib.parse.urlsplit(self.path)
        q = {k: v[-1] for k, v in urllib.parse.parse_qs(u.query).items()}
        ruta = u.path
        if ruta == '/sim':
            return self._sim(q)
        if ruta == '/entrar':
            self.send_response(302)
            self.send_header('Set-Cookie', f'panel={q.get("llave", "prueba")}; HttpOnly; SameSite=Strict; Path=/')
            self.send_header('Location', '/')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if ruta.startswith('/api/'):
            return self._api('GET', ruta, q, None)
        return self._estatico(ruta)

    def do_POST(self):
        if self._caido():
            return
        u = urllib.parse.urlsplit(self.path)
        q = {k: v[-1] for k, v in urllib.parse.parse_qs(u.query).items()}
        cuerpo = self._cuerpo()
        if not u.path.startswith('/api/'):
            return self.error_(404, 'No existe.')
        if self.headers.get('X-Panel') != '1':
            return self.error_(403, 'Falta la cabecera X-Panel (petición rechazada).')
        if cuerpo is None:
            return self.error_(400, 'El cuerpo no es JSON válido.')
        return self._api('POST', u.path, q, cuerpo)

    def _sim(self, q):
        if 'nivel' in q:
            SIM['nivel'] = q['nivel']
        if 'r503' in q:
            SIM['r503'] ^= {q['r503']}
        if 'caida' in q:
            SIM['caida_hasta'] = time.time() + float(q['caida'])
        if 'sin_sesion' in q:
            SIM['sin_sesion'] = q['sin_sesion'] == '1'
        self.json({'nivel': SIM['nivel'], 'r503': sorted(SIM['r503']), 'caida_hasta': iso(SIM['caida_hasta']), 'sin_sesion': SIM['sin_sesion']})

    def _estatico(self, ruta):
        if ruta in ('', '/'):
            ruta = '/index.html'
        partes = [p for p in urllib.parse.unquote(ruta).split('/') if p]
        if any(p in ('..', '.') or '\\' in p for p in partes):
            return self.error_(404, 'No existe.')
        archivo = WEB.joinpath(*partes)
        if not archivo.is_file():
            return self.error_(404, 'No existe.')
        tipo = mimetypes.guess_type(archivo.name)[0] or 'application/octet-stream'
        if archivo.suffix == '.js':
            tipo = 'text/javascript; charset=utf-8'
        elif archivo.suffix in ('.html', '.css', '.svg'):
            tipo += '; charset=utf-8'
        self._enviar(200, archivo.read_bytes(), tipo)

    def _api(self, metodo, ruta, q, cuerpo):
        if ruta == '/api/ping':
            return self.json({'app': 'incubapp-panel', 'version': '1.0.0', 'pid': 4242})
        cookie = self.headers.get('Cookie') or ''
        if SIM['sin_sesion'] or 'panel=' not in cookie:
            return self.error_(401, 'Abra el panel desde el acceso directo «Panel IncubApp».')
        if ruta in SIM['r503']:
            return self.error_(503, 'Esta parte del panel no cargó (simulado).')
        time.sleep(0.05 + random.random() * 0.15)       # latencia realista
        try:
            r = self._rutas(metodo, ruta, q, cuerpo)
        except KeyError as e:
            return self.error_(404, str(e).strip('"\''))
        except ValueError as e:
            return self.error_(400, str(e))
        if r is None:
            return self.error_(404, f'No existe la ruta {ruta}.')
        self.json(r)

    def _rutas(self, m, ruta, q, c):
        G, P = m == 'GET', m == 'POST'
        if G and ruta == '/api/estado':
            return estado()
        if P and ruta == '/api/estado/actualizar':
            return {'ok': True}
        if G and ruta == '/api/metricas':
            return metricas(float(q.get('horas', 24)))
        if G and ruta == '/api/eventos':
            return {'eventos': eventos(int(q.get('limite', 200)))}
        if G and ruta == '/api/acciones':
            return {'acciones': acciones()}
        mo = re.fullmatch(r'/api/acciones/([a-z_]+)', ruta)
        if P and mo:
            return {'trabajo': lanzar_accion(mo.group(1), (c or {}).get('parametros') or {}).como_dict()}
        if G and ruta == '/api/trabajos':
            ids = list(reversed(ORDEN[-30:]))
            return {'trabajos': [TRABAJOS[i].como_dict(con_lineas=False) for i in ids]}
        mo = re.fullmatch(r'/api/trabajos/([0-9a-f]{12})', ruta)
        if G and mo:
            t = TRABAJOS.get(mo.group(1))
            if not t:
                raise KeyError('Ese trabajo ya no existe.')
            return t.como_dict(int(q.get('desde', 0)))
        mo = re.fullmatch(r'/api/trabajos/([0-9a-f]{12})/cancelar', ruta)
        if P and mo:
            t = TRABAJOS.get(mo.group(1))
            if not t or t.estado != 'corriendo':
                return {'ok': False}
            t.cancelar_ev.set()
            return {'ok': True}
        if G and ruta == '/api/registros/fuentes':
            return {'fuentes': fuentes_registro()}
        if G and ruta == '/api/registros':
            f = q.get('fuente') or ''
            if f not in {x['id'] for x in fuentes_registro()}:
                raise ValueError('Esa fuente de registro no existe.')
            return leer_registro(f, max(10, min(5000, int(q.get('lineas', 300)))), q.get('filtro'))
        if G and ruta == '/api/seguridad':
            t = next((TRABAJOS[i] for i in reversed(ORDEN) if TRABAJOS[i].tipo == 'auditoria' and TRABAJOS[i].estado == 'corriendo'), None)
            return {'auditoria': ULTIMA_AUDITORIA['dato'], 'arreglos': ARREGLOS, 'trabajo': t.como_dict(con_lineas=False) if t else None}
        if P and ruta == '/api/seguridad/auditar':
            return {'trabajo': lanzar_auditoria().como_dict()}
        if P and ruta == '/api/seguridad/arreglar':
            id_ = (c or {}).get('id')
            a = next((x for x in ARREGLOS if x['id'] == id_), None)
            if not a:
                raise ValueError(f'No existe el arreglo «{id_}».')

            def fin():
                ARREGLADOS.add(id_)
                return {'ok': True, 'mensaje': f'{a["titulo"]}: aplicado.'}
            return {'trabajo': lanzar('arreglo', a['titulo'], guion_simple(
                ['Pidiendo permiso de administrador a Windows…' if a['admin'] else 'Aplicando…', 'Hecho.', 'Volviendo a revisar…', 'Quedó bien.']), fin).como_dict()}
        if G and ruta == '/api/seguridad/puertos':
            return {'puertos': puertos()}
        if G and ruta == '/api/seguridad/conexiones':
            return {'conexiones': conexiones()}
        if G and ruta == '/api/seguridad/accesos':
            return accesos(int(q.get('horas', 24)))
        if G and ruta == '/api/red':
            return red_resumen()
        if G and ruta == '/api/red/calidad':
            return calidad(float(q.get('horas', 24)))
        if G and ruta == '/api/red/dispositivos':
            return {'dispositivos': DISPOSITIVOS}
        if P and ruta == '/api/red/dispositivos':
            d = next((x for x in DISPOSITIVOS if x['mac'] == (c or {}).get('mac')), None)
            if not d:
                raise KeyError('Ese equipo no está en el inventario.')
            for k in ('nombre', 'notas'):
                if c.get(k) is not None:
                    d[k] = str(c[k])[:80]
            if c.get('conocido') is not None:
                d['conocido'] = bool(c['conocido'])
            return d
        if P and ruta == '/api/red/dispositivos/olvidar':
            antes = len(DISPOSITIVOS)
            DISPOSITIVOS[:] = [x for x in DISPOSITIVOS if x['mac'] != (c or {}).get('mac')]
            return {'ok': len(DISPOSITIVOS) < antes}
        if P and ruta == '/api/red/escanear':
            return {'trabajo': lanzar_escaneo((c or {}).get('red')).como_dict()}
        if P and ruta == '/api/red/puertos':
            return {'trabajo': lanzar_puertos((c or {}).get('host'), (c or {}).get('perfil') or 'comun').como_dict()}
        if P and ruta == '/api/red/herramienta':
            c = c or {}
            return {'trabajo': lanzar_herramienta(c.get('tipo'), c).como_dict()}
        if G and ruta == '/api/red/auditoria':
            t = next((TRABAJOS[i] for i in reversed(ORDEN) if TRABAJOS[i].tipo == 'auditoria_red' and TRABAJOS[i].estado == 'corriendo'), None)
            return {'auditoria': ULTIMA_AUD_RED['dato'], 'trabajo': t.como_dict(con_lineas=False) if t else None}
        if P and ruta == '/api/red/auditar':
            return {'trabajo': lanzar_auditoria_red().como_dict()}
        if P and ruta == '/api/red/fabricantes':
            return {'trabajo': lanzar('fabricantes', 'Actualizar base de fabricantes', guion_simple(
                ['Descargando https://www.wireshark.org/download/automated/data/manuf …', '2,1 MB', '51.233 fabricantes', 'Guardado.'], 0.6, True),
                {'fabricantes': 51233}).como_dict()}
        if G and ruta == '/api/ajustes':
            return AJUSTES
        if P and ruta == '/api/ajustes':
            for k, v in (c or {}).items():
                if k in AJUSTES and k != 'extra' and isinstance(v, type(AJUSTES[k])):
                    AJUSTES[k] = v
            return AJUSTES
        if P and ruta == '/api/salir':
            return {'ok': True}
        return None


class Servidor(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def principal():
    ap = argparse.ArgumentParser(description='Servidor simulado del Panel IncubApp')
    ap.add_argument('--puerto', type=int, default=8799)
    a = ap.parse_args()
    srv = Servidor(('127.0.0.1', a.puerto), Manejador)
    print(f'Panel simulado: http://127.0.0.1:{a.puerto}/entrar?llave=prueba', flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    principal()
