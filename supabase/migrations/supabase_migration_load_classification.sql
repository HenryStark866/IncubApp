-- ══════════════════════════════════════════════════════════════════
-- Clasificación por cinta de color + mapas de cargue Petersime
-- Ejecutar en Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Carros clasificados (uno o varios lotes por carro, color libre)
CREATE TABLE IF NOT EXISTS public.egg_tape_classifications (
  id text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'normal',
  is_treated boolean NOT NULL DEFAULT false,
  -- Lotes del carro (jsonb). Cada elemento: { lot, isTreated, colorPrimary,
  -- colorSecondary, trays, eggs, productionDate, weightKg }.
  lots jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Columnas planas del lote principal (compatibilidad y reportes SQL)
  lot text,
  color_primary text,
  color_secondary text,
  trays int NOT NULL DEFAULT 0,
  eggs int NOT NULL DEFAULT 0,
  production_date date,
  weight_kg numeric(12, 3),
  -- Color libre del CARRO (hex, p. ej. #1565c0) + nombre opcional
  cart_color text,
  cart_color_name text,
  cart_label text,
  cart_number text,
  -- Cargue de 12 al que pertenece (null = aún en cola)
  load_group int,
  notes text,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'loaded')),
  classified_at timestamptz NOT NULL DEFAULT now(),
  classified_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Migración incremental para instalaciones previas (tabla ya creada)
ALTER TABLE public.egg_tape_classifications
  ADD COLUMN IF NOT EXISTS lots jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cart_color text,
  ADD COLUMN IF NOT EXISTS cart_color_name text,
  ADD COLUMN IF NOT EXISTS cart_number text,
  ADD COLUMN IF NOT EXISTS load_group int;

ALTER TABLE public.egg_tape_classifications ALTER COLUMN lot DROP NOT NULL;

-- El kind ahora admite 'multi_lote'; se elimina el CHECK rígido anterior
ALTER TABLE public.egg_tape_classifications
  DROP CONSTRAINT IF EXISTS egg_tape_classifications_kind_check;

CREATE INDEX IF NOT EXISTS egg_tape_class_org_status_idx
  ON public.egg_tape_classifications (org_id, status, production_date);

CREATE INDEX IF NOT EXISTS egg_tape_class_org_lot_idx
  ON public.egg_tape_classifications (org_id, lot);

-- 2) Mapas de cargue (12 carros + imagen/payload)
CREATE TABLE IF NOT EXISTS public.load_maps (
  id text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  plant_id uuid,
  machine_id uuid,
  machine_name text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'pending_approval', 'approved', 'ordered', 'completed', 'rejected', 'cancelled'
    )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_path text,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ordered_at timestamptz,
  ordered_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  rejected_reason text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.load_maps
  ADD COLUMN IF NOT EXISTS loaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS loaded_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS load_maps_org_status_idx
  ON public.load_maps (org_id, status, created_at DESC);

-- 3) RLS
ALTER TABLE public.egg_tape_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS egg_tape_class_member_all ON public.egg_tape_classifications;
CREATE POLICY egg_tape_class_member_all ON public.egg_tape_classifications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = egg_tape_classifications.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = egg_tape_classifications.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );

DROP POLICY IF EXISTS load_maps_member_all ON public.load_maps;
CREATE POLICY load_maps_member_all ON public.load_maps
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = load_maps.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = load_maps.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );

COMMENT ON TABLE public.egg_tape_classifications IS
  'Clasificación de carros con cinta de color (lote, bandejas 336, fecha, pesaje, tratados).';
COMMENT ON TABLE public.load_maps IS
  'Mapas de cargue Petersime 12 carros: centro/paredes/serpentín + flujo aprobación y orden.';
