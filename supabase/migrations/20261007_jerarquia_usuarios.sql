-- =============================================================================
-- IncubApp · Jerarquía para administrar personas · 07-10-2026
-- Hasta hoy cualquier líder de área podía revocar, quitar o cambiar el rol de
-- cualquiera de la empresa (incluida gerencia). Ahora, igual que la contraseña
-- temporal (20260930_admin_set_password_por_area):
--   - owner/admin: a todos;
--   - gerencia: a todos menos owner, admin y otra gerencia;
--   - líder de área: solo a la gente de rango menor de SU área (el líder «General»: a toda
--     la de rango menor, como en 20261007_admin_set_password_lider_general), y al recién creado
--     (operario de área «general», como entra al crearlo) que todavía debe ubicar.
-- Y nadie asigna un cargo por encima del suyo. Nadie se quita ni se revoca a sí mismo.
-- La app aplica la misma regla (src/lib/passwordScope.js). Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.incubapp_can_manage_member(p_org uuid, p_target_role text, p_target_area text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members c
    WHERE c.org_id = p_org
      AND c.user_id = auth.uid()
      AND (
        c.role::text IN ('owner', 'admin')
        OR (c.role::text = 'management' AND p_target_role NOT IN ('owner', 'admin', 'management'))
        OR (c.role::text = 'coordinator'
            AND p_target_role NOT IN ('owner', 'admin', 'management', 'coordinator')
            AND (public.incubapp_area_norm(c.area::text) = 'general'
                 OR public.incubapp_same_area(c.area::text, p_target_area, p_target_role)
                 OR (p_target_role = 'operator' AND COALESCE(p_target_area, 'general') = 'general')))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.incubapp_can_grant_role(p_org uuid, p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_role <> 'developer' AND EXISTS (
    SELECT 1
    FROM public.organization_members c
    WHERE c.org_id = p_org
      AND c.user_id = auth.uid()
      AND (
        c.role::text = 'owner'
        OR (c.role::text = 'admin' AND p_role <> 'owner')
        OR (c.role::text = 'management' AND p_role NOT IN ('owner', 'admin'))
        OR (c.role::text = 'coordinator' AND p_role NOT IN ('owner', 'admin', 'management', 'coordinator'))
      )
  )
$$;

REVOKE ALL ON FUNCTION public.incubapp_can_manage_member(uuid, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.incubapp_can_grant_role(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incubapp_can_manage_member(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incubapp_can_grant_role(uuid, text) TO authenticated;

-- Políticas de la gestión de miembros por la empresa (las de plataforma no cambian)
DROP POLICY IF EXISTS org_members_org_admin_insert ON public.organization_members;
CREATE POLICY org_members_org_admin_insert ON public.organization_members
  FOR INSERT
  WITH CHECK (
    public.can_manage_org_users(org_id)
    AND role IS DISTINCT FROM 'developer'
    AND public.incubapp_can_grant_role(org_id, role::text)
  );

DROP POLICY IF EXISTS org_members_org_admin_update ON public.organization_members;
CREATE POLICY org_members_org_admin_update ON public.organization_members
  FOR UPDATE
  USING (
    public.can_manage_org_users(org_id)
    AND role IS DISTINCT FROM 'developer'
    AND public.incubapp_can_manage_member(org_id, role::text, area::text)
  )
  WITH CHECK (
    public.can_manage_org_users(org_id)
    AND role IS DISTINCT FROM 'developer'
    AND public.incubapp_can_grant_role(org_id, role::text)
  );

DROP POLICY IF EXISTS org_members_org_admin_delete ON public.organization_members;
CREATE POLICY org_members_org_admin_delete ON public.organization_members
  FOR DELETE
  USING (
    public.can_manage_org_users(org_id)
    AND role IS DISTINCT FROM 'developer'
    AND user_id <> auth.uid()
    AND public.incubapp_can_manage_member(org_id, role::text, area::text)
  );

-- Aprobar / revocar el acceso: misma regla, y nunca a sí mismo
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
  IF p_user = auth.uid() THEN
    RAISE EXCEPTION 'No puede aprobar ni revocar su propio acceso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.user_id = p_user
      AND public.can_manage_org_users(m.org_id)
      AND public.incubapp_can_manage_member(m.org_id, m.role::text, m.area::text)
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.platform_role = 'admin'
  ) THEN
    RAISE EXCEPTION 'No tiene rango para cambiar el acceso de esta persona: solo el de personas de menor rango' USING ERRCODE = '42501';
  END IF;
  -- No tocar cuentas de plataforma
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user AND p.platform_role = 'admin'
  ) THEN
    RAISE EXCEPTION 'cannot modify platform staff';
  END IF;
  UPDATE public.profiles
  SET is_approved = COALESCE(p_approved, is_approved)
  WHERE id = p_user;
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_set_user_approved(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
