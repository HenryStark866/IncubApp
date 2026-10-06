-- =============================================================================
-- IncubApp · Área de producción (líder de producción) · 06-10-2026
-- 1. Nuevo cargo «quality_auxiliary» (Auxiliar de calidad). Si la base restringe los
--    cargos de organization_members.role (CHECK con lista o tipo enum), se agrega.
-- 2. El área «quality» (en la app: «Producción / calidad») manda sobre: auxiliar de
--    producción, auxiliar de calidad, auxiliar de vacunación y operario de recepción.
--    Así la líder de producción puede asignar claves y tareas a su equipo.
-- Idempotente.
-- =============================================================================
DO $$
DECLARE
  c record;
  def text;
  tipo regtype;
BEGIN
  IF to_regclass('public.organization_members') IS NULL THEN
    RAISE NOTICE 'Sin organization_members: nada que hacer';
    RETURN;
  END IF;

  -- a) role como enum: agregar el valor
  SELECT a.atttypid::regtype INTO tipo
  FROM pg_attribute a
  WHERE a.attrelid = 'public.organization_members'::regclass AND a.attname = 'role' AND NOT a.attisdropped;
  IF tipo IS NOT NULL AND EXISTS (SELECT 1 FROM pg_type t WHERE t.oid = tipo::oid AND t.typtype = 'e') THEN
    EXECUTE format('ALTER TYPE %s ADD VALUE IF NOT EXISTS %L', tipo, 'quality_auxiliary');
  END IF;

  -- b) CHECK con la lista de cargos: rehacerlo con el cargo nuevo
  FOR c IN
    SELECT con.conname, pg_get_constraintdef(con.oid) AS d
    FROM pg_constraint con
    WHERE con.conrelid = 'public.organization_members'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ~ 'role'
      AND pg_get_constraintdef(con.oid) ~ 'auxiliary_production'
      AND pg_get_constraintdef(con.oid) !~ 'quality_auxiliary'
  LOOP
    def := regexp_replace(c.d, '''auxiliary_production''(::[a-z ]+)?', '''auxiliary_production''\1, ''quality_auxiliary''\1');
    EXECUTE format('ALTER TABLE public.organization_members DROP CONSTRAINT %I', c.conname);
    EXECUTE format('ALTER TABLE public.organization_members ADD CONSTRAINT %I %s', c.conname, def);
    RAISE NOTICE 'Restricción % actualizada con quality_auxiliary', c.conname;
  END LOOP;
END $$;

-- 2. Cargos que dependen de cada área (mismo mapa que COORD_AUXILIARIES en src/lib/roles.js).
DO $$
BEGIN
  IF to_regprocedure('public.incubapp_area_norm(text)') IS NULL THEN
    RAISE NOTICE 'Sin incubapp_area_norm (falta 20260930_admin_set_password_por_area): se omite';
    RETURN;
  END IF;
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.incubapp_role_in_area(p_role text, p_area text)
    RETURNS boolean
    LANGUAGE sql
    IMMUTABLE
    AS $body$
      SELECT p_role = ANY (CASE public.incubapp_area_norm(p_area)
        WHEN 'plant' THEN ARRAY['operator', 'auxiliary', 'auxiliary_production', 'quality_auxiliary', 'supervisor',
                                'reception_operator', 'vaccination_auxiliary', 'plant_veterinarian']
        WHEN 'maintenance' THEN ARRAY['maintenance_auxiliary']
        WHEN 'sst' THEN ARRAY['sst_auxiliary', 'hse_auxiliary']
        WHEN 'environmental' THEN ARRAY['environmental_auxiliary']
        WHEN 'hr' THEN ARRAY['hr_auxiliary']
        WHEN 'accounting' THEN ARRAY['accounting_auxiliary']
        WHEN 'sales' THEN ARRAY['sales_logistics_auxiliary']
        WHEN 'logistics' THEN ARRAY['logistics_auxiliary', 'driver']
        WHEN 'sales_logistics' THEN ARRAY['sales_logistics_auxiliary', 'logistics_auxiliary', 'driver']
        WHEN 'quality' THEN ARRAY['auxiliary_production', 'quality_auxiliary', 'vaccination_auxiliary', 'reception_operator']
        WHEN 'farm' THEN ARRAY['barn_operator', 'vaccination_auxiliary']
        WHEN 'veterinary' THEN ARRAY['vaccination_auxiliary', 'plant_veterinarian']
        WHEN 'management' THEN ARRAY['management_auxiliary']
        ELSE ARRAY[]::text[]
      END)
    $body$;
  $f$;
END $$;

NOTIFY pgrst, 'reload schema';
