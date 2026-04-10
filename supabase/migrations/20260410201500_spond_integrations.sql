-- Spond integration foundation (phase 2)

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  status text not null default 'connected',
  account_label text,
  credentials_encrypted text not null,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_connections_provider_check check (provider in ('spond')),
  constraint integration_connections_status_check check (status in ('connected', 'error', 'disconnected')),
  constraint integration_connections_user_provider_unique unique (user_id, provider)
);

create table if not exists public.external_team_links (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  provider text not null,
  external_team_id text not null,
  external_team_name text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint external_team_links_provider_check check (provider in ('spond')),
  constraint external_team_links_team_provider_unique unique (team_id, provider)
);

create unique index if not exists idx_external_team_links_provider_external_team_id_unique
  on public.external_team_links(provider, external_team_id);

drop trigger if exists set_integration_connections_updated_at on public.integration_connections;
create trigger set_integration_connections_updated_at
before update on public.integration_connections
for each row
execute function public.set_updated_at();

alter table public.integration_connections enable row level security;
alter table public.external_team_links enable row level security;

-- Integration connections policies

drop policy if exists "integration_connections_select_own" on public.integration_connections;
create policy "integration_connections_select_own"
on public.integration_connections
for select
using (user_id = auth.uid());

drop policy if exists "integration_connections_insert_own" on public.integration_connections;
create policy "integration_connections_insert_own"
on public.integration_connections
for insert
with check (user_id = auth.uid());

drop policy if exists "integration_connections_update_own" on public.integration_connections;
create policy "integration_connections_update_own"
on public.integration_connections
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "integration_connections_delete_own" on public.integration_connections;
create policy "integration_connections_delete_own"
on public.integration_connections
for delete
using (user_id = auth.uid());

-- Team links policies

drop policy if exists "external_team_links_select_member" on public.external_team_links;
create policy "external_team_links_select_member"
on public.external_team_links
for select
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = external_team_links.team_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "external_team_links_insert_member" on public.external_team_links;
create policy "external_team_links_insert_member"
on public.external_team_links
for insert
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = external_team_links.team_id
      and tm.user_id = auth.uid()
  )
  and created_by = auth.uid()
);

drop policy if exists "external_team_links_update_member" on public.external_team_links;
create policy "external_team_links_update_member"
on public.external_team_links
for update
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = external_team_links.team_id
      and tm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = external_team_links.team_id
      and tm.user_id = auth.uid()
  )
  and created_by = auth.uid()
);

drop policy if exists "external_team_links_delete_member" on public.external_team_links;
create policy "external_team_links_delete_member"
on public.external_team_links
for delete
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = external_team_links.team_id
      and tm.user_id = auth.uid()
  )
);
