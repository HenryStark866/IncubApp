-- =============================================================================
-- MIGRACIÓN: org_modules_realtime (aplicada 2026-07-12 vía MCP apply_migration)
-- PROPÓSITO: Módulos por empresa desde la consola CDH Maker.
--
-- La consola (panel «Módulos por empresa», tab platform-modules) enciende y
-- apaga módulos del catálogo por tenant escribiendo la lista negra
-- organizations.settings.disabled_menu_ids (jsonb). No requiere tablas nuevas:
-- el RLS existente ya permite al admin de plataforma actualizar organizations
-- y escribir custom_modules de cualquier empresa.
--
-- Esta migración solo agrega organizations a la publicación Realtime para que
-- la app del cliente (hook useOrgModuleConfig) reciba el cambio de settings al
-- instante y oculte/muestre el módulo sin recargar sesión.
-- Henry Stark Desarrollador · CDH Maker
-- =============================================================================

alter publication supabase_realtime add table public.organizations;
