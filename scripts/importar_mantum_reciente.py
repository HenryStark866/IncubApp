# -*- coding: utf-8 -*-
"""Importa lo ejecutado en Mántum en el último año para el cumplimiento del Plan AM.

QUÉ LEE: todos los .xlsx de MANTENIMIENTO/generador/datos_mantum que sean
exportaciones de Mántum de
  - órdenes de trabajo (columnas Código, Fecha Creación, Fecha Inicio,
    Fecha Fin, Entidades, Actividades, Realimentación, Tipos Mtto, Ejecutores…)
  - bitácoras (Ejecutor, Fecha / Hora, Entidad, Actividad Realizada, Descripción…)
Reconoce cada archivo por sus encabezados, no por el nombre: basta con guardar
la exportación en esa carpeta.

QUÉ ESCRIBE: src/data/mantumRecentExecutions.json — un registro por OT o por
línea de bitácora desde --desde (por omisión, un año atrás), con los códigos de
equipo tal como los usa el Plan AM (INC-001.12, 005.13…). Nada se completa ni se
supone: lo que Mántum no trae queda vacío.

USO:  python scripts/importar_mantum_reciente.py [--desde 2025-09-01]
"""
import argparse
import datetime as dt
import glob
import html
import json
import os
import re
import zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEN = os.path.join(RAIZ, 'MANTENIMIENTO', 'generador', 'datos_mantum')
DESTINO = os.path.join(RAIZ, 'src', 'data', 'mantumRecentExecutions.json')


def leer_xlsx(ruta):
    """Filas de la primera hoja, sin dependencias (openpyxl no siempre está)."""
    z = zipfile.ZipFile(ruta)
    compartidas = []
    if 'xl/sharedStrings.xml' in z.namelist():
        x = z.read('xl/sharedStrings.xml').decode('utf-8')
        for si in re.findall(r'<si>(.*?)</si>', x, re.S):
            compartidas.append(''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S)))
    hoja = sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n))[0]
    x = z.read(hoja).decode('utf-8')
    filas = []
    for fila in re.findall(r'<row[^>]*>(.*?)</row>', x, re.S):
        celdas = {}
        for attrs, dentro in re.findall(r'<c ([^>]*?)(?:/>|>(.*?)</c>)', fila, re.S):
            ref = re.search(r'r="([A-Z]+)', attrs)
            if not ref:
                continue
            col = 0
            for ch in ref.group(1):
                col = col * 26 + ord(ch) - 64
            v = re.search(r'<v>(.*?)</v>', dentro or '', re.S)
            t = re.search(r't="(\w+)"', attrs)
            valor = v.group(1) if v else ''
            if t and t.group(1) == 's' and valor:
                valor = compartidas[int(valor)]
            elif t and t.group(1) == 'inlineStr':
                valor = ''.join(re.findall(r'<t[^>]*>(.*?)</t>', dentro or '', re.S))
            celdas[col - 1] = html.unescape(valor).strip()
        n = max(celdas) + 1 if celdas else 0
        filas.append([celdas.get(i, '') for i in range(n)])
    return filas


def encabezado(filas):
    """Mántum pone la fecha de exportación en la fila 1; el encabezado es la primera fila con varios textos."""
    for i, f in enumerate(filas[:6]):
        if sum(1 for c in f if c) >= 4:
            return i, [c.strip() for c in f]
    return None, []


def fecha(texto):
    """'2026-04-20 [07:00 - 08:00]', '2026-04-20 07:00', '20/04/2026' o serial de Excel."""
    s = str(texto or '').strip()
    if not s:
        return None
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})(?:\D+(\d{1,2}):(\d{2}))?', s)
    if m:
        a, me, d, h, mi = m.groups()
        return dt.datetime(int(a), int(me), int(d), int(h or 12), int(mi or 0))
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', s)
    if m:
        d, me, a = m.groups()
        return dt.datetime(int(a), int(me), int(d), 12)
    if re.match(r'^\d{5}(\.\d+)?$', s):
        return dt.datetime(1899, 12, 30) + dt.timedelta(days=float(s))
    return None


def codigos(entidades):
    """'INC-001.12 | INCUBADORA 12, 005.13 | AHU …' → ['INC-001.12', '005.13']."""
    out = []
    for parte in re.split(r',\s*(?=[A-Z0-9()-]+(?:\.\d+)?\s*\|)', str(entidades or '')):
        cod = parte.split('|')[0].strip().upper()
        if cod and cod not in out:
            out.append(cod)
    return out


def nombre(persona):
    """'1017189866 | Henry Camilo Taborda Galeano' → 'Henry Camilo Taborda Galeano' (sin la cédula)."""
    s = str(persona or '').strip().rstrip('.')
    return s.split('|', 1)[1].strip() if '|' in s else s


def num(texto):
    s = str(texto or '').replace('.', '').replace(',', '.').strip()
    try:
        return float(s)
    except ValueError:
        return None


