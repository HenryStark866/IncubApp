-- =============================================================================
-- IncubApp · Misionales igual a la ventana original (repo_misionales) · 06-10-2026
-- Cada 15 inspecciones de un conductor se agrupan en un consolidado (como el
-- «reporte15» del original): la tabla mission_reports guarda el grupo y cada
-- inspección queda marcada con report_id. Las inspecciones sin report_id son los
-- «registros activos» de Mis inspecciones. Idempotente.
-- =============================================================================
DO $$
BEGIN
  IF to_regclass('public.mission_inspections') IS NULL THEN
    RAISE NOTICE 'Sin public.mission_inspections: nada que hacer';
    RETURN;
  END IF;
  ALTER TABLE public.mission_inspections ADD COLUMN IF NOT EXISTS formato jsonb NOT NULL DEFAULT '{}'::jsonb;
END $$;

CREATE TABLE IF NOT EXISTS public.mission_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  driver_name text,
  total int NOT NULL DEFAULT 15,
  first_at timestamptz,
  last_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mission_reports_org_idx ON public.mission_reports (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mission_reports_user_idx ON public.mission_reports (user_id, created_at DESC);

ALTER TABLE public.mission_inspections
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.mission_reports (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS mission_insp_pendientes_idx
  ON public.mission_inspections (org_id, user_id, inspected_at) WHERE report_id IS NULL;

ALTER TABLE public.mission_reports ENABLE ROW LEVEL SECURITY;

-- Miembros de la empresa leen los consolidados (igual que las inspecciones).
DROP POLICY IF EXISTS mission_reports_member_select ON public.mission_reports;
CREATE POLICY mission_reports_member_select ON public.mission_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = mission_reports.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );
-- No hay insert/update directos: los crea mission_consolidar().

-- Agrupa de a 15 las inspecciones pendientes del usuario que llama, de la más
-- vieja a la más nueva. Devuelve los consolidados creados (puede ser ninguno).
CREATE OR REPLACE FUNCTION public.mission_consolidar(p_org uuid)
RETURNS SETOF public.mission_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids text[];
  v_rep public.mission_reports;
  v_vueltas int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members m WHERE m.org_id = p_org AND m.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'No pertenece a la empresa';
  END IF;
  -- Un consolidado a la vez por usuario (dos envíos seguidos no duplican).
  PERFORM pg_advisory_xact_lock(hashtext('mission_consolidar:' || v_uid::text));
  LOOP
    v_vueltas := v_vueltas + 1;
    EXIT WHEN v_vueltas > 50;
    SELECT array_agg(id ORDER BY inspected_at, id) INTO v_ids
    FROM (
      SELECT id, inspected_at FROM public.mission_inspections
      WHERE org_id = p_org AND user_id = v_uid AND report_id IS NULL
      ORDER BY inspected_at, id
      LIMIT 15
    ) t;
    EXIT WHEN coalesce(array_length(v_ids, 1), 0) < 15;
    INSERT INTO public.mission_reports (org_id, user_id, driver_name, total, first_at, last_at)
    SELECT p_org, v_uid, max(driver_name), count(*), min(inspected_at), max(inspected_at)
    FROM public.mission_inspections WHERE id = ANY (v_ids)
    RETURNING * INTO v_rep;
    UPDATE public.mission_inspections SET report_id = v_rep.id WHERE id = ANY (v_ids);
    RETURN NEXT v_rep;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.mission_consolidar(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mission_consolidar(uuid) TO authenticated;
GRANT SELECT ON public.mission_reports TO authenticated;

NOTIFY pgrst, 'reload schema';
