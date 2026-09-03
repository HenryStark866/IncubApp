-- ═══════════════════════════════════════════════════════════════
-- Accesos temporales entre perfiles herméticos
-- Ejecutar en el SQL Editor de Supabase (proyecto IncubApp).
-- ═══════════════════════════════════════════════════════════════

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
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists access_grants_org_idx on public.access_grants (org_id);
create index if not exists access_grants_requester_idx on public.access_grants (requester_id);
create index if not exists access_grants_status_idx on public.access_grants (org_id, status);
create index if not exists access_grants_scope_idx on public.access_grants (org_id, scope, status);

alter table public.access_grants enable row level security;

-- Lectura: miembros de la misma org (para ver pendientes del silo / propias)
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

-- Insertar solicitud: solo como requester propio
drop policy if exists access_grants_insert on public.access_grants;
create policy access_grants_insert on public.access_grants
  for insert with check (
    requester_id = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.org_id = access_grants.org_id and m.user_id = auth.uid()
    )
  );

-- Update: requester (cancelar) o cualquier miembro de la org (aprobar/denegar)
-- La app valida en cliente que solo grantors del dominio aprueben;
-- el admin de plataforma también puede.
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

-- Realtime (opcional; habilitar en dashboard si no está)
-- alter publication supabase_realtime add table public.access_grants;

comment on table public.access_grants is
  'Solicitudes y grants temporales entre silos herméticos de roles/áreas';
