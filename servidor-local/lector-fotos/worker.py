"""Servicio del lector propio: toma las fotos nuevas de ronda y llena el formato.
Usa el mismo camino de la base que el bot de n8n (incubapp_bot.lecturas_pendientes /
guardar_lectura): nunca reemplaza lo digitado y lo dudoso queda «revisar» para el líder.
Las fotos se leen del disco del almacenamiento (montado solo lectura): no salen del servidor.
"""
import json
import os
import time
import psycopg2
from lector import leer

BASE = '/storage/stub/stub/machine-checks'
POR_VUELTA = 3
PAUSA = 60
MODELO = 'lector-propio-rapidocr-v3'


def ruta_foto(photo_path):
    d = os.path.join(BASE, photo_path)
    if os.path.isfile(d):
        return d
    if os.path.isdir(d):
        versiones = sorted((os.path.join(d, f) for f in os.listdir(d)), key=os.path.getmtime, reverse=True)
        return versiones[0] if versiones else None
    return None


def resultado(fila, lectura):
    valores = lectura.get('valores', {})
    detalle = lectura.get('detalle', {})
    dudas = [{'campo': c, 'tipo': 'lectura_dudosa', 'motivo': m} for c, m in detalle.items() if not m.startswith('ok')]
    if lectura.get('error'):
        estado, motivo = 'error', lectura['error']
    elif not valores and not dudas:
        estado, motivo = 'sin_lecturas', 'No se pudo leer ninguna lectura con certeza.'
    else:
        # 05-10-2026: nada queda para confirmar. Lo dudoso se deja en blanco (un vacío es mejor
        # que un dato falso) y se anota; el líder no tiene que revisar nada.
        estado = 'aplicada'
        motivo = ' '.join(filter(None, [
            f"Leído de la foto: {', '.join(f'{k} {v}' for k, v in valores.items())}." if valores else None,
            f"En blanco por no leerse con certeza: {', '.join(d['campo'] for d in dudas)}." if dudas else None,
        ]))
    # El número de la pantalla debe ser el de la máquina de la ronda (INC-18 → 18)
    n = lectura.get('maquina_pantalla')
    codigo = str(fila.get('machine_code') or '')
    esperado = int(codigo.split('-')[-1]) if codigo.split('-')[-1].isdigit() else None
    if n is not None and esperado is not None and n != esperado:
        dudas.append({'campo': 'maquina', 'tipo': 'otra_maquina', 'motivo': f'la pantalla dice la máquina {n} y la ronda es de {codigo}'})
        motivo = (motivo + ' ' if motivo else '') + f'Ojo: la pantalla es de la máquina {n}, no de {codigo}.'
        # Con otra máquina en pantalla no se aplica nada: un dato de otra máquina es peor que ninguno
        valores, estado = {}, 'sin_lecturas'
    return {'check_id': str(fila['check_id']), 'status': estado, 'valores': valores, 'discrepancias': dudas,
            'motivo': motivo, 'modelo': MODELO, 'lecturas': [lectura], 'etiqueta_pantalla': lectura.get('etiqueta')}


def conectar():
    return psycopg2.connect(host='supabase-db', dbname='postgres', user='bot_lecturas', password=os.environ['BOT_DB_PASSWORD'])


def vuelta(conn):
    with conn.cursor() as cur:
        cur.execute('select * from incubapp_bot.lecturas_pendientes(%s)', (POR_VUELTA,))
        cols = [c[0] for c in cur.description]
        filas = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.commit()
    for fila in filas:
        ruta = ruta_foto(fila['photo_path'])
        lectura = leer(ruta, fila['machine_type']) if ruta else {'error': 'foto no encontrada en el almacenamiento'}
        r = resultado(fila, lectura)
        with conn.cursor() as cur:
            cur.execute('select incubapp_bot.guardar_lectura(%s::jsonb)', (json.dumps(r),))
            estado = cur.fetchone()[0]
        conn.commit()
        print(fila['machine_code'], r['status'], r['valores'], estado, flush=True)
    return len(filas)


if __name__ == '__main__':
    print('Lector de fotos IncubApp iniciado (RapidOCR). Monitoreando...', flush=True)
    conn = None
    while True:
        try:
            conn = conn if conn and not conn.closed else conectar()
            n = vuelta(conn)
        except Exception as e:  # la base reinició, red, etc.: se reintenta en la próxima vuelta
            print('error:', e, flush=True)
            try:
                conn and conn.close()
            except Exception:
                pass
            conn, n = None, 0
        if n == 0:
            time.sleep(PAUSA)
