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


def _nacedora(unidos, alto_max):
    """Pantallas de nacedora (dos modelos). Arriba solo el CO2; abajo tres recuadros.
      antigua: CO2 al centro → abajo aire (izq.) · ventilación · humedad (der.)
      XS4:     CO2 a la der. → abajo aire (izq.) · humedad (centro) · ventilación (der.)
    Lectura y consigna son casi del mismo tamaño: en cada recuadro la lectura es la
    de ARRIBA. Si la foto no tiene esa forma, None (se usa la lectura general)."""
    co2s = [u for u in unidos if re.match(r'^0[.,]\d\d', u['texto'].strip())]
    if not co2s:
        return None
    co2 = min(co2s, key=lambda u: u['cy'])
    abajo = [u for u in unidos if u['cy'] > co2['cy'] + co2['alto'] * 1.2 and not re.match(r'^\d+-\d', u['texto'])]
    if len(abajo) < 2:
        return None
    # Columnas por x en el ancho de la fila de abajo (el CO2 queda dentro de ese ancho).
    x_min = min(u['x0'] for u in abajo)
    ancho = max(max(u['x1'] for u in abajo) - x_min, 1)
    col = lambda u: min(2, max(0, int((u['cx'] - x_min) / ancho * 3)))
    nombres = ('temp_air', None, 'humidity') if col(co2) == 1 else ('temp_air', 'humidity', None)
    # En cada columna, el número de más arriba es la lectura (la consigna va debajo).
    fila = [min((u for u in abajo if col(u) == c), key=lambda u: u['cy'], default=None) for c in range(3)]
    fila = [u for u in fila if u]
    valores, detalle = {}, {}
    for campo, u in [('co2', co2)] + [(nombres[col(u)], u) for u in fila]:
        if not campo or campo in detalle:
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
        r = _nacedora(unidos, alto_max)
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
