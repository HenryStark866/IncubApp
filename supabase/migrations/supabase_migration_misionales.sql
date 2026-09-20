-- =============================================================================
-- Desplazamientos misionales — inspecciones pre-operacionales (multi-tenant)
-- Portado desde repo_misionales a IncubApp
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.mission_inspections (
  id text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  driver_name text NOT NULL,
  plate text NOT NULL,
  vehicle_type text NOT NULL DEFAULT 'Moto'
    CHECK (vehicle_type IN ('Moto', 'Carro', 'Camion')),
  process text,
  origin text,
  destination text,
  brand text,
  model text,
  fuel text,
  line text,
  engine text,
  internal_number text,
  odometer text,
  city text,
  license_num text,
  license_exp text,
  soat text,
  property_card text,
  gas_cert text,
  insurance text,
  aspects jsonb NOT NULL DEFAULT '{}'::jsonb,
  optimal boolean NOT NULL DEFAULT true,
  observations text,
  compliance_pct int,
  lat double precision,
  lng double precision,
  gps_accuracy double precision,
  signature_data text,
  status text NOT NULL DEFAULT 'submitted',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mission_insp_org_fecha_idx
  ON public.mission_inspections (org_id, inspected_at DESC);
CREATE INDEX IF NOT EXISTS mission_insp_org_user_idx
  ON public.mission_inspections (org_id, user_id);
CREATE INDEX IF NOT EXISTS mission_insp_placa_idx
  ON public.mission_inspections (org_id, plate);

ALTER TABLE public.mission_inspections ENABLE ROW LEVEL SECURITY;

-- Miembros de la org: leen/escriben (todos los perfiles de la empresa)
DROP POLICY IF EXISTS mission_insp_member_select ON public.mission_inspections;
CREATE POLICY mission_insp_member_select ON public.mission_inspections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = mission_inspections.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );

DROP POLICY IF EXISTS mission_insp_member_insert ON public.mission_inspections;
CREATE POLICY mission_insp_member_insert ON public.mission_inspections
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = mission_inspections.org_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS mission_insp_member_delete ON public.mission_inspections;
CREATE POLICY mission_insp_member_delete ON public.mission_inspections
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = mission_inspections.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin', 'management', 'coordinator', 'supervisor')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );

COMMENT ON TABLE public.mission_inspections IS
  'Inspecciones pre-operacionales de desplazamientos misionales (SST). Multi-tenant por org_id.';
