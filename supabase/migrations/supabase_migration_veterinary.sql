-- IncubApp: sanidad veterinaria + roles SST / ambiental separados
-- Ejecutar en SQL Editor de Supabase.

-- 1) Roles nuevos (si role es ENUM)
DO $$
DECLARE
  enum_name text;
  new_vals text[] := ARRAY[
    'sst_auxiliary',
    'environmental_auxiliary',
    'vaccination_auxiliary',
    'plant_veterinarian',
    'logistics_auxiliary'
  ];
  v text;
BEGIN
  SELECT t.typname INTO enum_name
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  WHERE e.enumlabel IN ('coordinator', 'operator', 'maintenance_auxiliary')
  GROUP BY t.typname
  HAVING count(DISTINCT e.enumlabel) >= 2
  LIMIT 1;

  IF enum_name IS NULL THEN
    RAISE NOTICE 'role parece TEXT; no se altera ENUM.';
    RETURN;
  END IF;

  FOREACH v IN ARRAY new_vals LOOP
    BEGIN
      EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_name, v);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN others THEN
        BEGIN
          EXECUTE format('ALTER TYPE %I ADD VALUE %L', enum_name, v);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END;
  END LOOP;
END $$;

-- 2) Tabla de registros veterinarios
CREATE TABLE IF NOT EXISTS public.veterinary_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN (
      'vaccination', 'medicine', 'fertility', 'wet_tunnel_lab', 'other_lab'
    )),
  title text NOT NULL,
  site text,
  batch_or_lote text,
  sample_point text,
  result text,
  result_status text
    CHECK (result_status IS NULL OR result_status IN ('ok', 'alert', 'fail', 'pending')),
  product_name text,
  dose numeric(14, 4),
  units text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS veterinary_records_org_kind_idx
  ON public.veterinary_records (org_id, kind, recorded_at DESC);

ALTER TABLE public.veterinary_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS veterinary_records_member ON public.veterinary_records;
CREATE POLICY veterinary_records_member ON public.veterinary_records
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = veterinary_records.org_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = veterinary_records.org_id AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.veterinary_records IS
  'Vacunas, medicina, fertilidad y muestras lab (wet tunnels / ambientes)';

COMMENT ON COLUMN public.organization_members.area IS
  'Área del coordinador: general|management|hr|accounting|sales_logistics|maintenance|sst|environmental|plant|farm|veterinary|quality (hse=legacy SST)';
