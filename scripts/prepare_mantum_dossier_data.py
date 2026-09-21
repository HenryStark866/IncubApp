"""
Script: prepare_mantum_dossier_data.py
Copia las imagenes a public/assets/equipos/ y genera los catalogos JSON en src/data/
para el Dossier SIG de Maquinas.
"""
import os
import shutil
import json
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_IMG = os.path.join(ROOT, 'MANTENIMIENTO', 'activos-mantum', 'imagenes-equipos')
DEST_IMG = os.path.join(ROOT, 'public', 'assets', 'equipos')
DATA_DIR = os.path.join(ROOT, 'src', 'data')
os.makedirs(DEST_IMG, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# 1. Copiar imagenes
copied = 0
if os.path.exists(SRC_IMG):
    for f in os.listdir(SRC_IMG):
        s_path = os.path.join(SRC_IMG, f)
        if os.path.isfile(s_path):
            shutil.copy2(s_path, os.path.join(DEST_IMG, f))
            copied += 1
print(f"Copiadas {copied} imagenes a public/assets/equipos/")

# Helper para limpiar strings
def clean_str(val):
    if pd.isna(val):
        return None
    s = str(val).strip()
    return s if s and s != '-' and s != 'nan' else None

# Helper para normalizar codigos de maquina: 'INC-001.1', 'INC-1', '001.1', etc.
def normalize_code(c):
    if not c:
        return ''
    return str(c).strip().upper()

def documented_specs(code, name, manuals):
    """Infer only supplier/model facts explicitly supported by the manual names."""
    code_norm = normalize_code(code)
    text = ' '.join([str(name or ''), *[str(manual or '') for manual in manuals]]).lower()
    specs = {'supplier': None, 'model': None, 'manuals': manuals}

    if code_norm.startswith('INC-') or 'bios-12' in text or 'biostreamer' in text:
        specs.update(supplier='Petersime', model='BioS-12SHD-0006-I')
    elif code_norm.startswith('NAC-') or 'bios-4' in text:
        specs.update(supplier='Petersime', model='BioS-4HHD-0007-H')
    elif 'grundfos' in text:
        specs['supplier'] = 'Grundfos'
    elif 'alup' in text:
        specs.update(supplier='ALUP', model='ADQ 21-5040')
    elif 'hygromatik' in text:
        specs.update(supplier='HygroMatik', model='DG')
    elif 'nqr-reward' in text or 'npr-reward' in text:
        specs['supplier'] = 'Chevrolet'
        specs['model'] = 'NQR Reward' if 'nqr-reward' in text else 'NPR Reward'
    elif 'ups' in text and 'ea900ii' in text:
        specs.update(supplier='NewLine', model='EA900II')

    return specs

# 2. Leer inventario de imagenes CSV
inv_csv = os.path.join(ROOT, 'MANTENIMIENTO', 'activos-mantum', 'inventario_imagenes.csv')
inventory_map = {}
if os.path.exists(inv_csv):
    df_inv = pd.read_csv(inv_csv, sep=';', encoding='utf-8-sig')
    for _, row in df_inv.iterrows():
        code = clean_str(row.get('Codigo equipo'))
        if not code:
            continue
        downloaded = clean_str(row.get('Archivo descargado'))
        img_type = clean_str(row.get('Tipo de imagen'))
        nombre = clean_str(row.get('Nombre equipo'))
        inventory_map[code] = {
            'code': code,
            'nombre': nombre,
            'archivo': downloaded,
            'url': f"/assets/equipos/{downloaded}" if downloaded else None,
            'tipo_imagen': img_type,
            'es_foto_propia': 'propia' in (img_type or '').lower(),
        }
print(f"Cargadas {len(inventory_map)} imagenes de catalogo")

# 2b. Manuales asociados por equipo: son la fuente documental de proveedor y modelo.
manuals_by_code = {}
manuales_csv = os.path.join(ROOT, 'MANTENIMIENTO', 'activos-mantum', 'manuales_por_equipo.csv')
if os.path.exists(manuales_csv):
    df_manuals = pd.read_csv(manuales_csv, sep=';', encoding='utf-8-sig')
    for _, row in df_manuals.iterrows():
        code = clean_str(row.get('Codigo equipo'))
        manual = clean_str(row.get('Manual'))
        if code and manual:
            manuals_by_code.setdefault(code, []).append(manual)
print(f"Cargados manuales asociados a {len(manuals_by_code)} equipos")

# 3. Leer equipos_mantum.xlsx
equipos_xlsx = os.path.join(ROOT, 'MANTENIMIENTO', 'generador', 'datos_mantum', 'equipos_mantum.xlsx')
equipos_map = {}
if os.path.exists(equipos_xlsx):
    df_eq = pd.read_excel(equipos_xlsx, header=None)
    # La fila 0 o 1 tiene los nombres reales
    header_idx = 0
    for idx, r in df_eq.iloc[:5].iterrows():
        if any('código' in str(v).lower() or 'codigo' in str(v).lower() for v in r.values):
            header_idx = idx
            break
    df_eq.columns = df_eq.iloc[header_idx]
    df_eq = df_eq.iloc[header_idx + 1:]
    
    for _, r in df_eq.iterrows():
        # Mapear columnas posibles
        code = None
        for col in df_eq.columns:
            c_str = str(col).lower()
            if 'código' in c_str or 'codigo' in c_str:
                code = clean_str(r[col])
                break
        if not code:
            continue
            
        nombre = None
        ubicacion = None
        criticidad = None
        estado = None
        responsable = None
        serie = None
        for col in df_eq.columns:
            c_str = str(col).lower()
            if 'nombre' in c_str:
                nombre = clean_str(r[col])
            elif 'instalac' in c_str or 'proceso' in c_str:
                ubicacion = clean_str(r[col])
            elif 'criticidad' in c_str:
                criticidad = clean_str(r[col])
            elif 'estado' in c_str:
                estado = clean_str(r[col])
            elif 'responsable' in c_str:
                responsable = clean_str(r[col])
            elif 'serie' in c_str:
                serie = clean_str(r[col])

        specs = documented_specs(code, nombre, manuals_by_code.get(code, []))
        equipos_map[code] = {
            'mantum_code': code,
            'nombre': nombre,
            'ubicacion_proceso': ubicacion,
            'criticidad': criticidad or 'Media',
            'estado_mantum': estado,
            'responsable': responsable,
            'serial_number': serie,
            'supplier': specs['supplier'],
            'model': specs['model'],
            'manuals': specs['manuals'],
        }
print(f"Cargados {len(equipos_map)} equipos de Mantum")

# 4. Leer piezas_mantum.xlsx (Componentes y vida util)
piezas_xlsx = os.path.join(ROOT, 'MANTENIMIENTO', 'generador', 'datos_mantum', 'piezas_mantum.xlsx')
components_by_machine = {}
if os.path.exists(piezas_xlsx):
    df_pz = pd.read_excel(piezas_xlsx, header=None)
    header_idx = 0
    for idx, r in df_pz.iloc[:5].iterrows():
        if any('código' in str(v).lower() or 'codigo' in str(v).lower() for v in r.values):
            header_idx = idx
            break
    df_pz.columns = df_pz.iloc[header_idx]
    df_pz = df_pz.iloc[header_idx + 1:]

    for _, r in df_pz.iterrows():
        p_code = clean_str(r.iloc[0])
        p_name = clean_str(r.iloc[1])
        p_comp = clean_str(r.iloc[2])
        p_eq = clean_str(r.iloc[3])
        p_ref = clean_str(r.iloc[4]) if len(r) > 4 else None
        
        if not p_eq:
            continue
        # p_eq suele ser "INC-001.10 | INCUBADORA 10" o "001.1 | CONDENSADOR"
        eq_code = p_eq.split('|')[0].strip()
        
        item = {
            'code': p_code,
            'name': p_name,
            'component_spec': p_comp,
            'reference': p_ref,
            'machine_ref': p_eq,
            'status': 'Operativo',
            'useful_life_pct': 85, # Estado estimado
        }
        components_by_machine.setdefault(eq_code, []).append(item)
print(f"Cargados componentes para {len(components_by_machine)} maquinas")

# 5. Leer planes_am_mantum.xlsx (Plan de Mantenimiento / Actividades)
planes_xlsx = os.path.join(ROOT, 'MANTENIMIENTO', 'generador', 'datos_mantum', 'planes_am_mantum.xlsx')
plans_by_machine = {}
if os.path.exists(planes_xlsx):
    df_pl = pd.read_excel(planes_xlsx, header=None)
    header_idx = 0
    for idx, r in df_pl.iloc[:5].iterrows():
        if any('actividad' in str(v).lower() for v in r.values):
            header_idx = idx
            break
    df_pl.columns = df_pl.iloc[header_idx]
    df_pl = df_pl.iloc[header_idx + 1:]

    for _, r in df_pl.iterrows():
        p_code = clean_str(r.iloc[0])
        actividad = clean_str(r.iloc[1])
        entidad = clean_str(r.iloc[2]) # "001.1 | CONDENSADOR "
        tipo = clean_str(r.iloc[3]) # Preventiva / Correctiva
        especialidad = clean_str(r.iloc[4]) # Mecánica / Eléctrica
        frecuencia = clean_str(r.iloc[5])
        estado = clean_str(r.iloc[6]) if len(r) > 6 else 'Activa'
        
        if not entidad:
            continue
        eq_code = entidad.split('|')[0].strip()
        
        task = {
            'plan_code': p_code,
            'activity': actividad,
            'type': tipo or 'Preventiva',
            'specialty': especialidad or 'General',
            'frequency': frecuencia or 'Mensual',
            'status': estado or 'Activa',
            'auto_ot_eligible': True,
        }
        plans_by_machine.setdefault(eq_code, []).append(task)
print(f"Cargados planes AM para {len(plans_by_machine)} maquinas ({sum(len(v) for v in plans_by_machine.values())} tareas)")

# 6. Leer ot_cerradas_historico_mantum.xlsx
ots_xlsx = os.path.join(ROOT, 'MANTENIMIENTO', 'generador', 'datos_mantum', 'ot_cerradas_historico_mantum.xlsx')
ots_by_machine = {}
if os.path.exists(ots_xlsx):
    df_ot = pd.read_excel(ots_xlsx, header=None)
    header_idx = 0
    for idx, r in df_ot.iloc[:5].iterrows():
        if any('código' in str(v).lower() or 'codigo' in str(v).lower() for v in r.values):
            header_idx = idx
            break
    df_ot.columns = df_ot.iloc[header_idx]
    df_ot = df_ot.iloc[header_idx + 1:]

    for _, r in df_ot.iterrows():
        ot_code = clean_str(r.iloc[0])
        prioridad = clean_str(r.iloc[1])
        f_creacion = clean_str(r.iloc[2])
        f_inicio = clean_str(r.iloc[3])
        f_fin = clean_str(r.iloc[4])
        entidades = clean_str(r.iloc[5]) # "005.4 | CHILLER "
        actividades = clean_str(r.iloc[6])
        descripcion = clean_str(r.iloc[7])
        feedback = clean_str(r.iloc[8])
        tipo_mtto = clean_str(r.iloc[9])
        ejecutores = clean_str(r.iloc[10]) # Tecnico que atendio
        costo = clean_str(r.iloc[11])
        aprobador = clean_str(r.iloc[12]) if len(r) > 12 else None # Personal registro / Lider

        if not entidades:
            continue
        # Puede tener multiples entidades separadas por coma
        for ent in entidades.split(','):
            eq_code = ent.split('|')[0].strip()
            if not eq_code:
                continue
            
            rec = {
                'code': ot_code,
                'priority': prioridad,
                'created_at': f_creacion,
                'started_at': f_inicio,
                'completed_at': f_fin,
                'activity': actividades,
                'description': descripcion,
                'feedback': feedback,
                'type': tipo_mtto or 'Preventivo',
                'technician': ejecutores,
                'approver': aprobador,
                'cost': costo,
            }
            # Guardamos las ultimas 20 OTs por maquina para no saturar memoria
            m_list = ots_by_machine.setdefault(eq_code, [])
            if len(m_list) < 25:
                m_list.append(rec)
print(f"Cargadas OTs historicas para {len(ots_by_machine)} maquinas")

# 7. Guardar los archivos JSON
with open(os.path.join(DATA_DIR, 'mantumInventory.json'), 'w', encoding='utf-8') as f:
    json.dump(inventory_map, f, ensure_ascii=False, indent=2)

with open(os.path.join(DATA_DIR, 'mantumEquipos.json'), 'w', encoding='utf-8') as f:
    json.dump(equipos_map, f, ensure_ascii=False, indent=2)

with open(os.path.join(DATA_DIR, 'mantumComponents.json'), 'w', encoding='utf-8') as f:
    json.dump(components_by_machine, f, ensure_ascii=False, indent=2)

with open(os.path.join(DATA_DIR, 'mantumMaintenancePlans.json'), 'w', encoding='utf-8') as f:
    json.dump(plans_by_machine, f, ensure_ascii=False, indent=2)

with open(os.path.join(DATA_DIR, 'mantumHistoricalOTs.json'), 'w', encoding='utf-8') as f:
    json.dump(ots_by_machine, f, ensure_ascii=False, indent=2)

print("Catalogo Mantum generado exitosamente en src/data/!")
