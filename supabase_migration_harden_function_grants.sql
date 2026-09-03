-- =============================================================================
-- MIGRACIÓN: harden_function_grants (aplicada 2026-07-12 vía MCP apply_migration)
-- PROPÓSITO: Cerrar los WARN de los advisors de Supabase sobre funciones
-- SECURITY DEFINER expuestas por la API REST (/rest/v1/rpc).
--
-- - touch_customer_last_order(): función de TRIGGER (sales_orders → actualiza
--   customers). Jamás debe llamarse por API. Revocada a anon y authenticated.
--   Verificado: el trigger AFTER INSERT sigue funcionando tras el revoke.
-- - is_org_member(uuid): la usan 4 políticas RLS (sales_remittances,
--   area_inventories, inventory_movements, inventory_area_leads) evaluadas por
--   usuarios logueados → revocada SOLO a anon. NO revocar a authenticated:
--   rompería esas tablas.
-- - signup_companies() queda pública A PROPÓSITO: AuthForm.jsx la llama antes
--   de iniciar sesión (listado de empresas del registro).
-- - El resto de RPCs (admin_set_user_access, create_organization, etc.) son
--   llamadas legítimas de la app autenticada con validaciones internas.
--
-- PENDIENTE (no automatizable por MCP): habilitar «Leaked password protection»
-- en el dashboard de Auth (Settings → Auth → Passwords).
-- Henry Stark Desarrollador · CDH Maker
-- =============================================================================

revoke execute on function public.touch_customer_last_order() from anon, authenticated;

-- is_org_member: la usan políticas RLS de usuarios logueados.
-- Siempre re-conceder a authenticated al endurecer; solo quitar de anon.
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
revoke execute on function public.is_org_member(uuid) from anon;
