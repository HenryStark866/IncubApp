#!/usr/bin/env python3
"""Separa los bloques COPY de un volcado de PostgreSQL: un archivo por tabla.
Salida (TSV): tabla, filas, archivo, columnas separadas por coma. — IncubApp."""
import os, re, sys
dump, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
pat = re.compile(r'^COPY ([\w"]+\.[\w"]+) \((.*)\) FROM stdin;$')
cur = None
with open(dump, encoding='utf-8', errors='replace') as f:
    for line in f:
        if cur is None:
            m = pat.match(line.rstrip('\n'))
            if m:
                tabla = m.group(1).replace('"', '')
                cols = ','.join(c.strip().strip('"') for c in m.group(2).split(','))
                path = os.path.join(out, tabla + '.copy')
                cur = [tabla, 0, path, cols, open(path, 'w', encoding='utf-8')]
        elif line == '\\.\n':
            cur[4].close()
            print(f'{cur[0]}\t{cur[1]}\t{cur[2]}\t{cur[3]}')
            cur = None
        else:
            cur[4].write(line)
            cur[1] += 1
