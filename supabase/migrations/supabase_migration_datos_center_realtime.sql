-- =============================================================================
-- MIGRACIÓN: datos_center_realtime_and_triggers (aplicada 2026-07-12 vía MCP)
-- PROPÓSITO: Que las tablas nuevas del módulo Datos / clasificación propaguen
-- sus actualizaciones en vivo y no queden con updated_at viejo.
--
-- 1) Publicación Realtime: los hooks (useIncubationLots, useLoadClassification,
--    useOrgModuleConfig) se suscriben por postgres_changes, pero estas tablas
--    no estaban en supabase_realtime → los eventos jamás llegaban y los paneles
--    de gerencia/recepción/cargue no se refrescaban entre dispositivos.
--    Todas tienen PK (replica identity default), por lo que publicar UPDATEs
--    no rompe los updates (no aplica el error 55000 de replica identity).
-- 2) Triggers de updated_at con private.set_updated_at() (mismo patrón que
--    organizations y custom_modules) en incubation_lots y classification_orders.
-- Henry Stark Desarrollador · CDH Maker
-- =============================================================================

alter publication supabase_realtime add table public.incubation_lots;
alter publication supabase_realtime add table public.lot_arrivals;
alter publication supabase_realtime add table public.classification_orders;
alter publication supabase_realtime add table public.egg_tape_classifications;
alter publication supabase_realtime add table public.load_maps;

create trigger trg_incubation_lots_updated_at
  before update on public.incubation_lots
  for each row execute function private.set_updated_at();

create trigger trg_classification_orders_updated_at
  before update on public.classification_orders
  for each row execute function private.set_updated_at();
