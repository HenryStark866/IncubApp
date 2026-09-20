-- ═══════════════════════════════════════════════════════════════
-- IncubApp — Calibración de sensores (T°F / HR%) + estado operativo
-- de máquinas + backfill de ciclo. Ejecutar en SQL Editor de Supabase.
-- Seguro: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- Henry Stark · CDH Maker · Julio 2026
-- ═══════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── 1. Calibraciones de sensores (humedad % / temperatura °F) ──
create table if not exists public.machine_calibrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  plant_id uuid references public.plants (id) on delete set null,
  machine_id uuid not null references public.machines (id) on delete cascade,
  work_order_id uuid references public.work_orders (id) on delete set null,
  performed_by uuid not null references auth.users (id) on delete cascade,
  -- temperature | humidity | both
  scope text not null default 'both'
    check (scope in ('temperature', 'humidity', 'both')),
  reason text, -- inc_window | post_hatch | pre_transfer | manual
  -- Lecturas: máquina (pantalla) vs calibrador
  temp_machine_f numeric(6, 2),
  temp_calibrator_f numeric(6, 2),
  temp_delta_f numeric(6, 2),
  rh_machine_pct numeric(6, 2),
  rh_calibrator_pct numeric(6, 2),
  rh_delta_pct numeric(6, 2),
  notes text,
  -- Evidencias en Storage (bucket wo-evidence o machine-checks)
  photo_calibrator_path text,
  photo_screen_path text,
  calibrated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists machine_calibrations_org_idx
  on public.machine_calibrations (org_id, calibrated_at desc);
create index if not exists machine_calibrations_machine_idx
  on public.machine_calibrations (machine_id, calibrated_at desc);
create index if not exists machine_calibrations_user_idx
  on public.machine_calibrations (performed_by, calibrated_at desc);
create index if not exists machine_calibrations_wo_idx
  on public.machine_calibrations (work_order_id);

alter table public.machine_calibrations enable row level security;

drop policy if exists machine_calibrations_select on public.machine_calibrations;
create policy machine_calibrations_select on public.machine_calibrations
  for select using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = machine_calibrations.org_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  );

drop policy if exists machine_calibrations_insert on public.machine_calibrations;
create policy machine_calibrations_insert on public.machine_calibrations
  for insert with check (
    performed_by = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.org_id = machine_calibrations.org_id and m.user_id = auth.uid()
    )
  );

drop policy if exists machine_calibrations_update on public.machine_calibrations;
create policy machine_calibrations_update on public.machine_calibrations
  for update using (
    performed_by = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = machine_calibrations.org_id
        and m.user_id = auth.uid()
        and m.role in (
          'owner', 'admin', 'supervisor', 'coordinator',
          'management', 'management_auxiliary'
        )
    )
  );

drop policy if exists machine_calibrations_delete on public.machine_calibrations;
create policy machine_calibrations_delete on public.machine_calibrations
  for delete using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = machine_calibrations.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ── 2. Estado operativo denormalizado por máquina ─────────────
-- Se recalcula desde setter_loads / transfers / hatch_events (cronología real).
create table if not exists public.machine_ops_state (
  machine_id uuid primary key references public.machines (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  plant_id uuid references public.plants (id) on delete set null,
  room_id uuid,
  -- idle | incubating | calib_window | transfer_ready | in_hatcher | hatching | completed | unknown
  phase text not null default 'idle',
  machine_status text, -- sugerido: active | idle | maintenance
  lote text,
  batch_id uuid,
  cycle_start_at timestamptz,
  loaded_at timestamptz,
  age_hours numeric(10, 2),
  age_label text,
  last_load_id uuid,
  last_transfer_id uuid,
  last_hatch_id uuid,
  incubable_eggs int,
  estimated_chicks int,
  calib_due boolean not null default false,
  calib_reason text,
  timeline jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  computed_by uuid references auth.users (id) on delete set null,
  notes text,
  updated_at timestamptz not null default now()
);

create index if not exists machine_ops_state_org_idx
  on public.machine_ops_state (org_id, phase);
create index if not exists machine_ops_state_plant_idx
  on public.machine_ops_state (plant_id);
create index if not exists machine_ops_state_lote_idx
  on public.machine_ops_state (org_id, lote);

alter table public.machine_ops_state enable row level security;

drop policy if exists machine_ops_state_select on public.machine_ops_state;
create policy machine_ops_state_select on public.machine_ops_state
  for select using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = machine_ops_state.org_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  );

drop policy if exists machine_ops_state_upsert on public.machine_ops_state;
create policy machine_ops_state_upsert on public.machine_ops_state
  for all using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = machine_ops_state.org_id
        and m.user_id = auth.uid()
        and m.role in (
          'owner', 'admin', 'supervisor', 'coordinator',
          'management', 'management_auxiliary'
        )
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.org_id = machine_ops_state.org_id
        and m.user_id = auth.uid()
        and m.role in (
          'owner', 'admin', 'supervisor', 'coordinator',
          'management', 'management_auxiliary'
        )
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  );

-- ── 3. Columnas útiles en machines (resumen visible en planta) ─
alter table public.machines add column if not exists current_lote text;
alter table public.machines add column if not exists current_phase text;
alter table public.machines add column if not exists cycle_start_at timestamptz;
alter table public.machines add column if not exists last_calib_at timestamptz;
alter table public.machines add column if not exists last_calib_scope text;
alter table public.machines add column if not exists ops_synced_at timestamptz;

-- ── 4. Backfill: cycle_start_at = loaded_at cuando falte ───────
update public.setter_loads
set cycle_start_at = loaded_at
where cycle_start_at is null and loaded_at is not null;

-- ── 5. Ampliar source de work_orders si hay CHECK restrictivo ──
do $$
begin
  alter table public.work_orders drop constraint if exists work_orders_source_check;
exception when others then null;
end $$;

-- source libre (incident, calibration, manual, system…)
comment on column public.work_orders.source is
  'Origen: incident | calibration | manual | system | null';

comment on table public.machine_calibrations is
  'Calibración de sensores: temperatura °F y/o humedad % con evidencias fotográficas.';
comment on table public.machine_ops_state is
  'Estado operativo calculado desde cargues/transferencias/nacimientos (cronología).';
