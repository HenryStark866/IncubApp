-- =============================================================================
-- IncubApp · Órdenes de trabajo: permiso para crear y consultas rápidas · 12-10-2026
--
-- 1. «new row violates row-level security policy for table work_orders»: el auxiliar de
--    mantenimiento no podía CREAR OT (sí atenderlas y cerrarlas), así que fallaban los
--    reportes del Plan AM («Guardar y llenar FOMAT01») y los hallazgos. Ahora cualquier
--    miembro aprobado de la empresa (menos cliente y observador) puede registrar una OT a
--    su nombre: el auxiliar sus trabajos; los demás, pedir mantenimiento.
-- 2. «canceling statement due to statement timeout» en «Mis órdenes de trabajo»: la regla de
--    lectura revisaba la membresía fila por fila (76.000 OT del historial Mantum): 25 s.
--    Se revisa una sola vez por consulta (lista de empresas del usuario): 0,1 s.
--    Igual para las fotos de ronda (machine_checks).
-- Idempotente.
-- =============================================================================

-- Empresas a las que pertenece el usuario (aprobado). Se evalúa una vez por consulta.
CREATE OR REPLACE FUNCTION private.my_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT m.org_id
  FROM public.organization_members m
  JOIN public.profiles pr ON pr.id = m.user_id
  WHERE m.user_id = (SELECT auth.uid()) AND pr.is_approved
$$;
REVOKE ALL ON FUNCTION private.my_org_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION private.my_org_ids() TO authenticated;

-- Quién puede registrar una OT
CREATE OR REPLACE FUNCTION private.can_create_work_order(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    JOIN public.profiles pr ON pr.id = m.user_id
    WHERE m.org_id = p_org
      AND m.user_id = (SELECT auth.uid())
      AND pr.is_approved
      AND m.role::text NOT IN ('customer', 'viewer')
  )
$$;
REVOKE ALL ON FUNCTION private.can_create_work_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.can_create_work_order(uuid) TO authenticated;

DROP POLICY IF EXISTS work_orders_insert ON public.work_orders;
CREATE POLICY work_orders_insert ON public.work_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_platform_admin())
    OR (created_by = (SELECT auth.uid()) AND private.can_create_work_order(org_id))
  );

DROP POLICY IF EXISTS work_orders_select ON public.work_orders;
CREATE POLICY work_orders_select ON public.work_orders
  FOR SELECT TO authenticated
  USING ((SELECT private.is_platform_admin()) OR org_id IN (SELECT private.my_org_ids()));

DROP POLICY IF EXISTS machine_checks_select ON public.machine_checks;
CREATE POLICY machine_checks_select ON public.machine_checks
  FOR SELECT TO authenticated
  USING ((SELECT private.is_platform_admin()) OR org_id IN (SELECT private.my_org_ids()));

-- Las OT activas y las de otras fuentes se listan sin recorrer el historial del Plan AM
CREATE INDEX IF NOT EXISTS work_orders_activas_idx
  ON public.work_orders (org_id, created_at DESC)
  WHERE source IS DISTINCT FROM 'maintenance_plan' OR status <> 'completed';
CREATE INDEX IF NOT EXISTS work_orders_cierre_idx
  ON public.work_orders (org_id, completed_at DESC);

ANALYZE public.work_orders;
NOTIFY pgrst, 'reload schema';
