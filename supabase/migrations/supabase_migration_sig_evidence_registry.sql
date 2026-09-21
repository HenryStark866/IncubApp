-- IncubApp - repositorio documental unificado SIG / Mantum
-- Ejecutar antes de scripts/import_sig_evidence.mjs.

create extension if not exists "pgcrypto";

create table if not exists public.sig_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  machine_id uuid references public.machines (id) on delete set null,
  machine_code text,
  source text not null check (source in ('mantum', 'sig', 'incubapp')),
  format_code text,
  title text not null,
  file_name text not null,
  source_path text not null,
  file_path text not null,
  file_type text not null default 'document',
  recorded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, source_path)
);

create index if not exists sig_evidence_org_date_idx
  on public.sig_evidence (org_id, recorded_at desc nulls last);
create index if not exists sig_evidence_machine_idx
  on public.sig_evidence (org_id, machine_id, recorded_at desc nulls last);
create index if not exists sig_evidence_code_idx
  on public.sig_evidence (org_id, machine_code, recorded_at desc nulls last);

insert into storage.buckets (id, name, public)
values ('sig-evidence', 'sig-evidence', false)
on conflict (id) do nothing;

drop policy if exists sig_evidence_storage_select on storage.objects;
create policy sig_evidence_storage_select on storage.objects
  for select using (
    bucket_id = 'sig-evidence'
    and exists (
      select 1
      from public.organization_members m
      where m.org_id = split_part(storage.objects.name, '/', 1)::uuid
        and m.user_id = auth.uid()
    )
  );

alter table public.sig_evidence enable row level security;

drop policy if exists sig_evidence_select on public.sig_evidence;
create policy sig_evidence_select on public.sig_evidence
  for select using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = sig_evidence.org_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.platform_role = 'admin'
    )
  );

drop policy if exists sig_evidence_manage on public.sig_evidence;
create policy sig_evidence_manage on public.sig_evidence
  for all using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = sig_evidence.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'management', 'coordinator')
    )
  ) with check (
    exists (
      select 1 from public.organization_members m
      where m.org_id = sig_evidence.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'management', 'coordinator')
    )
  );

-- El importador usa service_role; estas políticas son para la aplicación autenticada.
