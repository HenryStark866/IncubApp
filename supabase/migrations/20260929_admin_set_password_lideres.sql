-- IncubApp: los líderes de área y gerencia también asignan contraseñas temporales.
-- Motivo (29-09-2026): el panel de usuarios de la empresa se muestra a quien pasa
-- canManageOrgUsers (coordinator, management, owner, admin), pero la función solo dejaba
-- a owner/admin; el líder veía el botón «Contraseña» y recibía «No tienes permiso».
-- Regla: solo se cambia la de alguien de la MISMA empresa y de rango menor:
--   owner/admin → cualquier miembro · management → todos menos owner/admin/management ·
--   coordinator → todos menos owner/admin/management/coordinator.
-- Nadie de una empresa puede cambiar la de un administrador de plataforma.
-- Idempotente: se puede aplicar varias veces.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.admin_set_user_password(p_user_id uuid, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_allowed boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sesión inválida' USING ERRCODE = '42501';
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'La contraseña temporal debe tener al menos 8 caracteres' USING ERRCODE = '22023';
  END IF;
  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'Para tu propia contraseña usa Perfil → Cambiar contraseña' USING ERRCODE = '22023';
  END IF;

  IF public.is_platform_admin() THEN
    v_allowed := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_members admin_m
      JOIN public.organization_members target_m ON target_m.org_id = admin_m.org_id
      WHERE admin_m.user_id = v_caller
        AND target_m.user_id = p_user_id
        AND (
          admin_m.role IN ('owner', 'admin')
          OR (admin_m.role = 'management'
              AND target_m.role NOT IN ('owner', 'admin', 'management'))
          OR (admin_m.role = 'coordinator'
              AND target_m.role NOT IN ('owner', 'admin', 'management', 'coordinator'))
        )
    ) INTO v_allowed;
    IF v_allowed AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND platform_role = 'admin') THEN
      v_allowed := false;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar la contraseña de este usuario' USING ERRCODE = '42501';
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario no existe' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_password(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text) TO authenticated;
