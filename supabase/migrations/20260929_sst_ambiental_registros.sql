-- IncubApp: registros de SST (incidentes e inspecciones) y de gestión ambiental
-- (residuos, lecturas de medidores y obligaciones). Los muestra el inicio de sus líderes.
-- Fotos y actas van al bucket privado «machine-checks» bajo {org_id}/sst-incidentes/…,
-- {org_id}/sst-inspecciones/…, {org_id}/ambiental-residuos/… y {org_id}/ambiental-obligaciones/…;
-- aquí solo se guardan las rutas. RLS por empresa con public.is_org_member(org_id).
-- Idempotente: se puede correr varias veces.

-- ─── SST: incidentes, accidentes, casi accidentes y condiciones inseguras ───
CREATE TABLE IF NOT EXISTS public.sst_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  site text,
  area text,
  kind text NOT NULL DEFAULT 'incident'
    CHECK (kind IN ('accident', 'incident', 'near_miss', 'unsafe_condition')),
  affected_person text,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  has_disability boolean NOT NULL DEFAULT false,
  disability_days integer CHECK (disability_days IS NULL OR disability_days >= 0),
  photo_paths text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported', 'investigating', 'closed')),
  corrective_action text,
  action_owner text,
  action_owner_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action_due date,
  action_done_at timestamptz,
  closed_at timestamptz,
  reported_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sst_incidents_org_idx ON public.sst_incidents (org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS sst_incidents_open_idx ON public.sst_incidents (org_id, status) WHERE status <> 'closed';

-- ─── SST: inspecciones programadas y hechas ───
CREATE TABLE IF NOT EXISTS public.sst_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('epp', 'extinguishers', 'first_aid', 'heights', 'housekeeping', 'other')),
  kind_other text,
  site text,
  scheduled_for date,
  done_at timestamptz,
  responsible_name text,
  responsible_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  result text CHECK (result IS NULL OR result IN ('conforming', 'findings')),
  findings text,
  photo_paths text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sst_inspections_org_idx ON public.sst_inspections (org_id, scheduled_for DESC);

-- ─── Ambiental: residuos entregados o retiros programados ───
CREATE TABLE IF NOT EXISTS public.env_waste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  recorded_on date NOT NULL DEFAULT current_date,
  kind text NOT NULL
    CHECK (kind IN ('organic', 'infertile_egg', 'recyclable', 'hazardous', 'ordinary')),
  kg numeric(12, 2) NOT NULL DEFAULT 0 CHECK (kg >= 0),
  manager text,
  recovered boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'delivered' CHECK (status IN ('scheduled', 'delivered')),
  certificate_path text,
  notes text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS env_waste_org_idx ON public.env_waste (org_id, recorded_on DESC);

-- ─── Ambiental: lecturas de medidores (agua, energía, gas) ───
CREATE TABLE IF NOT EXISTS public.env_meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  read_on date NOT NULL DEFAULT current_date,
  meter text NOT NULL CHECK (meter IN ('water', 'energy', 'gas')),
  site text,
  reading numeric(14, 3) NOT NULL CHECK (reading >= 0),
  unit text NOT NULL,
  notes text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS env_meter_readings_org_idx ON public.env_meter_readings (org_id, meter, read_on DESC);

-- ─── Ambiental: obligaciones y permisos con fecha de vencimiento ───
CREATE TABLE IF NOT EXISTS public.env_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
  file_path text,
  notes text,
  done_at timestamptz,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS env_obligations_org_idx ON public.env_obligations (org_id, due_on);

-- ─── RLS por empresa: ver, registrar y actualizar; borrar no (queda la trazabilidad) ───
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sst_incidents', 'sst_inspections', 'env_waste', 'env_meter_readings', 'env_obligations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(org_id))',
      t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id))',
      t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id))',
      t || '_update', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- updated_at al día en cada cambio.
CREATE OR REPLACE FUNCTION public.incubapp_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sst_incidents', 'sst_inspections', 'env_waste', 'env_obligations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.incubapp_touch_updated_at()',
      t || '_touch', t);
  END LOOP;
END $$;

-- Que PostgREST vea las tablas nuevas sin reiniciar.
NOTIFY pgrst, 'reload schema';
