-- =============================================================================
-- IncubApp · Flujo de producción completo · 12-10-2026 (definido por planta)
--   recepción (foto de etiqueta) → cotejo con la remisión (visto bueno / novedad)
--   → cuarto frío → clasificación (días sin nacimiento) → mapas → cargue según el broiler
--   → calibración INC (1d12h–2d12h) → transferencia día 18 (turneros) → calibración de
--   nacedoras DESPUÉS de transferir → nacimiento día 21 (lun/mar/jue/vie): la auxiliar de
--   vacunación reporta cantidades y pesos.
--
-- 1. Nacimientos: quien registra la transferencia (normalmente el turnero) deja programado
--    el nacimiento; la auxiliar de vacunación y la de producción lo inician y lo cierran con
--    los pollitos reales. Antes solo owner/admin/supervisor/coordinator podían.
-- 2. Remisión huevos galpón: el operario de recepción da el visto bueno o reporta la novedad.
-- Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION private.can_record_hatch(p_org uuid)
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
      AND m.role::text IN ('owner', 'admin', 'supervisor', 'coordinator', 'management',
                           'operator', 'auxiliary', 'auxiliary_production', 'vaccination_auxiliary')
  );
$$;
REVOKE ALL ON FUNCTION private.can_record_hatch(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.can_record_hatch(uuid) TO authenticated;

DROP POLICY IF EXISTS hatch_events_insert ON public.hatch_events;
CREATE POLICY hatch_events_insert ON public.hatch_events
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_platform_admin()
    OR (started_by = (SELECT auth.uid()) AND private.can_record_hatch(org_id))
  );

DROP POLICY IF EXISTS hatch_events_update ON public.hatch_events;
CREATE POLICY hatch_events_update ON public.hatch_events
  FOR UPDATE TO authenticated
  USING (private.is_platform_admin() OR private.can_record_hatch(org_id))
  WITH CHECK (private.is_platform_admin() OR private.can_record_hatch(org_id));

-- Peso promedio del pollito al nacer (lo reporta vacunación con la calidad del pollito)
ALTER TABLE public.hatch_events ADD COLUMN IF NOT EXISTS avg_chick_weight_g numeric(6,2);

-- 2. Verificación de la remisión
ALTER TABLE public.reception_remisions ADD COLUMN IF NOT EXISTS verificacion text
  CHECK (verificacion IS NULL OR verificacion IN ('ok', 'novedad'));
ALTER TABLE public.reception_remisions ADD COLUMN IF NOT EXISTS novedad text;
ALTER TABLE public.reception_remisions ADD COLUMN IF NOT EXISTS conteo_planta integer;
ALTER TABLE public.reception_remisions ADD COLUMN IF NOT EXISTS lot_arrival_id uuid;

NOTIFY pgrst, 'reload schema';