def main():
    ap = argparse.ArgumentParser()
    hoy = dt.date.today()
    ap.add_argument('--desde', default=(hoy.replace(year=hoy.year - 1)).isoformat())
    args = ap.parse_args()
    desde = dt.datetime.fromisoformat(args.desde)

    registros, vistos, resumen = [], set(), []
    for ruta in sorted(glob.glob(os.path.join(ORIGEN, '*.xlsx'))):
        filas = leer_xlsx(ruta)
        i, cab = encabezado(filas)
        if i is None:
            continue
        idx = {c: k for k, c in enumerate(cab)}
        g = lambda f, c: f[idx[c]] if c in idx and idx[c] < len(f) else ''
        tipo = 'ot' if {'Código', 'Entidades', 'Actividades'} <= set(cab) else \
               'bitacora' if {'Ejecutor', 'Fecha / Hora', 'Actividad Realizada'} <= set(cab) else None
        if not tipo:
            continue
        n = 0
        for f in filas[i + 1:]:
            if tipo == 'ot':
                cuando = fecha(g(f, 'Fecha Fin')) or fecha(g(f, 'Fecha Inicio')) or fecha(g(f, 'Fecha Creación'))
                if not cuando or cuando < desde:
                    continue
                clave = ('ot', g(f, 'Código'))
                if clave in vistos:
                    continue
                vistos.add(clave)
                actividades = re.sub(r'\s*\[Vencimiento:[^\]]*\]', '', g(f, 'Actividades'))
                actividades = ', '.join(dict.fromkeys(a.strip() for a in actividades.split(', ') if a.strip()))
                registros.append({
                    'id': f"mantum-ot-{g(f, 'Código')}",
                    'source': 'mantum-ot',
                    'code': g(f, 'Código'),
                    'date': cuando.isoformat(timespec='minutes'),
                    'createdAt': (fecha(g(f, 'Fecha Creación')) or cuando).isoformat(timespec='minutes'),
                    'startedAt': (fecha(g(f, 'Fecha Inicio')).isoformat(timespec='minutes') if fecha(g(f, 'Fecha Inicio')) else None),
                    'finishedAt': (fecha(g(f, 'Fecha Fin')).isoformat(timespec='minutes') if fecha(g(f, 'Fecha Fin')) else None),
                    'status': g(f, 'Estado') or ('Cerrada' if g(f, 'Fecha Fin') else ''),
                    'equipment': codigos(g(f, 'Entidades')),
                    'entities': g(f, 'Entidades'),
                    'activity': actividades,
                    'description': g(f, 'Descripción'),
                    'feedback': g(f, 'Realimentación'),
                    'maintenanceType': g(f, 'Tipos Mtto'),
                    'executors': [nombre(p) for p in re.split(r',\s*', g(f, 'Ejecutores')) if p.strip()],
                    'cost': num(g(f, 'Costo Real')),
                })
            else:
                cuando = fecha(g(f, 'Fecha / Hora'))
                if not cuando or cuando < desde:
                    continue
                clave = ('b', g(f, 'Fecha / Hora'), g(f, 'Entidad'), g(f, 'Actividad Realizada'), g(f, 'Descripción'))
                if clave in vistos:
                    continue
                vistos.add(clave)
                registros.append({
                    'id': f'mantum-bit-{len(registros)}',
                    'source': 'mantum-bitacora',
                    'code': (re.match(r'^([A-Z]{2}-\d+)', g(f, 'Actividad Realizada')) or [None, ''])[1],
                    'date': cuando.isoformat(timespec='minutes'),
                    'equipment': codigos(g(f, 'Entidad')),
                    'entities': g(f, 'Entidad'),
                    'activity': g(f, 'Actividad Realizada'),
                    'description': g(f, 'Descripción'),
                    'feedback': '',
                    'maintenanceType': '',
                    'executors': [nombre(g(f, 'Ejecutor'))] if g(f, 'Ejecutor') else [],
                    'registeredBy': nombre(g(f, 'Personal Registro')),
                    'cost': None,
                })
            n += 1
        resumen.append((os.path.basename(ruta), tipo, n))

    registros.sort(key=lambda r: r['date'])
    salida = {
        'generatedAt': dt.datetime.now().isoformat(timespec='seconds'),
        'since': desde.date().isoformat(),
        'source': 'Exportaciones de Mántum en MANTENIMIENTO/generador/datos_mantum',
        'files': [{'file': a, 'kind': t, 'records': n} for a, t, n in resumen],
        'records': registros,
    }
    with open(DESTINO, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(salida, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    for a, t, n in resumen:
        print(f'{t:9} {n:5}  {a}')
    print(f'{len(registros)} registros desde {desde.date()} → {os.path.relpath(DESTINO, RAIZ)}')


if __name__ == '__main__':
    main()
