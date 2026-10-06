"""Muestra, para un campo, las fotos donde la versión 2 no coincide con la verdad: verdad,
versión actual, versión 2 y las cajas del OCR. Uso: python depurar.py verdad.csv cajas.json campo"""
import csv, json, sys
import interpretar as i
verdad = {f['id']: f for f in csv.DictReader(open(sys.argv[1], encoding='utf-8'))}
cajas = json.load(open(sys.argv[2], encoding='utf-8'))
campo = sys.argv[3]
for id_, k in cajas.items():
    f = verdad.get(id_)
    if not f or f['fuente'] == 'revisar' or not f.get(campo) or 'cajas' not in k:
        continue
    v2 = i.interpretar2(k['cajas'], f['type'])
    real = float(f[campo])
    got = v2['valores'].get(campo)
    if got is not None and abs(got - real) <= (10 if campo == 'turn_count' else 0.05):
        continue
    v1 = i.interpretar(k['cajas'], f['type'])
    print(f"\n{f['code']} {f['type']} {id_[:8]} · verdad {campo}={real} · v1={v1['valores'].get(campo)} · v2={got} ({v2['detalle'].get(campo)})")
    print('   v2:', v2['valores'])
    for c in sorted(k['cajas'], key=lambda c: c['cy']):
        if any(ch.isdigit() for ch in c['texto']) or '-' in c['texto']:
            print(f"   {c['texto']!r:18} cx={c['cx']:5.0f} cy={c['cy']:5.0f} alto={c['alto']:3.0f} conf={c['conf']:.2f}")
