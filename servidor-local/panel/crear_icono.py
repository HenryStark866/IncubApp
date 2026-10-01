"""Genera web/icono.ico (ícono del Panel IncubApp) solo con la biblioteca estándar.

Escudo naranja de Incubant con una línea de pulso blanca sobre fondo azul marino.
Uso: python crear_icono.py   (el .ico ya generado va en el repositorio)
"""
import struct
import zlib
from pathlib import Path

NAVY = (11, 20, 40)
BORDE = (42, 62, 93)
NARANJA = (224, 116, 10)
BLANCO = (255, 255, 255)


def dentro_redondeado(x, y, r):
    """Cuadrado de 0..1 con esquinas redondeadas de radio r."""
    cx = min(max(x, r), 1 - r)
    cy = min(max(y, r), 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def dentro_escudo(x, y):
    # Escudo: rectángulo arriba (0.26..0.74, 0.18..0.52) y punta hacia abajo hasta 0.86
    if not 0.24 <= x <= 0.76 or not 0.17 <= y <= 0.86:
        return False
    if y <= 0.52:
        return True
    ancho = 0.26 * (1 - (y - 0.52) / 0.34)
    return abs(x - 0.5) <= ancho


def en_pulso(x, y, grosor):
    puntos = [(0.29, 0.50), (0.40, 0.50), (0.45, 0.36), (0.53, 0.64), (0.58, 0.47), (0.71, 0.47)]
    for (x1, y1), (x2, y2) in zip(puntos, puntos[1:]):
        dx, dy = x2 - x1, y2 - y1
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        if (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2 <= grosor ** 2:
            return True
    return False


def color(x, y, n):
    grosor = 0.055 if n <= 32 else 0.04
    if not dentro_redondeado(x, y, 0.2):
        return None
    if not dentro_redondeado((x - 0.04) / 0.92, (y - 0.04) / 0.92, 0.18):
        return BORDE
    if dentro_escudo(x, y):
        return BLANCO if en_pulso(x, y, grosor) else NARANJA
    return NAVY


def png(n):
    s = 4      # supermuestreo para bordes suaves
    filas = []
    for j in range(n):
        fila = bytearray([0])
        for i in range(n):
            acc = [0, 0, 0, 0]
            for a in range(s):
                for b in range(s):
                    c = color((i + (a + 0.5) / s) / n, (j + (b + 0.5) / s) / n, n)
                    if c:
                        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255  # noqa: E702
            k = s * s
            alfa = acc[3] // k
            if alfa:
                fila += bytes([acc[0] * 255 // acc[3], acc[1] * 255 // acc[3], acc[2] * 255 // acc[3], alfa])
            else:
                fila += b'\x00\x00\x00\x00'
        filas.append(bytes(fila))

    def trozo(tipo, datos):
        return struct.pack('>I', len(datos)) + tipo + datos + struct.pack('>I', zlib.crc32(tipo + datos) & 0xFFFFFFFF)
    return (b'\x89PNG\r\n\x1a\n' + trozo(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0))
            + trozo(b'IDAT', zlib.compress(b''.join(filas), 9)) + trozo(b'IEND', b''))


def main():
    tamanos = [16, 24, 32, 48, 64, 256]
    imagenes = [png(n) for n in tamanos]
    cab = struct.pack('<HHH', 0, 1, len(tamanos))
    desplazamiento = 6 + 16 * len(tamanos)
    entradas = b''
    for n, img in zip(tamanos, imagenes):
        entradas += struct.pack('<BBBBHHII', n % 256, n % 256, 0, 0, 1, 32, len(img), desplazamiento)
        desplazamiento += len(img)
    destino = Path(__file__).resolve().parent / 'web' / 'icono.ico'
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(cab + entradas + b''.join(imagenes))
    (destino.parent / 'icono.png').write_bytes(imagenes[-1])
    print(f'Listo: {destino}')


if __name__ == '__main__':
    main()
