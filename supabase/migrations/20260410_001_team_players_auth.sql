-- Initial FairPlayr authenticated data model (profiles, teams, members, players)
-- Run in Supabase SQL editor or via Supabase migration tooling.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_language text not null default 'en',
  preferred_theme text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  default_match_format text not null default '5v5',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'coach', 'assistant')),
  created_at timestamptz not null default now(),
  unique(team_id, user_id)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  number integer,
  preferred_position text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_teams_owner_id on public.teams(owner_id);
create index if not exists idx_team_members_team_id on public.team_members(team_id);
create index if not exists idx_team_members_user_id on public.team_members(user_id);
create index if not exists idx_players_team_id on public.players(team_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_teams_updated_at on public.teams;
create trigger set_teams_updated_at
before update on public.teams
for each row
execute function public.set_updated_at();

drop trigger if exists set_players_updated_at on public.players;
create trigger set_players_updated_at
before update on public.players
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.players enable row level security;

-- Profiles policies

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

-- Teams policies

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
on public.teams
for select
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = teams.id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "teams_insert_owner" on public.teams;
create policy "teams_insert_owner"
on public.teams
for insert
with check (owner_id = auth.uid());

drop policy if exists "teams_update_owner" on public.teams;
create policy "teams_update_owner"
on public.teams
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Team members policies (conservative writes)

drop policy if exists "team_members_select_member" on public.team_members;
create policy "team_members_select_member"
on public.team_members
for select
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = team_members.team_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "team_members_insert_owner_only" on public.team_members;
create policy "team_members_insert_owner_only"
on public.team_members
for insert
with check (
  exists (
    select 1
    from public.teams t
    where t.id = team_members.team_id
      and t.owner_id = auth.uid()
  )
);

-- Players policies

drop policy if exists "players_select_member" on public.players;
create policy "players_select_member"
on public.players
for select
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = players.team_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "players_insert_member" on public.players;
create policy "players_insert_member"
on public.players
for insert
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = players.team_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "players_update_member" on public.players;
create policy "players_update_member"
on public.players
for update
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = players.team_id
      and tm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = players.team_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "players_delete_member" on public.players;
create policy "players_delete_member"
on public.players
for delete
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = players.team_id
      and tm.user_id = auth.uid()
  )
);
