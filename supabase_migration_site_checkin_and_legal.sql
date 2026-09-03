-- IncubApp: radio de validación de sede para ingreso/salida + registro de aceptación legal
-- Ejecutar con la tool MCP apply_migration (Supabase project pdxlmjlooeqlvvgbosbu).

-- ═══════════════════════════════════════════════════════════════
-- 1) Radio de validación GPS por sede (planta o granja, tabla `plants`)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS geo_radius_m double precision NOT NULL DEFAULT 300;

COMMENT ON COLUMN public.plants.geo_radius_m IS
  'Radio (metros) alrededor de geo_origin_lat/lng dentro del cual se considera "en la sede" para ingreso/salida.';

-- ═══════════════════════════════════════════════════════════════
-- 2) Verificación de sede en cada marca de asistencia
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.attendance_punches
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.plants (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_name text,
  ADD COLUMN IF NOT EXISTS distance_m double precision,
  ADD COLUMN IF NOT EXISTS site_verified boolean;

COMMENT ON COLUMN public.attendance_punches.site_verified IS
  'true si el GPS de la marca cayó dentro del radio calibrado de la sede más cercana; null si ninguna sede del tenant tiene GPS calibrado (no se exigió verificación).';

CREATE INDEX IF NOT EXISTS attendance_punches_site_idx
  ON public.attendance_punches (site_id);

-- ═══════════════════════════════════════════════════════════════
-- 3) Aceptación de Términos de Uso / Política de Privacidad (Habeas Data)
-- ═══════════════════════════════════════════════════════════════
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
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );

DROP POLICY IF EXISTS legal_acceptances_insert ON public.legal_acceptances;
CREATE POLICY legal_acceptances_insert ON public.legal_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.legal_acceptances IS
  'Registro de aceptación (clic-wrap) de Términos de Uso y Política de Tratamiento de Datos por versión, con fecha y user-agent, como evidencia de consentimiento.';
