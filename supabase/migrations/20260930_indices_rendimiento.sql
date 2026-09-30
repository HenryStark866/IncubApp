-- IncubApp: índices para las consultas de los tableros (30-09-2026).
-- Con 76 mil OT (el historial regularizado de Mántum) y las fotos de ronda, las consultas
-- «de la empresa, las más recientes primero» ordenaban toda la tabla y en el cambio de
-- turno pasaban el límite de 8 s de la base (errores 500 y «Algunos datos no cargaron»).
-- Idempotente; solo crea índices, no cambia datos.
CREATE INDEX IF NOT EXISTS work_orders_org_created_idx
  ON public.work_orders (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS work_orders_org_status_idx
  ON public.work_orders (org_id, status);
CREATE INDEX IF NOT EXISTS work_orders_org_completed_idx
  ON public.work_orders (org_id, completed_at DESC)
  WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS machine_checks_org_taken_idx
  ON public.machine_checks (org_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS shift_activities_org_assigned_idx
  ON public.shift_activities (org_id, assigned_to, status);
ANALYZE public.work_orders;
ANALYZE public.machine_checks;
