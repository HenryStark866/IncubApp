"""Interpretación de lo que el OCR leyó en la foto de una pantalla Petersime.

Python puro (sin OCR ni OpenCV): recibe las cajas de texto del OCR y devuelve los valores.
Así se prueba sobre cientos de fotos ya leídas (cajas.json) en segundos.
"""
import re

DECIMALES = {'temp_ovoscan': 1, 'temp_air': 1, 'humidity': 1, 'co2': 2}
RANGOS = {'temp_ovoscan': (60, 110), 'temp_air': (60, 110), 'humidity': (40, 100), 'co2': (0, 2)}
CONF_MIN = 0.6


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
    x_min = min(u['x0'] for u in abajo)
    ancho = max(max(u['x1'] for u in abajo) - x_min, 1)
    col = lambda u: min(2, max(0, int((u['cx'] - x_min) / ancho * 3)))  # noqa: E731
    nombres = ('temp_air', None, 'humidity') if col(co2) == 1 else ('temp_air', 'humidity', None)
    con_decimal = [u for u in abajo if re.search(r'\d[.,]\d', u['texto'])]
    fila = [min((u for u in con_decimal if col(u) == c), key=lambda u: u['cy'], default=None) for c in range(3)]
    fila = [u for u in fila if u]
    valores, detalle = {}, {}
    for campo, u in [('co2', co2)] + [(nombres[col(u)], u) for u in fila]:
        if not campo or campo in detalle:
            continue
        m = re.search(r'(\d{1,3})[.,](\d{%d})' % DECIMALES[campo], u['texto'])
        v = _valor(m.group(1) + m.group(2), campo) if m and u['conf'] >= CONF_MIN else None
        if v is None:
            detalle[campo] = f'dudoso ({u["texto"]})'
        else:
            valores[campo] = v
            detalle[campo] = f'ok ({u["conf"]:.2f})'
    return {'valores': valores, 'detalle': detalle}


def interpretar(cajas, tipo='setter'):
    cajas = [dict(c) for c in cajas]
    valores, detalle = {}, {}
    if tipo != 'hatcher':
        for c in cajas:
            m = re.search(r'#\s*0*(\d{1,5})\b', c['texto'].replace(' ', ''))
            if m and c['conf'] >= CONF_MIN:
                valores['turn_count'] = int(m.group(1))
                break
    nums = [c for c in cajas if re.search(r'\d', c['texto']) and not c['texto'].strip().startswith('#')]
    if not nums:
        return {'valores': valores, 'detalle': {'pantalla': 'sin números'}}
    alto_max = max(c['alto'] for c in nums)
    grandes = [c for c in nums if c['alto'] >= alto_max * 0.62]
    grandes.sort(key=lambda c: (round(c['cy'] / (alto_max * 0.6)), c['x0']))
    unidos = []
    for c in grandes:
        u = unidos[-1] if unidos else None
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
        numero = re.split(r'[°℉F%]', u['texto'])[0]
        v = _valor(re.sub(r'\D', '', numero), campo)
        if v is None:
            detalle[campo] = f'fuera de rango ({u["texto"]})'
            continue
        valores[campo] = v
        detalle[campo] = f'ok ({u["conf"]:.2f})'
    return {'valores': valores, 'detalle': detalle}


# ── Versión 2 (05-10-2026): por FORMATO y estructura de la pantalla, no por columnas fijas ──
# Las columnas fijas fallaban cuando faltaba un mosaico o la foto salía torcida: la escala
# «0 - 100», la consigna 87.0 o el CO2 caían en el campo equivocado y quedaban «dudosos».
RE_RANGO = re.compile(r'\d\s*[-–]\s*\d')
RE_HORA = re.compile(r"\d+\s*[dh']|\d{2}\s+\d{2}\s+\d{2}")
RE_DECIMAL = re.compile(r'(\d+)\s*[.,]\s*(\d+)')
RE_SIN_DATO = re.compile(r'^[-–—_.\s]{2,}$')


