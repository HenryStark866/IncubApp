-- =============================================================================
-- IncubApp · 14-10-2026
-- 1. Inventario de vacunas por cliente: cada producto es de un dueño (Planta, Granja
--    o un cliente: Pollo Olympico, Paulandia, Coavihuila, AVSA…). La auxiliar de
--    vacunación crea más clientes y vacunas desde la app. También código (MP…) y unidad
--    (frasco, bolsa, und…) para los insumos de planta.
-- 2. Formato «Pesaje del pollito» (chick_weight): lote, pollitos pesados y peso total.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.vaccine_products ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'Planta';
ALTER TABLE public.vaccine_products ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.vaccine_products ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'frasco';
CREATE INDEX IF NOT EXISTS vaccine_products_owner_idx ON public.vaccine_products (org_id, owner);

DO $$
DECLARE
  c record;
BEGIN
  IF to_regclass('public.quality_records') IS NULL THEN
    RETURN;
  END IF;
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.quality_records'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ 'egg_weight' AND pg_get_constraintdef(oid) !~ 'chick_weight'
  LOOP
    EXECUTE format('ALTER TABLE public.quality_records DROP CONSTRAINT %I', c.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quality_records'::regclass AND conname = 'quality_records_kind_check'
  ) THEN
    ALTER TABLE public.quality_records ADD CONSTRAINT quality_records_kind_check CHECK (kind IN (
      'egg_weight', 'moisture_loss', 'candling', 'breakout', 'chick_quality',
      'nitrogen_fridge', 'sexing_count', 'navel_quality', 'chick_weight'));
  END IF;
END $$;
