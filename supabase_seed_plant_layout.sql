-- =============================================================================
-- SEED: Plano base de la planta incubadora con medidas reales
-- Uso: Ejecutar en Supabase → SQL Editor
-- ANTES de ejecutar, reemplaza los UUIDs de plant_id y org_id:
--
--   SELECT id FROM plants LIMIT 10;         ← para obtener el plant_id correcto
--   SELECT id FROM organizations LIMIT 10;  ← para obtener el org_id correcto
--
-- Medidas en metros (grosor de muros 5 cm omitido a escala del plano).
-- Largo total exterior: 91.5 m
-- Ancho zona limpia:    21.5 m
-- Ancho bloque admin:    8.0 m
-- Corredores internos:   1.7 m cada uno (hay 2)
-- =============================================================================

DO $$
DECLARE
  v_plant_id UUID := 'REEMPLAZA-CON-TU-PLANT-ID';   -- ← editar
  v_org_id   UUID := 'REEMPLAZA-CON-TU-ORG-ID';     -- ← editar
BEGIN

  -- Verificación rápida
  IF NOT EXISTS (SELECT 1 FROM plants WHERE id = v_plant_id) THEN
    RAISE EXCEPTION 'plant_id % no existe', v_plant_id;
  END IF;

  -- ── Cuarto de Vacunas ─────────────────────────────────────────────────────
  -- 6.5 m total dividido en: sección A (2 m) + sección B (4.5 m), ancho 2.5 m
  INSERT INTO rooms (plant_id, org_id, code, name, type, pos_x, pos_y, width, height)
  VALUES
    (v_plant_id, v_org_id, 'VAC-A',     'Cuarto de Vacunas A',             'technical',        0,    0,    2.5,  2  ),
    (v_plant_id, v_org_id, 'VAC-B',     'Cuarto de Vacunas B',             'technical',        0,    2,    2.5,  4.5);

  -- ── Sexaje ────────────────────────────────────────────────────────────────
  -- Lado angosto 2.5 m · Largo 11 m (continúa franja izquierda desde Y=6.5)
  INSERT INTO rooms (plant_id, org_id, code, name, type, pos_x, pos_y, width, height)
  VALUES
    (v_plant_id, v_org_id, 'SEX',       'Sexaje',                          'chick_processing', 0,    6.5,  2.5,  11 );

  -- ── Corredor zona limpia 1 (X=2.5, ancho 1.7 m) ─────────────────────────
  INSERT INTO rooms (plant_id, org_id, code, name, type, pos_x, pos_y, width, height)
  VALUES
    (v_plant_id, v_org_id, 'COR-L1',   'Corredor Zona Limpia 1',          'hallway',          2.5,  0,    1.7,  50 );

  -- ── Sala de Transferencia (11 m × 4 m) ───────────────────────────────────
  -- Incluye almacén de la máquina (2.5 m × 4 m) adosado al fondo
  INSERT INTO rooms (plant_id, org_id, code, name, type, pos_x, pos_y, width, height)
  VALUES
    (v_plant_id, v_org_id, 'TRANS',     'Sala de Transferencia',           'chick_processing', 4.2,  0,    11,   4  ),
    (v_plant_id, v_org_id, 'ALM-TRANS', 'Almacén Máquina Transferencia',  'technical',        4.2,  4,    4,    2.5);

  -- ── Nacedoras (11 m × 5.5 m) ─────────────────────────────────────────────
  INSERT INTO rooms (plant_id, org_id, code, name, type, pos_x, pos_y, width, height)
  VALUES
    (v_plant_id, v_org_id, 'NAC',       'Nacedoras',                       'hatching',         4.2,  6.5,  11,   5.5);

  -- ── Vacunación (11 m × 5.5 m) ────────────────────────────────────────────
  INSERT INTO rooms (plant_id, org_id, code, name, type, pos_x, pos_y, width, height)
  VALUES
    (v_plant_id, v_org_id, 'VAC-OP',   'Vacunación',                      'chick_processing', 4.2,  12,   11,   5.5);

  -- ── Almacén de Cajas (7.5 m × 3.5 m) ────────────────────────────────────
  INSERT INTO rooms (plant_id, org_id, code, name, type, pos_x, pos_y, width, height)
  VALUES
    (v_plant_id, v_org_id, 'ALM-CAJ',  'Almacén de Cajas',                'egg_storage',      4.2,  17.5, 7.5,  3.5);

  -- ── Sala de despacho / almacén pollito (13.5 m × 6 m) ───────────────────
  INSERT INTO rooms (plant_id, org_id, code, name, type, pos_x, pos_y, width, height)
  VALUES
    (v_plant_id, v_org_id, 'DESP-ALM', 'Sala Despacho / Almacén Pollito','chick_processing',  4.2,  21,   13.5, 6  );

  -- ── Despacho Pollito (4 m × 3.5 m) ──────────────────────────────────────
  INSERT INTO rooms (plant_id, org_id, code, name, type, pos_x, pos_y, width, height)
  VALUES
    (v_plant_id, v_org_id, 'DESP-P',   'Despacho Pollito',                'chick_processing', 4.2,  27,   4,    3.5);

  -- ── Corredor zona limpia 2 (X=15.2, ancho 1.7 m) ────────────────────────
  INSERT INTO rooms (plant_id, org_id, code, name, type, pos_x, pos_y, width, height)
  VALUES
    (v_plant_id, v_org_id, 'COR-L2',   'Corredor Zona Limpia 2',          'hallway',          15.2, 0,    1.7,  50 );

  -- ── Bloque administración / zona sucia (X=21.5, ancho 8 m) ──────────────
  INSERT INTO rooms (plant_id, org_id, code, name, type, pos_x, pos_y, width, height)
  VALUES
    (v_plant_id, v_org_id, 'OFI',       'Oficina',                        'office',           21.5, 0,    8,    4  ),
    (v_plant_id, v_org_id, 'SAL-TEC1', 'Sala Técnica 1',                  'technical',        21.5, 4,    8,    15 ),
    (v_plant_id, v_org_id, 'SAL-TEC2', 'Sala Técnica 2',                  'technical',        21.5, 19,   8,    11 );

  RAISE NOTICE 'Plano base importado: 16 salas creadas para plant_id=%', v_plant_id;
END $$;
