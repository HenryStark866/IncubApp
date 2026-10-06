"""
Lector propio de pantallas Petersime (IncubApp) — gratis y sin salir de la empresa.

Una sola lectura OCR de toda la foto (RapidOCR: modelos PaddleOCR en ONNX, CPU) y
los datos se ubican por posición, no por color (con luz de día y reflejos los
colores salen lavados). La pantalla siempre tiene dos filas de tres mosaicos:
  fila 1: ovoscan (izq.) · vacío (centro) · CO2 (der.)
  fila 2: aire (izq.) · humedad (centro) · ventilación (der., no se usa)
En cada mosaico el número GRANDE es la lectura y el pequeño de abajo la consigna.
El contador de volteos es «#000184». Solo se devuelve lo que se lee con claridad.
"""
import os
import re
import cv2
from rapidocr_onnxruntime import RapidOCR

from interpretar import interpretar3

_ocr = RapidOCR()


def _cajas(img):
    out, _ = _ocr(img)
    cajas = []
    for caja, texto, conf in out or []:
        xs = [p[0] for p in caja]
        ys = [p[1] for p in caja]
        xs = [float(x) for x in xs]
        ys = [float(y) for y in ys]
        cajas.append({'texto': texto, 'conf': float(conf), 'x0': min(xs), 'x1': max(xs), 'y0': min(ys), 'y1': max(ys),
                      'cx': sum(xs) / 4, 'cy': sum(ys) / 4, 'alto': max(ys) - min(ys)})
    return cajas


def ruta_de_foto(base, photo_path):
    """Ruta del archivo en el almacenamiento: Storage guarda cada objeto como carpeta con
    sus versiones adentro; se toma la más nueva."""
    d = os.path.join(base, photo_path)
    if os.path.isfile(d):
        return d
    if os.path.isdir(d):
        versiones = sorted((os.path.join(d, f) for f in os.listdir(d)), key=os.path.getmtime, reverse=True)
        return versiones[0] if versiones else None
    return None


def leer(ruta_o_imagen, tipo='setter'):
    """OCR de la foto (lo lento) + interpretación por formato y estructura (interpretar2).
    05-10-2026: la versión por columnas fijas corría los números de campo cuando un mosaico
    mostraba «---» o la foto salía torcida; se reemplazó tras medirla con 514 fotos reales."""
    img = cv2.imread(ruta_o_imagen) if isinstance(ruta_o_imagen, str) else ruta_o_imagen
    if img is None:
        return {'error': 'no se pudo abrir la foto'}
    e = 1280 / max(img.shape[:2])
    if e < 1:
        img = cv2.resize(img, None, fx=e, fy=e)
    return interpretar3(_cajas(img), tipo)
