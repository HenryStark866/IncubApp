-- ══════════════════════════════════════════════════════════════════
-- Admin de usuarios por empresa: coordinadores (cualquier área),
-- gerencia, owner y admin de org. Solo su tenant. Sin developer.
-- Ejecutar en Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════

-- Helper: ¿el usuario actual puede administrar miembros de esta org?
CREATE OR REPLACE FUNCTION public.can_manage_org_users(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.org_id = p_org
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin', 'management', 'coordinator')
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.platform_role = 'admin'
  );
$$;

COMMENT ON FUNCTION public.can_manage_org_users(uuid) IS
  'Coordinadores, gerencia, owner/admin de org o platform admin pueden gestionar usuarios del tenant.';

-- Aprobar usuario solo si es miembro de una org que el actor administra
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.user_id = p_user
      AND public.can_manage_org_users(m.org_id)
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.platform_role = 'admin'
  ) THEN
    RAISE EXCEPTION 'not allowed';
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

GRANT EXECUTE ON FUNCTION public.can_manage_org_users(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_set_user_approved(uuid, boolean) TO authenticated;

-- Políticas adicionales en organization_members (idempotentes por nombre)
-- Nota: si ya existen políticas más amplias, estas suman WITH CHECK para org managers.

DROP POLICY IF EXISTS org_members_org_admin_select ON public.organization_members;
CREATE POLICY org_members_org_admin_select ON public.organization_members
  FOR SELECT
  USING (public.can_manage_org_users(org_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS org_members_org_admin_insert ON public.organization_members;
CREATE POLICY org_members_org_admin_insert ON public.organization_members
  FOR INSERT
  WITH CHECK (
    public.can_manage_org_users(org_id)
    AND role IS DISTINCT FROM 'developer'
  );

DROP POLICY IF EXISTS org_members_org_admin_update ON public.organization_members;
CREATE POLICY org_members_org_admin_update ON public.organization_members
  FOR UPDATE
  USING (public.can_manage_org_users(org_id) AND role IS DISTINCT FROM 'developer')
  WITH CHECK (
    public.can_manage_org_users(org_id)
    AND role IS DISTINCT FROM 'developer'
  );

DROP POLICY IF EXISTS org_members_org_admin_delete ON public.organization_members;
CREATE POLICY org_members_org_admin_delete ON public.organization_members
  FOR DELETE
  USING (
    public.can_manage_org_users(org_id)
    AND role IS DISTINCT FROM 'developer'
  );
