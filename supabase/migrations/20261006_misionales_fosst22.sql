-- =============================================================================
-- IncubApp · Misionales: datos adicionales del formato real FOSST22
-- Autor / Author: Henry Taborda — Ing. en desarrollo de software · 06-10-2026
-- ES: Guarda en «formato» lo que pide el FOSST22 y no tenía columna: C.C., categoría,
--     turno, vencimientos de SOAT y tecnicomecánica, fechas de mantenimiento,
--     compromisos y responsable de la revisión. Idempotente.
-- EN: Stores in "formato" what FOSST22 asks for without its own column. Idempotent.
-- =============================================================================
DO $$
BEGIN
  IF to_regclass('public.mission_inspections') IS NULL THEN
    RAISE NOTICE 'Sin public.mission_inspections: nada que hacer';
    RETURN;
  END IF;
  ALTER TABLE public.mission_inspections ADD COLUMN IF NOT EXISTS formato jsonb NOT NULL DEFAULT '{}'::jsonb;
END $$;
NOTIFY pgrst, 'reload schema';
