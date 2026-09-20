-- ═══════════════════════════════════════════════════════════════
-- IncubApp — Tablas core que suelen faltar (bandeja + asistencia + accesos + bonos)
-- Ejecutar TODO este archivo en SQL Editor de Supabase (una sola vez).
-- Seguro: usa IF NOT EXISTS y recrea políticas.
-- Henry Stark Desarrollador · Julio 2026
-- ═══════════════════════════════════════════════════════════════

-- Extensión UUID (si no está)
create extension if not exists "pgcrypto";

-- ── 1. Bandeja gerencial / reportes entre módulos ─────────────
create table if not exists public.silo_dispatches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  sender_scope text,
  recipient_id uuid references auth.users (id) on delete set null,
  recipient_scope text,
  kind text not null default 'informe',
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  photo_path text,
  status text not null default 'sent',
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  verify_note text,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ampliar kinds/status si la tabla ya existía con CHECK estricto
do $$
begin
  alter table public.silo_dispatches drop constraint if exists silo_dispatches_kind_check;
  alter table public.silo_dispatches drop constraint if exists silo_dispatches_status_check;
exception when others then null;
end $$;

alter table public.silo_dispatches
  drop constraint if exists silo_dispatches_kind_check;
alter table public.silo_dispatches
  add constraint silo_dispatches_kind_check check (kind in (
    'informe', 'novedad', 'dato', 'evidencia', 'solicitud', 'otro',
    'purchase_order', 'invoice', 'quotation'
  ));

alter table public.silo_dispatches
  drop constraint if exists silo_dispatches_status_check;
alter table public.silo_dispatches
  add constraint silo_dispatches_status_check check (status in (
    'sent', 'read', 'verified', 'rejected', 'archived'
  ));

create index if not exists silo_dispatches_org_idx on public.silo_dispatches (org_id, created_at desc);
create index if not exists silo_dispatches_recipient_idx on public.silo_dispatches (recipient_id, status);
create index if not exists silo_dispatches_sender_idx on public.silo_dispatches (sender_id);
create index if not exists silo_dispatches_status_idx on public.silo_dispatches (org_id, status);

alter table public.silo_dispatches enable row level security;

drop policy if exists silo_dispatches_select on public.silo_dispatches;
create policy silo_dispatches_select on public.silo_dispatches
  for select using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = silo_dispatches.org_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  );

drop policy if exists silo_dispatches_insert on public.silo_dispatches;
create policy silo_dispatches_insert on public.silo_dispatches
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.org_id = silo_dispatches.org_id and m.user_id = auth.uid()
    )
  );

drop policy if exists silo_dispatches_update on public.silo_dispatches;
create policy silo_dispatches_update on public.silo_dispatches
  for update using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = silo_dispatches.org_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  );

-- ── 2. Asistencia ────────────────────────────────────────────
create table if not exists public.attendance_punches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  punch_type text not null check (punch_type in ('in', 'out')),
  punched_at timestamptz not null default now(),
  photo_path text not null,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  device_note text,
  shift_date date not null default ((now() at time zone 'America/Bogota')::date),
  created_at timestamptz not null default now()
);

create index if not exists attendance_punches_org_user_idx
  on public.attendance_punches (org_id, user_id, punched_at desc);
create index if not exists attendance_punches_date_idx
  on public.attendance_punches (org_id, shift_date);

alter table public.attendance_punches enable row level security;

drop policy if exists attendance_punches_select on public.attendance_punches;
create policy attendance_punches_select on public.attendance_punches
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = attendance_punches.org_id
        and m.user_id = auth.uid()
        and m.role in (
          'owner', 'admin', 'management', 'management_auxiliary',
          'coordinator', 'supervisor', 'hr_auxiliary'
        )
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  );

drop policy if exists attendance_punches_insert on public.attendance_punches;
create policy attendance_punches_insert on public.attendance_punches
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.org_id = attendance_punches.org_id and m.user_id = auth.uid()
    )
  );

-- ── 3. Accesos temporales entre módulos ──────────────────────
create table if not exists public.access_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  scope text not null,
  requester_id uuid not null references auth.users (id) on delete cascade,
  grantor_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'revoked', 'expired')),
  reason text,
  decide_note text,
  hours int not null default 8,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz
);

create index if not exists access_grants_org_idx on public.access_grants (org_id, status);
create index if not exists access_grants_requester_idx on public.access_grants (requester_id, status);

alter table public.access_grants enable row level security;

drop policy if exists access_grants_select on public.access_grants;
create policy access_grants_select on public.access_grants
  for select using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = access_grants.org_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  );

drop policy if exists access_grants_insert on public.access_grants;
create policy access_grants_insert on public.access_grants
  for insert with check (
    requester_id = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.org_id = access_grants.org_id and m.user_id = auth.uid()
    )
  );

drop policy if exists access_grants_update on public.access_grants;
create policy access_grants_update on public.access_grants
  for update using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = access_grants.org_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  );

-- ── 4. Cumplimiento / bonos ───────────────────────────────────
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

alter table public.performance_targets enable row level security;
alter table public.round_reports enable row level security;
alter table public.labor_completions enable row level security;
alter table public.user_usage_streaks enable row level security;

drop policy if exists perf_targets_all on public.performance_targets;
create policy perf_targets_all on public.performance_targets
  for all using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = performance_targets.org_id and m.user_id = auth.uid()
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

-- ── 5. Notificaciones (si no existen) ────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  body text,
  kind text default 'general',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_org_idx
  on public.notifications (org_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = notifications.org_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  );

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert with check (
    exists (
      select 1 from public.organization_members m
      where m.org_id = notifications.org_id and m.user_id = auth.uid()
    )
  );

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  );

comment on table public.silo_dispatches is 'Bandeja gerencial: OC, facturas, cotizaciones, informes entre módulos';
comment on table public.attendance_punches is 'Asistencia ingreso/salida con selfie';
comment on table public.access_grants is 'Accesos temporales entre módulos herméticos';
