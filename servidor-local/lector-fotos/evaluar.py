"""Mide el lector contra las fotos con lecturas digitadas por los operarios.
Uso: python evaluar.py /datos/etiquetas.csv /datos/fotos
Por campo: acierto (igual a lo digitado ±0,05), error (distinto) y sin lectura.
Lo importante es el error: el bot solo escribe lo que lee, así que un «sin lectura»
cuesta poco (queda para el operario) y un error es un dato falso en el formato.
"""
import csv
import sys
import time
from lector import leer

CAMPOS = ['temp_ovoscan', 'temp_air', 'humidity', 'co2', 'turn_count']
etiquetas, carpeta = sys.argv[1], sys.argv[2]
tot = {c: {'ok': 0, 'cerca': 0, 'mal': 0, 'nada': 0} for c in CAMPOS}
errores = []
motivos = {}
t0 = time.time()
filas = list(csv.DictReader(open(etiquetas, encoding='utf-8')))
for f in filas:
    r = leer(f'{carpeta}/{f["id"]}.jpg', f['type'])
    v = r.get('valores', {})
    for c, m in r.get('detalle', {}).items():
        if not m.startswith('ok'):
            k = (c, m.split(' (')[0]); motivos[k] = motivos.get(k, 0) + 1
    for c in CAMPOS:
        if not f.get(c):
            continue
        real = float(f[c])
        if c not in v:
            tot[c]['nada'] += 1
        elif abs(v[c] - real) <= (5 if c == 'turn_count' else 0.05):
            tot[c]['ok'] += 1
        elif abs(v[c] - real) <= (10 if c == 'turn_count' else 0.8):
            tot[c]['cerca'] += 1
        else:
            tot[c]['mal'] += 1
            errores.append((f['code'], c, real, v[c]))
seg = (time.time() - t0) / max(len(filas), 1)
print(f'{len(filas)} fotos · {seg:.1f} s por foto')
for c, t in tot.items():
    n = sum(t.values())
    if n:
        print(f'{c:13} exacto {t["ok"]:3}/{n}  décimas {t["cerca"]:3}  error {t["mal"]:3}  sin lectura {t["nada"]:3}')
print('Errores (máquina, campo, digitado, leído):')
for e in errores[:25]:
    print('  ', e)
print('Por qué no leyó:')
for k, n in sorted(motivos.items(), key=lambda x: -x[1]):
    print('  ', k, n)
