-- Plantilla de menú/módulos al crear empresa (settings JSON)
-- La app escribe settings con menu_template_id = incubant_ops_v1

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.settings IS
  'Config del tenant: menu_template_id, enabled_domains, enabled_menu_ids (plantilla Incubant por defecto). No contiene datos operativos copiados.';

-- Empresas existentes sin plantilla: marcar como plantilla Incubant (solo metadata)
UPDATE public.organizations
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
  'menu_template_id', 'incubant_ops_v1',
  'menu_template_name', 'Operación incubación / granja (Incubant)',
  'source', 'backfill_existing'
)
WHERE settings IS NULL
   OR settings = '{}'::jsonb
   OR NOT (settings ? 'menu_template_id');
