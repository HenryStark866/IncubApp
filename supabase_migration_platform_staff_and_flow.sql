-- =============================================================================
-- CDH Maker · Flujo SaaS correcto
-- 1) henrytaborda57@gmail.com = SOLO admin de plataforma (no empleado Incubant)
-- 2) is_platform_admin() + políticas cross-tenant para construir/editar empresas
-- 3) Plantilla base de menú/módulos versionable (se actualiza al adecuar estructura)
-- 4) Admin de licencia en empresa: coordinator / management / owner / admin
-- Ejecutar en Supabase → SQL Editor (rol con permisos suficientes)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- A) Perfil SaaS: Henry Stark / henrytaborda57@gmail.com
-- ─────────────────────────────────────────────────────────────────────────────

-- Aprobar y marcar como admin de plataforma
UPDATE public.profiles
SET
  platform_role = 'admin',
  is_approved = true,
  full_name = COALESCE(NULLIF(trim(full_name), ''), 'Henry Stark')
WHERE lower(email) = lower('henrytaborda57@gmail.com');

-- Desvincular de TODAS las empresas cliente (no es empleado de Incubant)
DELETE FROM public.organization_members m
USING public.profiles p
WHERE m.user_id = p.id
  AND lower(p.email) = lower('henrytaborda57@gmail.com');

-- Cualquier otro platform admin no debería quedar colgado solo como "developer" de cliente
-- (no borramos otros usuarios; solo el email indicado)

-- ─────────────────────────────────────────────────────────────────────────────
-- B) Función is_platform_admin()
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.platform_role = 'admin'
      AND COALESCE(p.is_approved, false) = true
  );
