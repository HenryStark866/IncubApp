-- ═══════════════════════════════════════════════════════════════
-- Cumplimiento esperado vs reportado + rondas + racha de uso (bonos)
-- Ejecutar en SQL Editor de Supabase
-- Henry Stark Desarrollador · IncubApp
-- ═══════════════════════════════════════════════════════════════

-- Metas de rendimiento (las pone el coordinador)
create table if not exists public.performance_targets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  labor_key text not null,
  label text,
  expected numeric not null default 0,
  unit text default '',
  role text,
  user_id uuid references auth.users (id) on delete cascade,
  shift_code text,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists performance_targets_org_idx
  on public.performance_targets (org_id, active);

-- Reportes de ronda por turno (mín. 6 por defecto para turneros)
create table if not exists public.round_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  shift_date date not null default ((now() at time zone 'America/Bogota')::date),
  shift_code text default 'T1',
  title text not null,
  body text,
  plant_id uuid,
  room_id uuid,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create index if not exists round_reports_org_user_day_idx
  on public.round_reports (org_id, user_id, shift_date);

-- Completaciones de labor (reportado)
create table if not exists public.labor_completions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  labor_key text not null,
  qty numeric not null default 1,
  success boolean not null default true,
  note text,
  shift_date date not null default ((now() at time zone 'America/Bogota')::date),
  created_at timestamptz not null default now()
);

create index if not exists labor_completions_org_user_day_idx
  on public.labor_completions (org_id, user_id, shift_date);

-- Racha de uso continuo (elegibilidad 90 días)
create table if not exists public.user_usage_streaks (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  first_active_date date not null,
  last_active_date date not null,
  continuous_days int not null default 1,
  total_active_days int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- RLS
alter table public.performance_targets enable row level security;
alter table public.round_reports enable row level security;
alter table public.labor_completions enable row level security;
alter table public.user_usage_streaks enable row level security;

-- policies: miembros de la org
drop policy if exists perf_targets_all on public.performance_targets;
create policy perf_targets_all on public.performance_targets
  for all using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = performance_targets.org_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.org_id = performance_targets.org_id and m.user_id = auth.uid()
    )
  );

drop policy if exists round_reports_all on public.round_reports;
create policy round_reports_all on public.round_reports
  for all using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = round_reports.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.org_id = round_reports.org_id and m.user_id = auth.uid()
    )
  );

drop policy if exists labor_completions_all on public.labor_completions;
create policy labor_completions_all on public.labor_completions
  for all using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = labor_completions.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.org_id = labor_completions.org_id and m.user_id = auth.uid()
    )
  );

drop policy if exists usage_streaks_all on public.user_usage_streaks;
create policy usage_streaks_all on public.user_usage_streaks
  for all using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = user_usage_streaks.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.org_id = user_usage_streaks.org_id and m.user_id = auth.uid()
    )
  );
