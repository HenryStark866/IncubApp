-- IncubApp - sincronizacion empresarial de produccion y mantenimiento
-- Ejecutar sobre el proyecto Supabase del tenant IncubApp antes del importador.

create extension if not exists "pgcrypto";

alter table public.work_orders add column if not exists technician_name text;
alter table public.work_orders add column if not exists approver_name text;
alter table public.work_orders add column if not exists approved_by uuid references auth.users (id) on delete set null;
alter table public.work_orders add column if not exists auto_generated boolean default false;
alter table public.work_orders add column if not exists maintenance_plan_code text;

alter table public.machines add column if not exists mantum_code text;
alter table public.machines add column if not exists serial_number text;
alter table public.machines add column if not exists criticidad text default 'Media';

create table if not exists public.maintenance_plan_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  machine_id uuid references public.machines (id) on delete set null,
  machine_code text,
  source_key text not null,
  activity text not null,
  activity_description text,
  maintenance_type text not null default 'preventive',
  frequency_text text,
  frequency_days integer,
  specialty text,
  source text not null default 'mantum',
  active boolean not null default true,
  next_due_date date,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, source_key)
);

create index if not exists maintenance_plan_tasks_due_idx
  on public.maintenance_plan_tasks (org_id, active, next_due_date);
create index if not exists maintenance_plan_tasks_machine_idx
  on public.maintenance_plan_tasks (org_id, machine_id);

alter table public.work_orders add column if not exists operational_date date;
alter table public.work_orders add column if not exists regularized_at timestamptz;
alter table public.work_orders add column if not exists regularization_source text;
alter table public.work_orders add column if not exists regularization_note text;

create table if not exists public.enterprise_data_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  source text not null,
  source_path text not null,
  sheet_name text not null,
  row_number integer not null,
  period text,
  payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (org_id, source_path, sheet_name, row_number)
);

create index if not exists enterprise_snapshots_period_idx
  on public.enterprise_data_snapshots (org_id, source, period, imported_at desc);

alter table public.maintenance_plan_tasks enable row level security;
alter table public.enterprise_data_snapshots enable row level security;

drop policy if exists maintenance_plan_tasks_member on public.maintenance_plan_tasks;
create policy maintenance_plan_tasks_member on public.maintenance_plan_tasks
  for all using (
    exists (select 1 from public.organization_members m where m.org_id = maintenance_plan_tasks.org_id and m.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role = 'admin')
  ) with check (
    exists (select 1 from public.organization_members m where m.org_id = maintenance_plan_tasks.org_id and m.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role = 'admin')
  );

drop policy if exists enterprise_snapshots_member on public.enterprise_data_snapshots;
create policy enterprise_snapshots_member on public.enterprise_data_snapshots
  for all using (
    exists (select 1 from public.organization_members m where m.org_id = enterprise_data_snapshots.org_id and m.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role = 'admin')
  ) with check (
    exists (select 1 from public.organization_members m where m.org_id = enterprise_data_snapshots.org_id and m.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role = 'admin')
  );

-- Idempotencia de OT generadas desde el plan.
create unique index if not exists work_orders_org_plan_code_uidx
  on public.work_orders (org_id, maintenance_plan_code)
  where maintenance_plan_code is not null;

create or replace function public.generate_maintenance_work_orders(
  p_org_id uuid,
  p_until date default ((now() at time zone 'America/Bogota')::date + 30)
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  with due as (
    select t.*
    from public.maintenance_plan_tasks t
    where t.org_id = p_org_id
      and t.active
      and t.next_due_date is not null
      and t.next_due_date <= p_until
  ), created as (
    insert into public.work_orders (
      org_id, plant_id, machine_id, code, title, description, type, priority, status,
      source, scheduled_for, auto_generated, maintenance_plan_code, created_at
    )
    select
      d.org_id,
      m.plant_id,
      d.machine_id,
      'REG-' || substr(md5(d.source_key || ':' || d.next_due_date::text), 1, 16),
      left(coalesce(nullif(trim(d.activity), ''), 'Mantenimiento preventivo') || ' [Mantum]', 160),
      coalesce(d.activity_description, '') || E'\nFuente: ' || d.source || E'\nPlan: ' || d.source_key,
      (case when lower(d.maintenance_type) like '%correct%' then 'corrective' else 'preventive' end)::wo_type,
      'medium', 'open', 'maintenance_plan', d.next_due_date,
      true,
      d.source_key || ':' || d.next_due_date::text,
      now()
    from due d
    left join public.machines m on m.id = d.machine_id
    left join public.plants p on p.id = m.plant_id and p.org_id = d.org_id
    where not exists (
      select 1
      from public.work_orders existing
      where existing.org_id = d.org_id
        and existing.maintenance_plan_code = d.source_key || ':' || d.next_due_date::text
    )
    returning id
  )
  select count(*) into inserted_count from created;

  update public.maintenance_plan_tasks t
  set next_due_date = case
    when t.frequency_days is null then t.next_due_date
    else t.next_due_date + t.frequency_days
  end,
  updated_at = now()
  where t.org_id = p_org_id
    and t.active
    and t.next_due_date is not null
    and t.next_due_date <= p_until
    and t.frequency_days is not null;

  return inserted_count;
end;
$$;

grant execute on function public.generate_maintenance_work_orders(uuid, date) to authenticated;

create or replace function public.regularize_maintenance_work_orders(
  p_org_id uuid,
  p_from date,
  p_until date
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  with occurrences as (
    select
      t.*,
      occurrence_date::date as operational_date
    from public.maintenance_plan_tasks t
    cross join lateral generate_series(
      p_from::timestamp,
      p_until::timestamp,
      (greatest(coalesce(t.frequency_days, 1), 1)::text || ' days')::interval
    ) occurrence_date
    where t.org_id = p_org_id
      and t.active
  ), created as (
    insert into public.work_orders (
      org_id, plant_id, machine_id, code, title, description, type, priority, status,
      source, scheduled_for, completed_at, auto_generated, maintenance_plan_code,
      operational_date, regularized_at, regularization_source, regularization_note, created_at
    )
    select
      o.org_id,
      m.plant_id,
      o.machine_id,
      'REG-' || substr(md5(o.source_key || ':' || o.operational_date::text), 1, 16),
      left(coalesce(nullif(trim(o.activity), ''), 'Mantenimiento preventivo') || ' [Mantum]', 160),
      coalesce(o.activity_description, '') || E'\nFuente: ' || o.source ||
        E'\nPlan: ' || o.source_key || E'\nRegularización de operación ejecutada en planta.',
      (case when lower(o.maintenance_type) like '%correct%' then 'corrective' else 'preventive' end)::wo_type,
      'medium', 'completed', 'maintenance_plan', o.operational_date, o.operational_date,
      true,
      o.source_key || ':' || o.operational_date::text,
      o.operational_date,
      now(),
      'regularizacion_operativa',
      'Fecha operativa reconstruida desde el plan Mantum y el periodo autorizado.',
      now()
    from occurrences o
    left join public.machines m on m.id = o.machine_id
    left join public.plants p on p.id = m.plant_id and p.org_id = o.org_id
    where not exists (
      select 1
      from public.work_orders existing
      where existing.org_id = o.org_id
        and existing.maintenance_plan_code = o.source_key || ':' || o.operational_date::text
    )
    returning id
  )
  select count(*) into inserted_count from created;

  return inserted_count;
end;
$$;

grant execute on function public.regularize_maintenance_work_orders(uuid, date, date) to authenticated;
