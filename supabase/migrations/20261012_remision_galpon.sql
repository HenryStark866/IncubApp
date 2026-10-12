-- =============================================================================
-- IncubApp · Remisión huevos galpón (operario de recepción) · 12-10-2026
-- El formulario «Remisión galpón» (11-10-2026) guardaba en reception_remisions, pero la
-- tabla no existía: nada quedaba guardado. Una fila por remisión física: número, fechas,
-- quien despacha / recibe, filas por galpón (jsonb) y totales (jsonb). La foto del papel
-- va al bucket privado «machine-checks» bajo {org_id}/reception-remisions/…
-- RLS por empresa con public.is_org_member(org_id). Idempotente.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.reception_remisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  registered_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  remision_no text NOT NULL CHECK (length(trim(remision_no)) > 0),
  photo_path text,
  fecha_produccion date,
  fecha_remision date,
  quien_despacha text,
  quien_recibe text,
  observaciones text,
  galpon_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  totales jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Una remisión física se registra una sola vez por empresa
CREATE UNIQUE INDEX IF NOT EXISTS reception_remisions_no_uidx ON public.reception_remisions (org_id, remision_no);
CREATE INDEX IF NOT EXISTS reception_remisions_org_idx ON public.reception_remisions (org_id, created_at DESC);

ALTER TABLE public.reception_remisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reception_remisions_select ON public.reception_remisions;
CREATE POLICY reception_remisions_select ON public.reception_remisions
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS reception_remisions_insert ON public.reception_remisions;
CREATE POLICY reception_remisions_insert ON public.reception_remisions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND registered_by = auth.uid());

-- Corrige quien la registró o un líder de la empresa
DROP POLICY IF EXISTS reception_remisions_update ON public.reception_remisions;
CREATE POLICY reception_remisions_update ON public.reception_remisions
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(org_id) AND (
      registered_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.org_id = reception_remisions.org_id AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin', 'management', 'coordinator', 'supervisor')
      )
    )
  )
  WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS reception_remisions_delete ON public.reception_remisions;
CREATE POLICY reception_remisions_delete ON public.reception_remisions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = reception_remisions.org_id AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin', 'management', 'coordinator')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reception_remisions TO authenticated;

NOTIFY pgrst, 'reload schema';