$$;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'Personal CDH Maker (profiles.platform_role = admin). No es rol de empresa cliente.';

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- C) Admin de usuarios de la EMPRESA (coordinador / gerencia / owner / admin)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_manage_org_users(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.org_id = p_org
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin', 'management', 'coordinator')
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_org_users(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.org_set_user_approved(p_user uuid, p_approved boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'user required';
  END IF;

  -- No modificar cuentas de plataforma
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user AND p.platform_role = 'admin'
  ) THEN
    RAISE EXCEPTION 'cannot modify platform staff';
  END IF;

  IF NOT public.is_platform_admin() AND NOT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.user_id = p_user
      AND public.can_manage_org_users(m.org_id)
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.profiles
  SET is_approved = COALESCE(p_approved, is_approved)
  WHERE id = p_user;
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_set_user_approved(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- D) organizations.settings + brand_key
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_key text NULL;

COMMENT ON COLUMN public.organizations.settings IS
  'Plantilla de menú/módulos del tenant (menu_template_id, enabled_domains, enabled_menu_ids, version).';

-- Marcar Incubant
UPDATE public.organizations
SET brand_key = COALESCE(brand_key, 'incubant')
WHERE brand_key IS NULL
  AND (
    lower(coalesce(slug, '')) ~ 'incubant|antioquen'
    OR lower(coalesce(name, '')) ~ 'incubant|antioque'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- E) Catálogo de plantilla base (estructura que se actualiza al adecuar el producto)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_client_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  version int NOT NULL DEFAULT 1,
  menu jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  source_note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.platform_client_templates IS
  'Estructura base de menú/módulos para nuevas empresas. Al adecuar el producto se actualiza y se propaga metadata a tenants.';

CREATE UNIQUE INDEX IF NOT EXISTS platform_client_templates_one_default
  ON public.platform_client_templates ((is_default))
  WHERE is_default = true;

ALTER TABLE public.platform_client_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_templates_select ON public.platform_client_templates;
CREATE POLICY platform_templates_select ON public.platform_client_templates
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS platform_templates_admin_all ON public.platform_client_templates;
CREATE POLICY platform_templates_admin_all ON public.platform_client_templates
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Seed plantilla por defecto (si no existe)
INSERT INTO public.platform_client_templates (
  id, name, description, version, menu, enabled_domains, suggested_roles, is_default, source_note
)
VALUES (
  'incubant_ops_v1',
  'Operación incubación / granja',
  'Paquete operativo: supervisión, OT, gerencia, comercial, granja, sanidad, IoT y administración de empresa.',
  2,
  '[
    {"id":"hoy","label":"Hoy","group":"Inicio","always":true},
    {"id":"accesos","label":"Accesos","group":"Dirección","always":true},
    {"id":"admin","label":"Administración","group":"Dirección","tab":"admin","hint":"Usuarios, plantas y granjas de la empresa"},
    {"id":"reportes","label":"Reportes","group":"Comunicación","always":true},
    {"id":"asistencia","label":"Asistencia","group":"Operación","always":true},
    {"id":"cumplimiento","label":"Cumplimiento","group":"Operación","always":true},
    {"id":"informes","label":"Informes gerencia","group":"Dirección","tab":"informes"},
    {"id":"panel","label":"Panel de coordinación","group":"Dirección","tab":"panel"},
    {"id":"gerencia","label":"Gerencia","group":"Dirección","tab":"gerencia"},
    {"id":"rrhh","label":"Recursos humanos","group":"Dirección","tab":"rrhh"},
    {"id":"contabilidad","label":"Contabilidad","group":"Dirección","tab":"contabilidad"},
    {"id":"ventas","label":"Ventas","group":"Comercial","tab":"ventas"},
    {"id":"logistica","label":"Logística","group":"Comercial","tab":"logistica"},
    {"id":"supervision","label":"Supervisión","group":"Operación","tab":"supervision"},
    {"id":"mantenimiento","label":"Órdenes de trabajo","group":"Operación","tab":"mantenimiento"},
    {"id":"horarios","label":"Horarios de turno","group":"Operación","tab":"horarios"},
    {"id":"monitoreo","label":"Modo monitoreo","group":"Operación","tab":"monitoreo"},
    {"id":"produccion","label":"Levantes","group":"Operación","tab":"produccion"},
    {"id":"huevos","label":"Reportes de huevo","group":"Operación","tab":"huevos"},
    {"id":"recepcion","label":"Recepción / cuarto frío","group":"Operación","tab":"recepcion"},
    {"id":"cargue","label":"Cargue","group":"Operación","tab":"cargue"},
    {"id":"plantas","label":"Plantas y planos","group":"Instalaciones","tab":"plantas"},
    {"id":"granjas","label":"Granjas","group":"Instalaciones","tab":"granjas"},
    {"id":"inventarios","label":"Inventarios","group":"Recursos","tab":"inventarios"},
    {"id":"veterinaria","label":"Sanidad veterinaria","group":"Sanidad","tab":"veterinaria"},
    {"id":"sst","label":"SST","group":"Cumplimiento","tab":"sst"},
    {"id":"ambiental","label":"Gestión ambiental","group":"Cumplimiento","tab":"ambiental"},
    {"id":"iot","label":"IoT y bioseguridad","group":"Cumplimiento","tab":"iot"},
    {"id":"perfil","label":"Perfil","group":null,"always":true}
  ]'::jsonb,
  '["gerencia","plant","farm","maintenance","sales","logistics","rrhh","contabilidad","sst","ambiental","veterinary","inventories","iot"]'::jsonb,
  '["owner","admin","management","coordinator","supervisor","operator","auxiliary"]'::jsonb,
  true,
  'Estructura base IncubApp · se actualiza al adecuar el producto'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  version = GREATEST(public.platform_client_templates.version, EXCLUDED.version),
  menu = EXCLUDED.menu,
  enabled_domains = EXCLUDED.enabled_domains,
  suggested_roles = EXCLUDED.suggested_roles,
  is_default = EXCLUDED.is_default,
  source_note = EXCLUDED.source_note,
  updated_at = now();

-- Propagar metadata de plantilla a empresas que no la tienen
UPDATE public.organizations o
SET settings = COALESCE(o.settings, '{}'::jsonb) || jsonb_build_object(
  'menu_template_id', t.id,
  'menu_template_name', t.name,
  'menu_template_version', t.version,
  'enabled_domains', t.enabled_domains,
  'enabled_menu_ids', (
    SELECT jsonb_agg(elem->>'id')
    FROM jsonb_array_elements(t.menu) elem
  ),
  'template_synced_at', now()::text
)
FROM public.platform_client_templates t
WHERE t.is_default = true
  AND (
    o.settings IS NULL
    OR o.settings = '{}'::jsonb
    OR NOT (o.settings ? 'menu_template_id')
  );

-- RPC: actualizar plantilla base y subir versión (solo platform admin)
CREATE OR REPLACE FUNCTION public.platform_upsert_default_template(p_payload jsonb)
RETURNS public.platform_client_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.platform_client_templates;
  tid text := COALESCE(p_payload->>'id', 'incubant_ops_v1');
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'only platform admin';
  END IF;

  INSERT INTO public.platform_client_templates AS t (
    id, name, description, version, menu, enabled_domains, suggested_roles, is_default, source_note, updated_at, updated_by
  )
  VALUES (
    tid,
    COALESCE(p_payload->>'name', 'Operación incubación / granja'),
    p_payload->>'description',
    COALESCE((p_payload->>'version')::int, 1),
    COALESCE(p_payload->'menu', '[]'::jsonb),
    COALESCE(p_payload->'enabled_domains', '[]'::jsonb),
    COALESCE(p_payload->'suggested_roles', '[]'::jsonb),
    true,
    COALESCE(p_payload->>'source_note', 'Actualización desde consola plataforma'),
    now(),
    auth.uid()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    version = t.version + 1,
    menu = EXCLUDED.menu,
    enabled_domains = EXCLUDED.enabled_domains,
    suggested_roles = EXCLUDED.suggested_roles,
    is_default = true,
    source_note = EXCLUDED.source_note,
    updated_at = now(),
    updated_by = auth.uid()
  RETURNING * INTO rec;

  -- Marcar otras plantillas como no default
  UPDATE public.platform_client_templates
  SET is_default = false
  WHERE id IS DISTINCT FROM rec.id AND is_default = true;

  -- Actualizar metadata en tenants que usan esta plantilla (no pisa datos operativos)
  UPDATE public.organizations
  SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
    'menu_template_id', rec.id,
    'menu_template_name', rec.name,
    'menu_template_version', rec.version,
    'enabled_domains', rec.enabled_domains,
    'template_synced_at', now()::text,
    'template_note', 'Estructura base actualizada desde plataforma'
  )
  WHERE (settings->>'menu_template_id') IS NULL
     OR (settings->>'menu_template_id') = rec.id
     OR settings = '{}'::jsonb
     OR settings IS NULL;

  RETURN rec;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_upsert_default_template(jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- F) RLS organizations / members / profiles (ampliar para platform admin)
--    Políticas ADITIVAS con nombres propios (no borran las existentes salvo homónimas)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Platform admin: CRUD total de empresas
DROP POLICY IF EXISTS orgs_platform_admin_all ON public.organizations;
CREATE POLICY orgs_platform_admin_all ON public.organizations
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Miembro de org: lectura de su empresa
DROP POLICY IF EXISTS orgs_member_select ON public.organizations;
CREATE POLICY orgs_member_select ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR id IN (
      SELECT m.org_id FROM public.organization_members m WHERE m.user_id = auth.uid()
    )
  );

-- Members: platform all; org managers manage non-developer; self read
DROP POLICY IF EXISTS om_platform_admin_all ON public.organization_members;
CREATE POLICY om_platform_admin_all ON public.organization_members
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS om_org_admin_select ON public.organization_members;
CREATE POLICY om_org_admin_select ON public.organization_members
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR user_id = auth.uid()
    OR public.can_manage_org_users(org_id)
  );