def _numero(texto):
    """'100.0°F' → (100.0, 'temp'); '0.32%' → (0.32, 'co2'); '0100.0F' → (100.0, 'temp');
    '98.530' (° leído como 30) → (98.5, 'temp'). None si no es una lectura con decimal."""
    t = texto.replace('O', '0').replace('o', '0')
    if RE_RANGO.search(t) or RE_HORA.search(t) or t.strip().startswith('#'):
        return None
    m = RE_DECIMAL.search(t)
    if not m:
        return None
    entero, dec = m.group(1), m.group(2)
    entero = entero.lstrip('0') or '0'          # ícono o borde leído como 0: «0100.0»
    if len(entero) > 3:
        return None
    if int(entero) <= 2 and len(dec) >= 2:      # CO2: 0.32, 1.66
        return round(int(entero) + int(dec[:2]) / 100, 2), 'co2'
    v = round(int(entero) + int(dec[0]) / 10, 1)
    if 40 <= v <= 110:
        return v, 'temp'
    return None


def _une_pedazos(cajas):
    """El OCR a veces parte «97.9» en «97» y «.9»: se unen los pedazos pegados de la misma línea."""
    cajas = sorted((dict(c) for c in cajas), key=lambda c: (c['cy'], c['x0']))
    out = []
    for c in sorted(cajas, key=lambda c: c['x0']):
        par = next((u for u in out if abs(c['cy'] - u['cy']) < max(u['alto'], c['alto']) * 0.5
                    and 0 <= c['x0'] - u['x1'] < max(u['alto'], c['alto']) * 0.45
                    and not re.search(r'[°℉F%]', u['texto'])), None)
        if par and (re.match(r'^[.,]?\d', c['texto'].strip()) or re.search(r'[.,]$', par['texto'].strip())):
            par['texto'] += c['texto']
            par['x1'] = max(par['x1'], c['x1'])
            par['conf'] = min(par['conf'], c['conf'])
        else:
            out.append(c)
    return out


