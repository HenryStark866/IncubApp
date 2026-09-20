-- ══════════════════════════════════════════════════════════════════
-- Roles y módulos corporativos: Gerencia, RR.HH., Contabilidad,
-- Ventas/Logística, Mantenimiento, SST y ambiental (+ auxiliares).
--
-- organization_members.role suele ser TEXT o un ENUM. Este script
-- intenta ampliar el ENUM si existe; si role es TEXT, no hace falta.
-- Ejecutar en el SQL Editor de Supabase (como postgres).
-- ══════════════════════════════════════════════════════════════════

-- 1) Ampliar enum de rol (nombres habituales en el proyecto)
DO $$
DECLARE
  enum_name text;
  new_vals text[] := ARRAY[
    'management',
    'management_auxiliary',
    'hr_auxiliary',
    'accounting_auxiliary',
    'sales_logistics_auxiliary',
    'customer',
    'hse_auxiliary'
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
    RAISE NOTICE 'No se detectó ENUM de roles; si role es TEXT, los valores nuevos ya son válidos.';
    RETURN;
  END IF;

  FOREACH v IN ARRAY new_vals LOOP
    BEGIN
      EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_name, v);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN syntax_error THEN
        -- PG antiguos sin IF NOT EXISTS
        BEGIN
          EXECUTE format('ALTER TYPE %I ADD VALUE %L', enum_name, v);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END;
  END LOOP;

  RAISE NOTICE 'Enum % actualizado con roles corporativos.', enum_name;
END $$;

-- 2) Asegurar columna area (coordinadores por módulo)
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS area text DEFAULT 'general';

COMMENT ON COLUMN public.organization_members.area IS
  'Área del coordinador: general|management|hr|accounting|sales_logistics|maintenance|hse|plant|farm|quality';

-- 3) Índice útil para filtrar por rol en la org
CREATE INDEX IF NOT EXISTS organization_members_org_role_idx
  ON public.organization_members (org_id, role);
