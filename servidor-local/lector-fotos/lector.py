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
import re
import cv2
from rapidocr_onnxruntime import RapidOCR

_ocr = RapidOCR()
DECIMALES = {'temp_ovoscan': 1, 'temp_air': 1, 'humidity': 1, 'co2': 2}
RANGOS = {'temp_ovoscan': (60, 110), 'temp_air': (60, 110), 'humidity': (40, 100), 'co2': (0, 2)}
CONF_MIN = 0.6


def _cajas(img):
    out, _ = _ocr(img)
    cajas = []
    for caja, texto, conf in out or []:
        xs = [p[0] for p in caja]
        ys = [p[1] for p in caja]
        cajas.append({'texto': texto, 'conf': conf, 'x0': min(xs), 'x1': max(xs), 'y0': min(ys), 'y1': max(ys),
                      'cx': sum(xs) / 4, 'cy': sum(ys) / 4, 'alto': max(ys) - min(ys)})
    return cajas


def _valor(cifras, campo):
    d = DECIMALES[campo]
    if len(cifras) <= d or len(cifras) > d + 3:
        return None
    v = int(cifras) / 10 ** d
    lo, hi = RANGOS[campo]
    return v if lo <= v <= hi else None


def _nacedora_antigua(unidos, alto_max):
    """Pantalla de nacedora antigua: arriba solo el CO2 (centro); abajo aire (izq.),
    ventilación (centro) y humedad (der.). Lectura y consigna casi del mismo tamaño:
    en cada recuadro la lectura es la línea de ARRIBA. Si no tiene esa forma, None."""
    lineas = []
    for u in sorted(unidos, key=lambda u: u['cy']):
        if lineas and abs(u['cy'] - lineas[-1][0]['cy']) < alto_max * 0.6:
            lineas[-1].append(u)
        else:
            lineas.append([u])
    if len(lineas) < 3 or len(lineas[0]) != 1:
        return None
    x_min = min(u['x0'] for u in unidos)
    ancho = max(max(u['x1'] for u in unidos) - x_min, 1)
    col = lambda u: min(2, int((u['cx'] - x_min) / ancho * 3))
    co2 = lineas[0][0]
    if col(co2) != 1:
        return None
    # La fila de abajo con 3 números (aire · ventilación · humedad).
    fila = next((l for l in lineas[2:] if len(l) >= 2), None)
    if not fila:
        return None
    valores, detalle = {}, {}
    for campo, u in [('co2', co2)] + [(('temp_air', None, 'humidity')[col(u)], u) for u in fila]:
        if not campo:
            continue
        numero = re.split(r'[°℉F%]', u['texto'])[0]
        v = _valor(re.sub(r'\D', '', numero), campo) if u['conf'] >= CONF_MIN else None
        if v is None:
            detalle[campo] = f'dudoso ({u["texto"]})'
        else:
            valores[campo] = v
            detalle[campo] = f'ok ({u["conf"]:.2f})'
    return {'valores': valores, 'detalle': detalle}


def leer(ruta_o_imagen, tipo='setter'):
    img = cv2.imread(ruta_o_imagen) if isinstance(ruta_o_imagen, str) else ruta_o_imagen
    if img is None:
        return {'error': 'no se pudo abrir la foto'}
    e = 1280 / max(img.shape[:2])
    if e < 1:
        img = cv2.resize(img, None, fx=e, fy=e)
    cajas = _cajas(img)
    valores, detalle = {}, {}

    # Volteos: «#000184».
    if tipo != 'hatcher':
        for c in cajas:
            m = re.search(r'#\s*0*(\d{1,5})\b', c['texto'].replace(' ', ''))
            if m and c['conf'] >= CONF_MIN:
                valores['turn_count'] = int(m.group(1))
                break

    # Números grandes: cajas con cifras, de altura cercana a la mayor.
    nums = [c for c in cajas if re.search(r'\d', c['texto']) and not c['texto'].strip().startswith('#')]
    if not nums:
        return {'valores': valores, 'detalle': {'pantalla': 'sin números'}}
    alto_max = max(c['alto'] for c in nums)
    grandes = [c for c in nums if c['alto'] >= alto_max * 0.62]
    # Unir pedazos del mismo número (el OCR a veces parte «97.9»).
    grandes.sort(key=lambda c: (round(c['cy'] / (alto_max * 0.6)), c['x0']))
    unidos = []
    for c in grandes:
        u = unidos[-1] if unidos else None
        # Solo se une si el pedazo anterior no trae ya su unidad (°F, %) y está pegado:
        # así el número de aire no se junta con el de humedad del mosaico vecino.
        if u and not re.search(r'[°℉F%]', u['texto']) and abs(c['cy'] - u['cy']) < alto_max * 0.5 and 0 <= c['x0'] - u['x1'] < alto_max * 0.4:
            u['texto'] += c['texto']
            u['x1'] = max(u['x1'], c['x1'])
            u['conf'] = min(u['conf'], c['conf'])
        else:
            unidos.append(dict(c))
    if tipo == 'hatcher':
        r = _nacedora_antigua(unidos, alto_max)
        if r:
            valores.update(r['valores'])
            detalle.update(r['detalle'])
            return {'valores': valores, 'detalle': detalle}
    # Dos filas por y; dentro de cada fila, columnas por x respecto al ancho de la pantalla.
    if len(unidos) < 2:
        return {'valores': valores, 'detalle': {'pantalla': 'pocos números grandes'}}
    ys = sorted(u['cy'] for u in unidos)
    corte = max(zip(ys, ys[1:]), key=lambda p: p[1] - p[0])
    medio_y = (corte[0] + corte[1]) / 2 if corte[1] - corte[0] > alto_max else None
    x_min = min(u['x0'] for u in unidos)
    x_max = max(u['x1'] for u in unidos)
    ancho = max(x_max - x_min, 1)
    posicion = {(1, 0): 'temp_ovoscan', (1, 2): 'co2', (2, 0): 'temp_air', (2, 1): 'humidity'}
    for u in unidos:
        fila = 1 if medio_y is None or u['cy'] < medio_y else 2
        col = min(2, int((u['cx'] - x_min) / ancho * 3))
        campo = posicion.get((fila, col))
        if not campo or campo in valores or (campo == 'temp_ovoscan' and tipo == 'hatcher'):
            continue
        if u['conf'] < CONF_MIN:
            detalle[campo] = f'poco claro ({u["conf"]:.2f})'
            continue
        # Solo las cifras antes de la unidad: «97.8°F» → 978 (el ° a veces sale como 0).
        numero = re.split(r'[°℉F%]', u['texto'])[0]
        v = _valor(re.sub(r'\D', '', numero), campo)
        if v is None:
            detalle[campo] = f'fuera de rango ({u["texto"]})'
            continue
        valores[campo] = v
        detalle[campo] = f'ok ({u["conf"]:.2f})'
    return {'valores': valores, 'detalle': detalle}
