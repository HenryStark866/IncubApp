-- =============================================================================
-- Fix: invalid input value for enum work_area: "logistics"
-- El front usa áreas: logistics, sales, sst, environmental, veterinary…
-- Si la columna organization_members.area es ENUM work_area incompleto, falla.
-- Solución: pasar area a TEXT (flexible multi-tenant) y ampliar enum si existe.
-- =============================================================================

-- 1) Ampliar enum work_area si existe (Postgres)
DO $$
DECLARE
  v text;
  vals text[] := ARRAY[
    'general',
    'management',
    'hr',
    'accounting',
    'sales',
    'logistics',
    'sales_logistics',
    'maintenance',
    'sst',
    'environmental',
    'hse',
    'plant',
    'farm',
    'veterinary',
    'quality'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_area') THEN
    FOREACH v IN ARRAY vals LOOP
      BEGIN
        EXECUTE format('ALTER TYPE work_area ADD VALUE IF NOT EXISTS %L', v);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN others THEN
          BEGIN
            EXECUTE format('ALTER TYPE work_area ADD VALUE %L', v);
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
      END;
    END LOOP;
    RAISE NOTICE 'Enum work_area ampliado (si faltaban valores).';
  ELSE
    RAISE NOTICE 'No existe tipo work_area (area puede ser text ya).';
  END IF;
END $$;

-- 2) Convertir columna a TEXT (recomendado: evita futuros enums incompletos)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_members'
      AND column_name = 'area'
  ) THEN
    -- Si es enum u otro tipo, castear a text
    ALTER TABLE public.organization_members
      ALTER COLUMN area TYPE text
      USING (
        CASE
          WHEN area IS NULL THEN NULL
          ELSE area::text
        END
      );
    RAISE NOTICE 'organization_members.area → text';
  END IF;
END $$;

ALTER TABLE public.organization_members
  ALTER COLUMN area SET DEFAULT 'general';

COMMENT ON COLUMN public.organization_members.area IS
  'Área del líder (text): general|management|hr|accounting|sales|logistics|sales_logistics|maintenance|sst|environmental|hse|plant|farm|veterinary|quality';

-- 3) Normalizar valores legacy / vacíos
UPDATE public.organization_members
SET area = 'general'
WHERE area IS NULL OR btrim(area) = '';

-- Listo: "logistics" y el resto de WORK_AREAS del front son válidos.
