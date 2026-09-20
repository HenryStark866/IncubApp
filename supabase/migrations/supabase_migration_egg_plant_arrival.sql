-- ═══════════════════════════════════════════════════════════════
-- Reporte de llegada de huevo a planta (sello + foto)
-- Ejecutar en Supabase → SQL Editor
-- Henry Stark · CDH Maker
-- ═══════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create table if not exists public.egg_plant_arrivals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  seal_number text not null,
  photo_path text not null,
  notes text,
  vehicle_plate text,
  farm_hint text,
  arrived_at timestamptz not null default now(),
  reported_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists egg_plant_arrivals_org_idx
  on public.egg_plant_arrivals (org_id, arrived_at desc);
create index if not exists egg_plant_arrivals_seal_idx
  on public.egg_plant_arrivals (org_id, seal_number);

alter table public.egg_plant_arrivals enable row level security;

drop policy if exists egg_plant_arrivals_select on public.egg_plant_arrivals;
create policy egg_plant_arrivals_select on public.egg_plant_arrivals
  for select using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = egg_plant_arrivals.org_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  );

drop policy if exists egg_plant_arrivals_insert on public.egg_plant_arrivals;
create policy egg_plant_arrivals_insert on public.egg_plant_arrivals
  for insert with check (
    reported_by = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.org_id = egg_plant_arrivals.org_id and m.user_id = auth.uid()
    )
  );

drop policy if exists egg_plant_arrivals_update on public.egg_plant_arrivals;
create policy egg_plant_arrivals_update on public.egg_plant_arrivals
  for update using (
    reported_by = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = egg_plant_arrivals.org_id
        and m.user_id = auth.uid()
        and m.role in (
          'owner', 'admin', 'supervisor', 'coordinator',
          'management', 'reception_operator'
        )
    )
  );

comment on table public.egg_plant_arrivals is
  'Llegada de huevo a planta: foto + número de sello del sello/precinto.';
