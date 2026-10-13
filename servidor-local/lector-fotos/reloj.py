"""Reloj del ciclo y número de máquina en la pantalla Petersime (13-10-2026).

La pantalla de la incubadora muestra el tiempo que lleva el ciclo, «18d 20h 49'» (el OCR lo
lee «18d20h49'» o «00d16h51»), y arriba el encabezado «2 - 18 XS12SHDOX» o, en la zona vieja,
«22 - 5 Nacedora 5» (el OCR lo lee «-18XS12SHD0X»). Con el reloj, la app sabe cuándo empezó de
verdad cada ciclo y detecta cargues sin registrar o días que no cuadran. Python puro.
"""
import re

RE_RELOJ = re.compile(r"(\d{1,2})\s*d\s*(\d{1,2})\s*h\s*(\d{1,2})?")
RE_MAQUINA = re.compile(r"-\s*(\d{1,2})\s*(?=[A-Za-z])")
CONF_MIN = 0.6
MAX_DIAS = 23  # un ciclo de incubadora nunca pasa de ~22 días (21 + margen)


def reloj_ciclo(cajas):
    """Minutos que lleva el ciclo, o None si no se ve con certeza."""
    for c in sorted(cajas, key=lambda c: -c.get('conf', 0)):
        t = c['texto'].replace(' ', '').replace('O', '0').replace('o', '0')
        m = RE_RELOJ.search(t)
        if not m or c.get('conf', 0) < CONF_MIN:
            continue
        d, h, mi = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
        if d > MAX_DIAS or h > 23 or mi > 59:
            continue
        return d * 1440 + h * 60 + mi
    return None


def numero_maquina(cajas):
    """Número de la máquina en el encabezado («2 - 18 XS12SHDOX» → 18), o None."""
    arriba = sorted(cajas, key=lambda c: c.get('cy', 0))[:6]
    for c in arriba:
        t = c['texto'].replace(' ', '')
        if 'Remote' in t or 'Control' in t:
            continue
        m = RE_MAQUINA.search(t)
        if m and c.get('conf', 0) >= CONF_MIN:
            return int(m.group(1)), c['texto']
    return None, None


if __name__ == '__main__':
    caja = lambda t, conf=0.95, cy=600: {'texto': t, 'conf': conf, 'cy': cy}  # noqa: E731
    assert reloj_ciclo([caja('00d16h51')]) == 16 * 60 + 51
    assert reloj_ciclo([caja("18d20h49'")]) == 18 * 1440 + 20 * 60 + 49
    assert reloj_ciclo([caja("07d 14h 54'")]) == 7 * 1440 + 14 * 60 + 54
    assert reloj_ciclo([caja("60'"), caja('#000709')]) is None
    assert reloj_ciclo([caja('00d16h51', conf=0.3)]) is None
    assert reloj_ciclo([caja('45d02h10')]) is None
    assert numero_maquina([caja('OXRemoteControl-v9.10.0.28', cy=15), caja('-2BS12SHD0X', cy=58)])[0] == 2
    assert numero_maquina([caja('-18XS12SHD0X', cy=58)])[0] == 18
    assert numero_maquina([caja('22 - 5 Nacedora 5', cy=40)])[0] == 5
    print('reloj.py: pruebas OK')
