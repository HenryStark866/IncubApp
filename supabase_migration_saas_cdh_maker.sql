-- =============================================================================
-- CDH Maker SaaS multi-tenant
-- - Software 100 % propiedad de CDH Maker
-- - Clientes (p. ej. Incubant / Antioqueña de Incubación SAS) conservan sus datos
-- - Sin permisos de desarrollo del SaaS en usuarios de empresas cliente
-- - Aislamiento: membership por org; RLS debe filtrar por org_id
-- Ejecutar en SQL Editor de Supabase (como service / owner del proyecto)
-- =============================================================================

-- 1) Quitar rol de org "developer" en empresas cliente → admin de empresa
--    (developer era mal usado como "desarrollador de la app")
UPDATE public.organization_members
SET role = 'admin'
WHERE role = 'developer';

-- 2) Etiquetas conceptuales (comentarios)
COMMENT ON TABLE public.organizations IS
  'Tenants del SaaS CDH Maker. Cada fila es una empresa cliente. Datos aislados por org_id.';

COMMENT ON TABLE public.organization_members IS
  'Membresías multi-tenant. Un usuario puede pertenecer a varias orgs con roles distintos. '
  'Roles owner/admin = gobierno de la EMPRESA cliente, no del SaaS. '
  'Admin del SaaS = profiles.platform_role = admin.';

COMMENT ON COLUMN public.profiles.platform_role IS
  'Solo personal CDH Maker: admin = omnisciente SaaS. NUNCA asignar a usuarios solo-cliente.';

-- 3) Opcional: columna brand_key para white-label explícito (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'brand_key'
  ) THEN
    ALTER TABLE public.organizations
      ADD COLUMN brand_key text NULL;
    COMMENT ON COLUMN public.organizations.brand_key IS
      'Clave de marca white-label (ej. incubant). NULL = identidad CDH Maker + nombre org.';
  END IF;
END $$;

-- 4) Marcar Incubant / Antioqueña si el slug o nombre coincide (conserva datos)
UPDATE public.organizations
SET brand_key = 'incubant'
WHERE brand_key IS NULL
  AND (
    lower(coalesce(slug, '')) ~ 'incubant|antioquen'
    OR lower(coalesce(name, '')) ~ 'incubant|antioque'
  );

-- 5) Recordatorio de seguridad (no cambia políticas; verifica que existan)
-- Todas las tablas de negocio deben tener RLS con:
--   org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
-- y is_platform_admin() solo para lecturas cross-tenant del admin SaaS.
-- Si alguna tabla carece de RLS, CREAR política antes de producción multi-cliente.

SELECT
  o.id,
  o.name,
  o.slug,
  o.brand_key,
  (SELECT count(*) FROM public.organization_members m WHERE m.org_id = o.id) AS members
FROM public.organizations o
ORDER BY o.created_at NULLS LAST;
