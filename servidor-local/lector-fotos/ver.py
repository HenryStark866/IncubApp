"""Lectura de unas fotos puntuales (por el inicio del id). Uso: python ver.py /datos/etiquetas.csv /datos/fotos tipo id1 id2..."""
import csv
import sys
import cv2
import lector

etiquetas, fotos, tipo, *ids = sys.argv[1:]
for f in csv.DictReader(open(etiquetas, encoding='utf-8')):
    if any(f['id'].startswith(i) for i in ids) or (not ids and f['type'] == tipo):
        r = lector.leer(cv2.imread(f'{fotos}/{f["id"]}.jpg'), tipo)
        print(f['code'], f['id'][:8], r)
