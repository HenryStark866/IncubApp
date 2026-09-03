-- ═══════════════════════════════════════════════════════════════
-- Reportes entre silos + asistencia (ingreso/salida con foto)
-- Ejecutar en SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════════════

-- Canal de envío de información / reportes entre perfiles
create table if not exists public.silo_dispatches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  sender_scope text,
  recipient_id uuid references auth.users (id) on delete set null,
  recipient_scope text,
  kind text not null default 'informe'
    check (kind in (
      'informe', 'novedad', 'dato', 'evidencia', 'solicitud', 'otro',
      'purchase_order', 'invoice', 'quotation'
    )),
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  photo_path text,
  status text not null default 'sent'
    check (status in ('sent', 'read', 'verified', 'rejected', 'archived')),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  verify_note text,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- Asistencia: ingreso / salida con foto y GPS
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
        and m.role in ('owner', 'admin', 'management', 'management_auxiliary', 'coordinator', 'supervisor', 'hr_auxiliary')
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

comment on table public.silo_dispatches is
  'Reportes e información enviada entre silos; gerencia usa los verified para informes';
comment on table public.attendance_punches is
  'Marcas de ingreso/salida con foto y GPS obligatorio';
