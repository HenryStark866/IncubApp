-- =============================================================================
-- IncubApp · Formatos de calidad de la planta (auxiliar de calidad) · 06-10-2026
-- Un registro por muestreo: peso del huevo, pérdida de humedad, ovoscopia/fertilidad,
-- embriodiagnóstico y calidad del pollito. Los datos de cada formato van en «data»
-- (jsonb) y los indicadores calculados en «results» (jsonb), para que la líder de
-- producción y los informes los lean sin recalcular. Fotos en el bucket privado
-- «machine-checks» bajo {org_id}/calidad/…; aquí solo las rutas.
-- RLS por empresa con public.is_org_member(org_id). Idempotente.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.quality_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('egg_weight', 'moisture_loss', 'candling', 'breakout', 'chick_quality')),
  sampled_at timestamptz NOT NULL DEFAULT now(),
  lote text,
  machine_id uuid REFERENCES public.machines (id) ON DELETE SET NULL,
  sample_size integer CHECK (sample_size IS NULL OR sample_size >= 0),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'watch', 'alert')),
  notes text,
  photo_paths text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quality_records_org_idx ON public.quality_records (org_id, sampled_at DESC);
CREATE INDEX IF NOT EXISTS quality_records_lote_idx ON public.quality_records (org_id, lote);

ALTER TABLE public.quality_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quality_records_select ON public.quality_records;
CREATE POLICY quality_records_select ON public.quality_records
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS quality_records_insert ON public.quality_records;
CREATE POLICY quality_records_insert ON public.quality_records
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));

-- Corrige quien lo registró o un líder de la empresa
DROP POLICY IF EXISTS quality_records_update ON public.quality_records;
CREATE POLICY quality_records_update ON public.quality_records
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(org_id) AND (
      created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.org_id = quality_records.org_id AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin', 'management', 'coordinator', 'supervisor')
      )
    )
  )
  WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS quality_records_delete ON public.quality_records;
CREATE POLICY quality_records_delete ON public.quality_records
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid() OR EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = quality_records.org_id AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin', 'management', 'coordinator')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_records TO authenticated;

-- Tiempo real para el inicio de la líder de producción: esta tabla y las que ese inicio
-- escucha (si existen y aún no están en la publicación).
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['quality_records', 'lot_arrivals', 'cold_room_stock', 'load_maps', 'setter_loads',
                           'transfers', 'hatch_events', 'machine_checks', 'shift_activities'] LOOP
    -- Solo con llave primaria: sin ella, una tabla publicada no deja borrar filas
    IF to_regclass('public.' || t) IS NOT NULL
       AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.' || t) AND c.contype = 'p')
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
