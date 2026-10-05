"""Diagnóstico de un campo: lo digitado contra lo leído, con las cajas del OCR de cada foto.
Uso: python diagnostico.py /datos/etiquetas.csv /datos/fotos humidity hatcher [carpeta-para-copiar-las-malas]
"""
import csv
import shutil
import sys
import cv2
import lector

etiquetas, fotos, campo, tipo = sys.argv[1:5]
copiar = sys.argv[5] if len(sys.argv) > 5 else None
for f in csv.DictReader(open(etiquetas, encoding='utf-8')):
    if f['type'] != tipo or not f[campo]:
        continue
    img = cv2.imread(f'{fotos}/{f["id"]}.jpg')
    r = lector.leer(img, tipo)
    leido = r.get('valores', {}).get(campo)
    digitado = float(f[campo])
    if leido is not None and abs(leido - digitado) <= (0.05 if campo == 'co2' else 0.8):
        continue
    print(f'\n{f["code"]} {f["id"][:8]} digitado {digitado} leído {leido} · {r.get("detalle", {}).get(campo)}')
    e = 1280 / max(img.shape[:2])
    cajas = lector._cajas(cv2.resize(img, None, fx=e, fy=e) if e < 1 else img)
    for c in sorted(cajas, key=lambda c: (round(c['cy'] / 40), c['x0'])):
        if any(ch.isdigit() for ch in c['texto']):
            print(f'   {c["texto"]:<14} x={c["cx"]:5.0f} y={c["cy"]:5.0f} alto={c["alto"]:4.0f} conf={c["conf"]:.2f}')
    if copiar:
        shutil.copy(f'{fotos}/{f["id"]}.jpg', f'{copiar}/{f["code"]}_{f["id"][:8]}.jpg')
