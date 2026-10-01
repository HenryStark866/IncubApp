"""Qué fotos no muestran los mosaicos de color (solo detección, sin OCR: es rápido)."""
import csv, sys, shutil
import cv2
from lector import COLORES, _mosaico

filas = list(csv.DictReader(open(sys.argv[1], encoding='utf-8')))
malas = []
for f in filas:
    img = cv2.imread(f'{sys.argv[2]}/{f["id"]}.jpg')
    h0, w0 = img.shape[:2]
    e = 1280 / max(h0, w0)
    if e < 1:
        img = cv2.resize(img, None, fx=e, fy=e)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    area = img.shape[0] * img.shape[1] * 0.012
    if not _mosaico(hsv, COLORES['temp_air'], area):
        malas.append(f['id'])
        m = cv2.inRange(hsv, (0, 80, 80), (179, 255, 255))
        print(f['code'], f['id'][:8], f'{w0}x{h0}', 'saturados %.1f%%' % (100 * (m > 0).mean()))
print(len(malas), 'sin mosaico rojo')
for i, x in enumerate(malas[:3]):
    shutil.copy(f'{sys.argv[2]}/{x}.jpg', f'/salida/ocr_falla{i + 1}.jpg')
