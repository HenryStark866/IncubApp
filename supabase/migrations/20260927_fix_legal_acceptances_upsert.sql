-- IncubApp: reparar la aceptación legal para instalaciones existentes.
-- Motivo: CREATE TABLE IF NOT EXISTS no agrega la restricción UNIQUE si la tabla ya existía.

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('terms', 'privacy')),
  doc_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Instalaciones antiguas: la tabla puede no tener llave primaria y, si está en una
-- publicación (realtime) que publica borrados, Postgres no deja borrar sin «replica
-- identity». Se usa FULL solo en ese caso para poder limpiar los duplicados.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index WHERE indrelid = 'public.legal_acceptances'::regclass AND indisprimary
  ) AND (SELECT relreplident FROM pg_class WHERE oid = 'public.legal_acceptances'::regclass) = 'd' THEN
    ALTER TABLE public.legal_acceptances REPLICA IDENTITY FULL;
  END IF;
END $$;

-- Conserva la aceptación más reciente cuando una instalación antigua tiene duplicados.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, doc_type, doc_version
      ORDER BY accepted_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS row_num
  FROM public.legal_acceptances
)
DELETE FROM public.legal_acceptances AS acceptance
USING ranked
WHERE acceptance.id = ranked.id
  AND ranked.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_user_doc_version_uidx
  ON public.legal_acceptances (user_id, doc_type, doc_version);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_acceptances_select ON public.legal_acceptances;
CREATE POLICY legal_acceptances_select ON public.legal_acceptances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS legal_acceptances_insert ON public.legal_acceptances;
CREATE POLICY legal_acceptances_insert ON public.legal_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS legal_acceptances_update ON public.legal_acceptances;
CREATE POLICY legal_acceptances_update ON public.legal_acceptances
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_platform_admin());

GRANT SELECT, INSERT, UPDATE ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;
