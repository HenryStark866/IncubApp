-- =============================================================================
-- IncubApp · Auxiliar de vacunación · 07-10-2026
-- 1. Inventario de vacunas: catálogo (vaccine_products) y movimientos
--    (vaccine_movements): entradas por lote del fabricante con vencimiento, consumo por
--    lote de pollito, ajustes y bajas. El saldo se calcula en la app con los movimientos.
-- 2. Formatos del auxiliar de vacunación en quality_records (mismo motor de formatos):
--    nitrogen_fridge  = PR06-1 «Control temperatura y Nitrógeno» (nevera y tanques)
--    sexing_count     = verificación de sexaje y conteo por lote
--    navel_quality    = calidad del ombligo: cicatrización n II / n III, abdomen,
--                       tarso, pico y actividad por lote
-- RLS por empresa con public.is_org_member(org_id). Idempotente.
-- =============================================================================

-- 1. Catálogo de vacunas
CREATE TABLE IF NOT EXISTS public.vaccine_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  laboratory text,
  disease text,
  route text,                                   -- in ovo, subcutánea, spray…
  doses_per_vial integer NOT NULL DEFAULT 1000 CHECK (doses_per_vial > 0),
  storage text NOT NULL DEFAULT 'nitrogen' CHECK (storage IN ('nitrogen', 'fridge', 'room')),
  min_doses integer NOT NULL DEFAULT 0 CHECK (min_doses >= 0),  -- alerta de stock bajo
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vaccine_products_org_idx ON public.vaccine_products (org_id, active);

-- 2. Movimientos (entradas, consumo, ajustes y bajas). quantity_doses siempre positivo;
--    el signo lo da el tipo (entrada suma, consumo y baja restan, ajuste con signo propio).
CREATE TABLE IF NOT EXISTS public.vaccine_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.vaccine_products (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('in', 'use', 'adjust', 'discard')),
  moved_at timestamptz NOT NULL DEFAULT now(),
  vials numeric,
  doses numeric NOT NULL CHECK (kind = 'adjust' OR doses >= 0),
  manufacturer_lot text,
  expires_on date,
  lote text,                                    -- lote de pollito vacunado (consumo)
  chicks integer CHECK (chicks IS NULL OR chicks >= 0),
  supplier text,
  reason text,                                  -- motivo de baja o ajuste
  notes text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vaccine_movements_org_idx ON public.vaccine_movements (org_id, moved_at DESC);
CREATE INDEX IF NOT EXISTS vaccine_movements_product_idx ON public.vaccine_movements (product_id, manufacturer_lot);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vaccine_products', 'vaccine_movements'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(org_id))', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id))', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (public.is_org_member(org_id) AND (created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.organization_members m WHERE m.org_id = %I.org_id AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin', 'management', 'coordinator', 'plant_veterinarian', 'vaccination_auxiliary'))))
      WITH CHECK (public.is_org_member(org_id))$p$, t || '_update', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.organization_members m WHERE m.org_id = %I.org_id AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin', 'management', 'coordinator')))$p$, t || '_delete', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- 3. Formatos del auxiliar de vacunación en quality_records
DO $$
DECLARE
  c record;
BEGIN
  IF to_regclass('public.quality_records') IS NULL THEN
    RAISE NOTICE 'Sin quality_records (falta 20261006_formatos_calidad): se omiten los formatos';
    RETURN;
  END IF;
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.quality_records'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ 'egg_weight' AND pg_get_constraintdef(oid) !~ 'navel_quality'
  LOOP
    EXECUTE format('ALTER TABLE public.quality_records DROP CONSTRAINT %I', c.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quality_records'::regclass AND conname = 'quality_records_kind_check'
  ) THEN
    ALTER TABLE public.quality_records ADD CONSTRAINT quality_records_kind_check CHECK (kind IN (
      'egg_weight', 'moisture_loss', 'candling', 'breakout', 'chick_quality',
      'nitrogen_fridge', 'sexing_count', 'navel_quality'));
  END IF;
END $$;

-- 4. Tiempo real (el inicio del auxiliar y de la líder de producción)
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['vaccine_products', 'vaccine_movements'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
