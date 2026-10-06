"""Corre el OCR UNA vez por foto y guarda las cajas en JSON, para probar mejoras de la
interpretación (interpretar.py) sobre cientos de fotos reales en segundos, sin volver a
correr el OCR (que es lo lento: 3-6 s por foto en el servidor).
Uso (en el contenedor del lector):
  python cachear.py /datos/verdad.csv /storage/stub/stub/machine-checks /datos/cajas.json
El CSV necesita las columnas id, photo_path y type. Si el JSON ya existe, sigue donde quedó.
"""
import csv
import json
import os
import sys
import time

import cv2

from lector import _cajas, ruta_de_foto

lista, base, salida = sys.argv[1:4]
hechas = json.load(open(salida, encoding='utf-8')) if os.path.exists(salida) else {}
filas = [f for f in csv.DictReader(open(lista, encoding='utf-8')) if f['id'] not in hechas]
t0 = time.time()
for i, f in enumerate(filas, 1):
    ruta = ruta_de_foto(base, f['photo_path'])
    img = cv2.imread(ruta) if ruta else None
    if img is None:
        hechas[f['id']] = {'error': 'sin foto'}
        continue
    e = 1280 / max(img.shape[:2])
    if e < 1:
        img = cv2.resize(img, None, fx=e, fy=e)
    hechas[f['id']] = {'tipo': f['type'], 'alto_img': img.shape[0], 'ancho_img': img.shape[1], 'cajas': _cajas(img)}
    if i % 10 == 0 or i == len(filas):
        json.dump(hechas, open(salida + '.tmp', 'w', encoding='utf-8'))
        os.replace(salida + '.tmp', salida)
        print(f'{i}/{len(filas)} · {time.time() - t0:.0f} s', flush=True)
json.dump(hechas, open(salida, 'w', encoding='utf-8'))
print('listo', flush=True)
