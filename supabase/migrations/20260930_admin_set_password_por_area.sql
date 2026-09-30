-- IncubApp: cada líder de área solo asigna contraseñas a SU gente (30-09-2026).
-- Antes (20260929_admin_set_password_lideres.sql) un líder (coordinator) podía cambiar la
-- contraseña de cualquier persona de rango menor de la empresa, aunque fuera de otra área.
-- Regla nueva para el líder: la persona es de rango menor y además
--   · es de su misma área (organization_members.area; hse cuenta como sst y
--     sales_logistics como ventas o logística), o
--   · no tiene área asignada (general / vacía) y su cargo es de los que dependen de esa
--     área (p. ej. operario y auxiliar de turno → planta; conductor → logística).
-- owner/admin y gerencia siguen igual. La contraseña que asigna el líder queda lista
-- para entrar: no se obliga a cambiarla al ingresar.
-- Idempotente: se puede aplicar varias veces.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Área normalizada (legacy → actual).
CREATE OR REPLACE FUNCTION public.incubapp_area_norm(p_area text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE coalesce(nullif(trim(p_area), ''), 'general')
    WHEN 'hse' THEN 'sst'
    ELSE coalesce(nullif(trim(p_area), ''), 'general')
  END
$$;

-- ¿El cargo depende del área del líder? (mismo mapa que COORD_AUXILIARIES en src/lib/roles.js,
-- más el personal de turno de planta).
CREATE OR REPLACE FUNCTION public.incubapp_role_in_area(p_role text, p_area text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_role = ANY (CASE public.incubapp_area_norm(p_area)
    WHEN 'plant' THEN ARRAY['operator', 'auxiliary', 'auxiliary_production', 'supervisor',
                            'reception_operator', 'vaccination_auxiliary', 'plant_veterinarian']
    WHEN 'maintenance' THEN ARRAY['maintenance_auxiliary']
    WHEN 'sst' THEN ARRAY['sst_auxiliary', 'hse_auxiliary']
    WHEN 'environmental' THEN ARRAY['environmental_auxiliary']
    WHEN 'hr' THEN ARRAY['hr_auxiliary']
    WHEN 'accounting' THEN ARRAY['accounting_auxiliary']
    WHEN 'sales' THEN ARRAY['sales_logistics_auxiliary']
    WHEN 'logistics' THEN ARRAY['logistics_auxiliary', 'driver']
    WHEN 'sales_logistics' THEN ARRAY['sales_logistics_auxiliary', 'logistics_auxiliary', 'driver']
    WHEN 'quality' THEN ARRAY['auxiliary_production']
    WHEN 'farm' THEN ARRAY['barn_operator', 'vaccination_auxiliary']
    WHEN 'veterinary' THEN ARRAY['vaccination_auxiliary', 'plant_veterinarian']
    WHEN 'management' THEN ARRAY['management_auxiliary']
    ELSE ARRAY[]::text[]
  END)
$$;

-- ¿La persona es del área del líder?
CREATE OR REPLACE FUNCTION public.incubapp_same_area(p_leader_area text, p_target_area text, p_target_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.incubapp_area_norm(p_leader_area) = 'general' THEN false
    WHEN public.incubapp_area_norm(p_target_area) = public.incubapp_area_norm(p_leader_area) THEN true
    WHEN public.incubapp_area_norm(p_leader_area) = 'sales_logistics'
         AND public.incubapp_area_norm(p_target_area) IN ('sales', 'logistics') THEN true
    WHEN public.incubapp_area_norm(p_leader_area) IN ('sales', 'logistics')
         AND public.incubapp_area_norm(p_target_area) = 'sales_logistics' THEN true
    WHEN public.incubapp_area_norm(p_target_area) = 'general'
         AND public.incubapp_role_in_area(p_target_role, p_leader_area) THEN true
    ELSE false
  END
$$;

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
              AND target_m.role NOT IN ('owner', 'admin', 'management', 'coordinator')
              AND public.incubapp_same_area(admin_m.area::text, target_m.area::text, target_m.role::text))
        )
    ) INTO v_allowed;
    IF v_allowed AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND platform_role = 'admin') THEN
      v_allowed := false;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar la contraseña de este usuario: solo la de las personas de tu área' USING ERRCODE = '42501';
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
