-- =============================================================================
-- IncubApp - Desbloquear lo nuevo (idempotente)
-- Proyecto: pdxlmjlooeqlvvgbosbu
--
-- 1) is_org_member + grants (authenticated SI, anon NO)
-- 2) Tablas/columnas recientes (IF NOT EXISTS)
-- 3) RLS con is_org_member (SECURITY DEFINER)
-- 4) Realtime (sin fallar si ya estan publicadas)
-- 5) Grants + recarga schema cache PostgREST
--
-- Ejecutar en: Supabase > SQL Editor > Run
-- Henry Stark - CDH Maker - 2026-07-12
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1) Membresia de organizacion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.org_id = p_org
      AND m.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM anon;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'touch_customer_last_order'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.touch_customer_last_order() FROM anon, authenticated';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Admin de plataforma
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.platform_role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO service_role;

-- ---------------------------------------------------------------------------
-- 3) GPS sede + aceptacion legal
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.plants') IS NOT NULL THEN
    ALTER TABLE public.plants
      ADD COLUMN IF NOT EXISTS geo_radius_m double precision NOT NULL DEFAULT 300;
  END IF;

  IF to_regclass('public.attendance_punches') IS NOT NULL THEN
    ALTER TABLE public.attendance_punches
      ADD COLUMN IF NOT EXISTS site_id uuid,
      ADD COLUMN IF NOT EXISTS site_name text,
      ADD COLUMN IF NOT EXISTS distance_m double precision,
      ADD COLUMN IF NOT EXISTS site_verified boolean;

    -- FK opcional (si plants existe)
    BEGIN
      ALTER TABLE public.attendance_punches
        DROP CONSTRAINT IF EXISTS attendance_punches_site_id_fkey;
      ALTER TABLE public.attendance_punches
        ADD CONSTRAINT attendance_punches_site_id_fkey
        FOREIGN KEY (site_id) REFERENCES public.plants (id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'FK attendance_punches.site_id: %', SQLERRM;
    END;

    CREATE INDEX IF NOT EXISTS attendance_punches_site_idx
      ON public.attendance_punches (site_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('terms', 'privacy')),
  doc_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, doc_type, doc_version)
);

CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx
  ON public.legal_acceptances (user_id);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_acceptances_select ON public.legal_acceptances;
CREATE POLICY legal_acceptances_select ON public.legal_acceptances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS legal_acceptances_insert ON public.legal_acceptances;
CREATE POLICY legal_acceptances_insert ON public.legal_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4) Modulo Datos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incubation_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  code text NOT NULL,
  origin text,
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

CREATE TABLE IF NOT EXISTS public.lot_arrivals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.incubation_lots (id) ON DELETE CASCADE,
  lot_code text,
  arrived_at timestamptz NOT NULL DEFAULT now(),
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

CREATE TABLE IF NOT EXISTS public.classification_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'in_progress', 'done', 'cancelled')),
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

DO $$
BEGIN
  IF to_regclass('public.setter_loads') IS NOT NULL THEN
    ALTER TABLE public.setter_loads
      ADD COLUMN IF NOT EXISTS tape_color text,
      ADD COLUMN IF NOT EXISTS tape_color_name text;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Clasificacion por cinta + mapas de cargue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.egg_tape_classifications (
  id text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'normal',
  is_treated boolean NOT NULL DEFAULT false,
  lots jsonb NOT NULL DEFAULT '[]'::jsonb,
  lot text,
  color_primary text,
  color_secondary text,
  trays int NOT NULL DEFAULT 0,
  eggs int NOT NULL DEFAULT 0,
  production_date date,
  weight_kg numeric(12, 3),
  cart_color text,
  cart_color_name text,
  cart_label text,
  cart_number text,
  load_group int,
  notes text,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'loaded')),
  classified_at timestamptz NOT NULL DEFAULT now(),
  classified_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.egg_tape_classifications
  ADD COLUMN IF NOT EXISTS lots jsonb,
  ADD COLUMN IF NOT EXISTS cart_color text,
  ADD COLUMN IF NOT EXISTS cart_color_name text,
  ADD COLUMN IF NOT EXISTS cart_number text,
  ADD COLUMN IF NOT EXISTS load_group int;

