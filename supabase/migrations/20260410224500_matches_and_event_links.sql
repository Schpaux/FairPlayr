-- Phase 3: internal match planning and optional Spond event import links.

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null,
  opponent_name text,
  starts_at timestamptz not null,
  location text,
  status text not null default 'upcoming',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_status_check check (status in ('draft', 'upcoming', 'live', 'completed'))
);

create index if not exists idx_matches_team_id on public.matches(team_id);
create index if not exists idx_matches_team_id_starts_at on public.matches(team_id, starts_at);

drop trigger if exists set_matches_updated_at on public.matches;
create trigger set_matches_updated_at
before update on public.matches
for each row
execute function public.set_updated_at();

create table if not exists public.external_event_links (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  external_team_id text,
  external_event_name text,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint external_event_links_provider_check check (provider in ('spond')),
  constraint external_event_links_match_provider_unique unique (match_id, provider),
  constraint external_event_links_team_event_unique unique (team_id, provider, external_event_id)
);

create index if not exists idx_external_event_links_match_id on public.external_event_links(match_id);
create index if not exists idx_external_event_links_provider_event_id on public.external_event_links(provider, external_event_id);

alter table public.matches enable row level security;
alter table public.external_event_links enable row level security;

-- Matches policies

drop policy if exists "matches_select_member" on public.matches;
create policy "matches_select_member"
on public.matches
for select
using (public.is_team_member(team_id));

drop policy if exists "matches_insert_member" on public.matches;
create policy "matches_insert_member"
on public.matches
for insert
with check (
  public.is_team_member(team_id)
  and created_by = auth.uid()
);

drop policy if exists "matches_update_member" on public.matches;
create policy "matches_update_member"
on public.matches
for update
using (public.is_team_member(team_id))
with check (public.is_team_member(team_id));

drop policy if exists "matches_delete_member" on public.matches;
create policy "matches_delete_member"
on public.matches
for delete
using (public.is_team_member(team_id));

-- External event link policies

drop policy if exists "external_event_links_select_member" on public.external_event_links;
create policy "external_event_links_select_member"
on public.external_event_links
for select
using (public.is_team_member(team_id));

drop policy if exists "external_event_links_insert_member" on public.external_event_links;
create policy "external_event_links_insert_member"
on public.external_event_links
for insert
with check (public.is_team_member(team_id));

drop policy if exists "external_event_links_update_member" on public.external_event_links;
create policy "external_event_links_update_member"
on public.external_event_links
for update
using (public.is_team_member(team_id))
with check (public.is_team_member(team_id));

drop policy if exists "external_event_links_delete_member" on public.external_event_links;
create policy "external_event_links_delete_member"
on public.external_event_links
for delete
using (public.is_team_member(team_id));
