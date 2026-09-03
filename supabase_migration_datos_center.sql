-- ══════════════════════════════════════════════════════════════════
-- Módulo "Datos" de Gerencia → pipeline automatizado de incubación
--   incubation_lots      : lote maestro creado por gerencia (código, huevos por fecha)
--   lot_arrivals         : llegada a planta registrada por recepción (cantidades por fecha)
--   classification_orders: orden de clasificación (qué lotes/fechas y orden FIFO)
--   setter_loads         : + color de cinta de la carga actual
-- Ejecutar en Supabase → SQL Editor (o vía apply_migration).
-- Aditiva e idempotente. RLS igual a egg_tape_classifications / load_maps.
-- Henry Stark · CDH Maker
-- ══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1) Lote maestro de incubación (gerencia) ──────────────────────
CREATE TABLE IF NOT EXISTS public.incubation_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  code text NOT NULL,
  origin text,
  -- Cantidades de huevo por fecha de postura: [{ productionDate, eggs }]
  postures jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_treated boolean NOT NULL DEFAULT false,
  expected_arrival_date date,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'arrived', 'classifying', 'classified', 'loaded', 'closed')),
  priority int NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incubation_lots_org_status_idx
  ON public.incubation_lots (org_id, status, expected_arrival_date);
CREATE INDEX IF NOT EXISTS incubation_lots_org_code_idx
  ON public.incubation_lots (org_id, code);

-- ── 2) Llegada del lote a planta (recepción) ──────────────────────
-- La fecha de llegada es automática (arrived_at); el operario ingresa las
-- cantidades de huevo por fecha de postura de lo que realmente llegó.
CREATE TABLE IF NOT EXISTS public.lot_arrivals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.incubation_lots (id) ON DELETE CASCADE,
  lot_code text,
  arrived_at timestamptz NOT NULL DEFAULT now(),
  -- [{ productionDate, eggs }]
  received_postures jsonb NOT NULL DEFAULT '[]'::jsonb,
  seal_number text,
  notes text,
  received_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lot_arrivals_org_idx
  ON public.lot_arrivals (org_id, arrived_at DESC);
CREATE INDEX IF NOT EXISTS lot_arrivals_lot_idx
  ON public.lot_arrivals (lot_id);

-- ── 3) Orden de clasificación (gerencia → recepción) ──────────────
CREATE TABLE IF NOT EXISTS public.classification_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'in_progress', 'done', 'cancelled')),
  -- Lista ordenada FIFO: [{ lotId, code, productionDate, eggs, trays, carts }]
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  machine_hint text,
  group_count int NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classification_orders_org_status_idx
  ON public.classification_orders (org_id, status, created_at DESC);

-- ── 4) Color de cinta en la carga actual de incubadora ────────────
ALTER TABLE public.setter_loads
  ADD COLUMN IF NOT EXISTS tape_color text,
  ADD COLUMN IF NOT EXISTS tape_color_name text;

-- ── 5) RLS ────────────────────────────────────────────────────────
ALTER TABLE public.incubation_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incubation_lots_member_all ON public.incubation_lots;
CREATE POLICY incubation_lots_member_all ON public.incubation_lots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = incubation_lots.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = incubation_lots.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );

DROP POLICY IF EXISTS lot_arrivals_member_all ON public.lot_arrivals;
CREATE POLICY lot_arrivals_member_all ON public.lot_arrivals
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = lot_arrivals.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = lot_arrivals.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );

DROP POLICY IF EXISTS classification_orders_member_all ON public.classification_orders;
CREATE POLICY classification_orders_member_all ON public.classification_orders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = classification_orders.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = classification_orders.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );

COMMENT ON TABLE public.incubation_lots IS
  'Lote maestro de incubación (gerencia): código, origen y huevos por fecha de postura.';
COMMENT ON TABLE public.lot_arrivals IS
  'Llegada del lote a planta (recepción): fecha automática + cantidades de huevo por fecha de postura.';
COMMENT ON TABLE public.classification_orders IS
  'Orden de clasificación gerencia→recepción: lotes/fechas ordenados FIFO y grupos de 12 carros.';