UPDATE public.egg_tape_classifications
SET lots = '[]'::jsonb
WHERE lots IS NULL;

ALTER TABLE public.egg_tape_classifications
  ALTER COLUMN lots SET DEFAULT '[]'::jsonb;

ALTER TABLE public.egg_tape_classifications
  ALTER COLUMN lots SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.egg_tape_classifications ALTER COLUMN lot DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE public.egg_tape_classifications
  DROP CONSTRAINT IF EXISTS egg_tape_classifications_kind_check;

CREATE INDEX IF NOT EXISTS egg_tape_class_org_status_idx
  ON public.egg_tape_classifications (org_id, status, production_date);
CREATE INDEX IF NOT EXISTS egg_tape_class_org_lot_idx
  ON public.egg_tape_classifications (org_id, lot);

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

CREATE INDEX IF NOT EXISTS load_maps_org_status_idx
  ON public.load_maps (org_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 6) Cumplimiento / bonos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.performance_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  labor_key text NOT NULL,
  label text,
  expected numeric NOT NULL DEFAULT 0,
  unit text DEFAULT '',
  role text,
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  shift_code text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS performance_targets_org_idx
  ON public.performance_targets (org_id, active);

CREATE TABLE IF NOT EXISTS public.round_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  shift_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Bogota')::date),
  shift_code text DEFAULT 'T1',
  title text NOT NULL,
  body text,
  plant_id uuid,
  room_id uuid,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS round_reports_org_user_day_idx
  ON public.round_reports (org_id, user_id, shift_date);

CREATE TABLE IF NOT EXISTS public.labor_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  labor_key text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  success boolean NOT NULL DEFAULT true,
  note text,
  shift_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Bogota')::date),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS labor_completions_org_user_day_idx
  ON public.labor_completions (org_id, user_id, shift_date);

CREATE TABLE IF NOT EXISTS public.user_usage_streaks (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  first_active_date date NOT NULL,
  last_active_date date NOT NULL,
  continuous_days int NOT NULL DEFAULT 1,
  total_active_days int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 7) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.incubation_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.egg_tape_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_usage_streaks ENABLE ROW LEVEL SECURITY;

-- Politicas explicitas (sin unnest paralelo)

