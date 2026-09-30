-- IncubApp: lista de chequeo y formato SIG de la OT (pantalla del auxiliar de mantenimiento).
-- checklist: [{ id, label, result: ok|fail|na, note }] de la ejecución de una tarea del Plan AM
--   o de un trabajo reportado en el turno; sale en su formato (FOMAT01 / FOMAT04).
-- format_code: formato SIG que llena la OT (FOMAT01 orden de trabajo, FOMAT04 lista de chequeo).
-- La app funciona sin estas columnas (el chequeo queda en «resolution»), pero con ellas el
-- formato trae la tabla de chequeo. Idempotente.
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS checklist jsonb;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS format_code text;
-- Por si la instalación es anterior a supabase_migration_enterprise_sync.sql:
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS maintenance_plan_code text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS technician_name text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS operational_date date;

COMMENT ON COLUMN public.work_orders.checklist IS
  'Lista de chequeo de la ejecución: [{id,label,result(ok|fail|na),note}]';
COMMENT ON COLUMN public.work_orders.format_code IS
  'Formato SIG que llena la OT: FOMAT01 | FOMAT04';