def interpretar2(cajas, tipo='setter'):
    valores, detalle = {}, {}
    if tipo != 'hatcher':
        for c in cajas:
            m = re.search(r'#\s*0*(\d{1,5})\b', c['texto'].replace(' ', ''))
            if m and c['conf'] >= CONF_MIN:
                valores['turn_count'] = int(m.group(1))
                detalle['turn_count'] = f'ok ({c["conf"]:.2f})'
                break
    piezas = _une_pedazos(cajas)
    cand = []
    for c in piezas:
        n = _numero(c['texto'])
        # Temperatura y humedad salen en °F: un «54.5%» es de la barra de estado de arriba.
        if n and not (n[1] == 'temp' and '%' in c['texto'] and not re.search(r'[°℉F]', c['texto'])):
            cand.append({**c, 'v': n[0], 'clase': n[1]})
    # Lecturas = números GRANDES. La barra de estado y las consignas de las pantallas XS12 van
    # en letra más chica: se descartan por tamaño (así una consigna bajo un «---» que el OCR no
    # vio no pasa por lectura).
    if cand:
        alto_max = max(c['alto'] for c in cand)
        cand = [c for c in cand if c['alto'] >= alto_max * 0.66]
    vacios = [c for c in piezas if RE_SIN_DATO.match(c['texto'].strip())]   # «---»: sensor sin dato
    if not cand:
        return {'valores': valores, 'detalle': detalle or {'pantalla': 'sin lecturas'}}

    # Lecturas y consignas: la consigna va justo DEBAJO de su lectura (o de un «---»), en la
    # misma columna. Se recorre de arriba abajo.
    cand.sort(key=lambda c: c['cy'])
    lecturas = []
    consignas = []
    for c in cand:
        def encima(a):
            # Misma columna y PEGADA debajo (el borde de arriba de c cerca del borde de abajo de
            # a): la fila siguiente de mosaicos queda más lejos que la consigna.
            ancho = max(a['x1'] - a['x0'], c['x1'] - c['x0'])
            hueco = c['y0'] - a['y1']
            return abs(a['cx'] - c['cx']) < ancho * 0.9 and -0.3 * a['alto'] <= hueco < 0.9 * a['alto']
        if any(encima(a) for a in lecturas) or any(encima(a) for a in vacios):
            consignas.append(c)
            continue
        lecturas.append(c)

    co2 = [c for c in lecturas if c['clase'] == 'co2']
    temps = [c for c in lecturas if c['clase'] == 'temp']
    if co2:
        u = min(co2, key=lambda c: c['cy'])
        if u['conf'] >= CONF_MIN and RANGOS['co2'][0] <= u['v'] <= RANGOS['co2'][1]:
            valores['co2'] = u['v']
            detalle['co2'] = f'ok ({u["conf"]:.2f})'
        else:
            detalle['co2'] = f'dudoso ({u["texto"]})'
    if temps:
        # Dos filas: la de arriba (ovoscan, solo incubadoras) y la de abajo (aire, humedad).
        alto = sorted(c['alto'] for c in temps)[len(temps) // 2]
        filas = []
        for c in sorted(temps, key=lambda c: c['cy']):
            if filas and c['cy'] - filas[-1][-1]['cy'] < alto * 1.1:
                filas[-1].append(c)
            else:
                filas.append([c])
        ref_y = min(co2, key=lambda c: c['cy'])['cy'] if co2 else None
        if len(filas) >= 2:
            arriba, abajo = filas[0], filas[1]
        elif ref_y is not None and abs(filas[0][0]['cy'] - ref_y) < alto * 1.1:
            arriba, abajo = filas[0], []
        else:
            arriba, abajo = [], filas[0]
        nombres = []
        if tipo != 'hatcher' and arriba:
            ovo = min(arriba, key=lambda c: c['cx'])
            # Si el ovoscan muestra «---» y el OCR no lo vio, su consigna queda sola en la fila de
            # arriba: está a la altura de la consigna del CO2, no de su lectura. Esa no se toma.
            c_co2 = min((k for k in consignas if k['clase'] == 'co2'), key=lambda k: k['cy'], default=None)
            r_co2 = min(co2, key=lambda k: k['cy']) if co2 else None
            if not (c_co2 and r_co2 and abs(ovo['cy'] - c_co2['cy']) < abs(ovo['cy'] - r_co2['cy'])):
                nombres.append(('temp_ovoscan', ovo))
        abajo = sorted(abajo, key=lambda c: c['cx'])
        for campo, c in zip(('temp_air', 'humidity'), abajo):
            nombres.append((campo, c))
        for campo, c in nombres:
            lo, hi = RANGOS[campo]
            if c['conf'] < CONF_MIN:
                detalle[campo] = f'poco claro ({c["conf"]:.2f})'
            elif not lo <= c['v'] <= hi:
                detalle[campo] = f'fuera de rango ({c["texto"]})'
            else:
                valores[campo] = c['v']
                detalle[campo] = f'ok ({c["conf"]:.2f})'
    return {'valores': valores, 'detalle': detalle}


# ── Versión 3 (06-10-2026): combinación medida con 514 fotos reales ──────────────────────
# La v1 (columnas) acierta casi todo lo que lee; la v2 (formato) llena lo que la v1 deja en
# blanco y detecta el «número corrido» (pantalla con «---» en el ovoscan: la v1 subía el aire
# al ovoscan). Regla: manda la v1; la v2 solo completa campos vacíos y, si la v1 puso en el
# ovoscan justo el valor que la v2 lee como aire y la v2 no ve ovoscan, se corrige.
def _arreglar_cero(texto_valores):
    return texto_valores


def interpretar3(cajas, tipo='setter'):
    r1 = interpretar(cajas, tipo)
    r2 = interpretar2(cajas, tipo)
    v1, v2 = dict(r1.get('valores', {})), r2.get('valores', {})
    d = dict(r1.get('detalle', {}))
    if 'temp_ovoscan' in v1 and 'temp_ovoscan' not in v2 and v2.get('temp_air') == v1['temp_ovoscan']:
        del v1['temp_ovoscan']
        d['temp_ovoscan'] = 'sin dato en pantalla («---»)'
        for campo in ('temp_air', 'humidity'):
            if campo in v2:
                v1[campo] = v2[campo]
                d[campo] = r2['detalle'].get(campo, 'ok')
    for campo, valor in v2.items():
        if campo not in v1:
            v1[campo] = valor
            d[campo] = r2['detalle'].get(campo, 'ok') + ' · v2'
    for campo in list(d):
        if campo in v1 and not str(d[campo]).startswith(('ok', 'sin dato')):
            d[campo] = 'ok · v2'
    return {'valores': v1, 'detalle': d}
