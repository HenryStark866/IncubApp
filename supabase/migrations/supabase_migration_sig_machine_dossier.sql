-- ═══════════════════════════════════════════════════════════════
-- IncubApp — Migración SIG: Ficha Técnica y Dossier Integral de Máquinas
-- Formatos SIG: FOMAT03 (Hoja de Vida), FOMAT01 (OTs), FOMAT07 (Plan AM),
-- FOMAT08 (Calibraciones), FOMAT04 (Inspecciones de Ronda).
-- Ejecutar en SQL Editor de Supabase. Seguro: ADD COLUMN IF NOT EXISTS.
-- Henry Stark · CDH Maker · 2026
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Columnas técnicas y de auditoría SIG en public.machines ──
alter table public.machines add column if not exists mantum_code text;
alter table public.machines add column if not exists serial_number text;
alter table public.machines add column if not exists acquisition_date date;
alter table public.machines add column if not exists acquisition_value numeric(14, 2);
alter table public.machines add column if not exists supplier text;
alter table public.machines add column if not exists criticidad text default 'Media'; -- Alta / Media / Baja o A / B / C
alter table public.machines add column if not exists useful_life_years numeric(4, 1) default 10.0;
alter table public.machines add column if not exists specs jsonb default '{}'::jsonb;
alter table public.machines add column if not exists sig_notes text;
alter table public.machines add column if not exists oem_manual_url text;

-- Índices para búsqueda rápida por código SIG / Mantum
create index if not exists machines_mantum_code_idx on public.machines (mantum_code);
create index if not exists machines_code_idx on public.machines (code);

-- ── 2. Columnas en public.work_orders para trazabilidad de personal ──
alter table public.work_orders add column if not exists technician_name text;
alter table public.work_orders add column if not exists approver_name text;
alter table public.work_orders add column if not exists approved_by uuid references auth.users (id) on delete set null;
alter table public.work_orders add column if not exists auto_generated boolean default false;
alter table public.work_orders add column if not exists maintenance_plan_code text;

-- ── 3. Vista agregada para auditoría de máquinas: machine_sig_summary ──
create or replace view public.machine_sig_summary as
select
  m.id as machine_id,
  m.org_id,
  m.plant_id,
  m.room_id,
  m.code,
  m.name,
  m.type,
  m.brand,
  m.model,
  m.serial_number,
  m.mantum_code,
  m.criticidad,
  m.status,
  m.installed_at,
  m.acquisition_date,
  m.acquisition_value,
  m.supplier,
  m.specs,
  m.sig_notes,
  p.name as plant_name,
  r.name as room_name,
  r.code as room_code,
  -- Operaciones
  ops.phase as ops_phase,
  ops.lote as ops_lote,
  ops.age_hours as ops_age_hours,
  ops.calib_due as ops_calib_due,
  -- Última calibración
  last_cal.id as last_calib_id,
  last_cal.calibrated_at as last_calib_date,
  last_cal.temp_delta_f as last_calib_temp_delta,
  last_cal.rh_delta_pct as last_calib_rh_delta,
  last_cal.scope as last_calib_scope,
  -- Último chequeo de ronda
  last_chk.taken_at as last_check_date,
  last_chk.condition as last_check_condition,
  -- Conteo de OTs
  coalesce(ot_stat.open_count, 0) as ot_open_count,
  coalesce(ot_stat.in_progress_count, 0) as ot_in_progress_count,
  coalesce(ot_stat.completed_count, 0) as ot_completed_count,
  coalesce(ot_stat.preventive_count, 0) as ot_preventive_count,
  coalesce(ot_stat.corrective_count, 0) as ot_corrective_count
from public.machines m
left join public.plants p on p.id = m.plant_id
left join public.rooms r on r.id = m.room_id
left join public.machine_ops_state ops on ops.machine_id = m.id
left join lateral (
  select * from public.machine_calibrations c
  where c.machine_id = m.id
  order by c.calibrated_at desc limit 1
) last_cal on true
left join lateral (
  select * from public.machine_checks k
  where k.machine_id = m.id
  order by k.taken_at desc limit 1
) last_chk on true
left join lateral (
  select
    count(*) filter (where w.status = 'open') as open_count,
    count(*) filter (where w.status = 'in_progress') as in_progress_count,
    count(*) filter (where w.status = 'completed') as completed_count,
    count(*) filter (where w.type = 'preventive') as preventive_count,
    count(*) filter (where w.type = 'corrective') as corrective_count
  from public.work_orders w
  where w.machine_id = m.id
) ot_stat on true;

-- Permisos sobre la vista
grant select on public.machine_sig_summary to authenticated;
grant select on public.machine_sig_summary to anon;

comment on view public.machine_sig_summary is
  'Resumen consolidado para auditorías SIG: estado, hoja de vida, última calibración, rondas y conteos de OT por máquina.';