DROP POLICY IF EXISTS incubation_lots_member_all ON public.incubation_lots;
CREATE POLICY incubation_lots_member_all ON public.incubation_lots
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_member(org_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS lot_arrivals_member_all ON public.lot_arrivals;
CREATE POLICY lot_arrivals_member_all ON public.lot_arrivals
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_member(org_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS classification_orders_member_all ON public.classification_orders;
CREATE POLICY classification_orders_member_all ON public.classification_orders
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_member(org_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS egg_tape_class_member_all ON public.egg_tape_classifications;
CREATE POLICY egg_tape_class_member_all ON public.egg_tape_classifications
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_member(org_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS load_maps_member_all ON public.load_maps;
CREATE POLICY load_maps_member_all ON public.load_maps
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_member(org_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS perf_targets_all ON public.performance_targets;
CREATE POLICY perf_targets_all ON public.performance_targets
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_member(org_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS round_reports_all ON public.round_reports;
CREATE POLICY round_reports_all ON public.round_reports
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_admin())
  WITH CHECK (
    user_id = auth.uid()
    AND (public.is_org_member(org_id) OR public.is_platform_admin())
  );

DROP POLICY IF EXISTS labor_completions_all ON public.labor_completions;
CREATE POLICY labor_completions_all ON public.labor_completions
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_admin())
  WITH CHECK (
    user_id = auth.uid()
    AND (public.is_org_member(org_id) OR public.is_platform_admin())
  );

DROP POLICY IF EXISTS usage_streaks_all ON public.user_usage_streaks;
CREATE POLICY usage_streaks_all ON public.user_usage_streaks
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_admin())
  WITH CHECK (
    user_id = auth.uid()
    AND (public.is_org_member(org_id) OR public.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- 8) Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.incubation_lots,
  public.lot_arrivals,
  public.classification_orders,
  public.egg_tape_classifications,
  public.load_maps,
  public.performance_targets,
  public.round_reports,
  public.labor_completions,
  public.user_usage_streaks,
  public.legal_acceptances
TO authenticated;

GRANT ALL ON
  public.incubation_lots,
  public.lot_arrivals,
  public.classification_orders,
  public.egg_tape_classifications,
  public.load_maps,
  public.performance_targets,
  public.round_reports,
  public.labor_completions,
  public.user_usage_streaks,
  public.legal_acceptances
TO service_role;

-- ---------------------------------------------------------------------------
-- 9) Realtime
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.ensure_realtime(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RAISE NOTICE 'ensure_realtime: tabla public.% no existe', p_table;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = p_table
  ) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
    p_table
  );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN OTHERS THEN
    RAISE NOTICE 'ensure_realtime %: %', p_table, SQLERRM;
END;
$$;

SELECT private.ensure_realtime('incubation_lots');
SELECT private.ensure_realtime('lot_arrivals');
SELECT private.ensure_realtime('classification_orders');
SELECT private.ensure_realtime('egg_tape_classifications');
SELECT private.ensure_realtime('load_maps');
SELECT private.ensure_realtime('organizations');
SELECT private.ensure_realtime('performance_targets');
SELECT private.ensure_realtime('round_reports');
SELECT private.ensure_realtime('labor_completions');
SELECT private.ensure_realtime('user_usage_streaks');
SELECT private.ensure_realtime('attendance_punches');
SELECT private.ensure_realtime('silo_dispatches');
SELECT private.ensure_realtime('legal_acceptances');

-- Triggers updated_at (solo si existe private.set_updated_at)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_incubation_lots_updated_at ON public.incubation_lots;
    CREATE TRIGGER trg_incubation_lots_updated_at
      BEFORE UPDATE ON public.incubation_lots
      FOR EACH ROW
      EXECUTE PROCEDURE private.set_updated_at();

    DROP TRIGGER IF EXISTS trg_classification_orders_updated_at ON public.classification_orders;
    CREATE TRIGGER trg_classification_orders_updated_at
      BEFORE UPDATE ON public.classification_orders
      FOR EACH ROW
      EXECUTE PROCEDURE private.set_updated_at();
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- PG15+ usa EXECUTE FUNCTION; reintentar
    BEGIN
      DROP TRIGGER IF EXISTS trg_incubation_lots_updated_at ON public.incubation_lots;
      EXECUTE $t$
        CREATE TRIGGER trg_incubation_lots_updated_at
          BEFORE UPDATE ON public.incubation_lots
          FOR EACH ROW
          EXECUTE FUNCTION private.set_updated_at()
      $t$;
      DROP TRIGGER IF EXISTS trg_classification_orders_updated_at ON public.classification_orders;
      EXECUTE $t$
        CREATE TRIGGER trg_classification_orders_updated_at
          BEFORE UPDATE ON public.classification_orders
          FOR EACH ROW
          EXECUTE FUNCTION private.set_updated_at()
      $t$;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'triggers updated_at: %', SQLERRM;
    END;
END $$;

-- ---------------------------------------------------------------------------
-- 10) Recargar PostgREST
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- ---------------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_can_select,
  EXISTS (
    SELECT 1
    FROM pg_publication_tables pt
    WHERE pt.pubname = 'supabase_realtime'
      AND pt.schemaname = 'public'
      AND pt.tablename = c.relname
  ) AS in_realtime
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'incubation_lots',
    'lot_arrivals',
    'classification_orders',
    'egg_tape_classifications',
    'load_maps',
    'performance_targets',
    'round_reports',
    'labor_completions',
    'user_usage_streaks',
    'legal_acceptances'
  )
ORDER BY 1;