DROP POLICY IF EXISTS om_org_admin_write ON public.organization_members;
CREATE POLICY om_org_admin_write ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR (public.can_manage_org_users(org_id) AND role IS DISTINCT FROM 'developer')
  );

DROP POLICY IF EXISTS om_org_admin_update ON public.organization_members;
CREATE POLICY om_org_admin_update ON public.organization_members
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR (public.can_manage_org_users(org_id) AND role IS DISTINCT FROM 'developer')
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (public.can_manage_org_users(org_id) AND role IS DISTINCT FROM 'developer')
  );

DROP POLICY IF EXISTS om_org_admin_delete ON public.organization_members;
CREATE POLICY om_org_admin_delete ON public.organization_members
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin()
    OR (public.can_manage_org_users(org_id) AND role IS DISTINCT FROM 'developer')
  );

-- Profiles: platform lee todos; usuarios leen compañeros de su org; self update
DROP POLICY IF EXISTS profiles_platform_admin_select ON public.profiles;
CREATE POLICY profiles_platform_admin_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR id = auth.uid()
    OR id IN (
      SELECT m2.user_id
      FROM public.organization_members m1
      JOIN public.organization_members m2 ON m1.org_id = m2.org_id
      WHERE m1.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (
    id = auth.uid()
    OR public.is_platform_admin()
    OR public.can_manage_org_users(
      (SELECT m.org_id FROM public.organization_members m WHERE m.user_id = profiles.id LIMIT 1)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- G) Verificación
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  p.id,
  p.email,
  p.platform_role,
  p.is_approved,
  (SELECT count(*) FROM public.organization_members m WHERE m.user_id = p.id) AS memberships
FROM public.profiles p
WHERE lower(p.email) = lower('henrytaborda57@gmail.com');

SELECT id, name, is_default, version, updated_at
FROM public.platform_client_templates
ORDER BY is_default DESC, id;
