"""Mide interpretar.py sobre las cajas ya leídas (cajas.json) contra la verdad (verdad.csv).
Uso: python medir.py verdad.csv cajas.json [--detalle campo]
  bien  = igual a la verdad (±0,05; ±10 en volteos)
  MAL   = distinto: un dato falso en el formato (lo que NO puede pasar)
  vacío = no se llenó (queda en blanco)
Las fotos «revisar» no tienen verdad: se cuenta cuántos campos se llenan.
"""
import csv
import json
import sys

import interpretar as _i

CAMPOS = ['temp_ovoscan', 'temp_air', 'humidity', 'co2', 'turn_count']
TOL = {'turn_count': 10, 'co2': 0.05}


def medir(verdad, cajas, detalle_campo=None, mostrar=print, fn=None):
    fn = fn or _i.interpretar
    tot = {c: {'bien': 0, 'mal': 0, 'vacio': 0} for c in CAMPOS}
    llenos_revisar = {c: 0 for c in CAMPOS}
    n_revisar = 0
    malos = []
    for f in verdad:
        k = cajas.get(f['id'])
        if not k or 'cajas' not in k:
            continue
        r = fn(k['cajas'], f['type'])
        v = r.get('valores', {})
        if f['fuente'] == 'revisar':
            n_revisar += 1
            for c in CAMPOS:
                llenos_revisar[c] += c in v
            continue
        for c in CAMPOS:
            if not f.get(c):
                continue
            real = float(f[c])
            if c not in v:
                tot[c]['vacio'] += 1
                if detalle_campo == c:
                    malos.append(('VACÍO', f, real, None, r['detalle'].get(c)))
            elif abs(v[c] - real) <= TOL.get(c, 0.05):
                tot[c]['bien'] += 1
            else:
                tot[c]['mal'] += 1
                malos.append(('MAL', f, real, v[c], r['detalle'].get(c)))
    mal_total = sum(t['mal'] for t in tot.values())
    vac_total = sum(t['vacio'] for t in tot.values())
    for c, t in tot.items():
        mostrar(f'{c:13} bien {t["bien"]:4}  MAL {t["mal"]:3}  vacío {t["vacio"]:3}   | revisar llenos {llenos_revisar[c]}/{n_revisar}')
    mostrar(f'TOTAL MAL {mal_total} · vacíos {vac_total}')
    for tipo, f, real, leido, det in malos[:60]:
        if tipo == 'MAL' or detalle_campo:
            mostrar(f'  {tipo} {f["fuente"]:8} {f["code"]:7} {f["id"][:8]} real={real} leído={leido} · {det}')
    return mal_total, vac_total


if __name__ == '__main__':
    verdad = list(csv.DictReader(open(sys.argv[1], encoding='utf-8')))
    cajas = json.load(open(sys.argv[2], encoding='utf-8'))
    campo = sys.argv[sys.argv.index('--detalle') + 1] if '--detalle' in sys.argv else None
    print('== versión actual'); medir(verdad, cajas, campo, fn=_i.interpretar)
    print()
    print('== versión 3'); medir(verdad, cajas, campo, fn=_i.interpretar3)
