-- Phase 5: manual Spond re-sync metadata and RSVP snapshots.

alter table if exists public.external_team_links
  add column if not exists members_last_synced_at timestamptz,
  add column if not exists events_last_synced_at timestamptz;

alter table if exists public.external_event_links
  add column if not exists rsvp_last_synced_at timestamptz;

create table if not exists public.match_rsvp_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  synced_by uuid not null references public.profiles(id) on delete cascade,
  accepted_count integer not null default 0,
  declined_count integer not null default 0,
  unanswered_count integer not null default 0,
  unconfirmed_count integer not null default 0,
  waitinglist_count integer not null default 0,
  total_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint match_rsvp_snapshots_provider_check check (provider in ('spond'))
);

create table if not exists public.match_rsvp_snapshot_entries (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.match_rsvp_snapshots(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  external_member_id text not null,
  member_name text not null,
  response_status text not null,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  constraint match_rsvp_snapshot_entries_status_check check (
    response_status in ('accepted', 'declined', 'unanswered', 'unconfirmed', 'waitinglist')
  ),
  constraint match_rsvp_snapshot_entries_unique unique (snapshot_id, external_member_id)
);

create index if not exists idx_match_rsvp_snapshots_match_id on public.match_rsvp_snapshots(match_id);
create index if not exists idx_match_rsvp_snapshots_team_created_at on public.match_rsvp_snapshots(team_id, created_at desc);
create index if not exists idx_match_rsvp_snapshot_entries_snapshot_id on public.match_rsvp_snapshot_entries(snapshot_id);
create index if not exists idx_match_rsvp_snapshot_entries_team_id on public.match_rsvp_snapshot_entries(team_id);

alter table public.match_rsvp_snapshots enable row level security;
alter table public.match_rsvp_snapshot_entries enable row level security;

drop policy if exists "match_rsvp_snapshots_select_member" on public.match_rsvp_snapshots;
create policy "match_rsvp_snapshots_select_member"
on public.match_rsvp_snapshots
for select
using (public.is_team_member(team_id));

drop policy if exists "match_rsvp_snapshots_insert_member" on public.match_rsvp_snapshots;
create policy "match_rsvp_snapshots_insert_member"
on public.match_rsvp_snapshots
for insert
with check (
  public.is_team_member(team_id)
  and synced_by = auth.uid()
);

drop policy if exists "match_rsvp_snapshots_update_member" on public.match_rsvp_snapshots;
create policy "match_rsvp_snapshots_update_member"
on public.match_rsvp_snapshots
for update
using (public.is_team_member(team_id))
with check (public.is_team_member(team_id));

drop policy if exists "match_rsvp_snapshots_delete_member" on public.match_rsvp_snapshots;
create policy "match_rsvp_snapshots_delete_member"
on public.match_rsvp_snapshots
for delete
using (public.is_team_member(team_id));

drop policy if exists "match_rsvp_snapshot_entries_select_member" on public.match_rsvp_snapshot_entries;
create policy "match_rsvp_snapshot_entries_select_member"
on public.match_rsvp_snapshot_entries
for select
using (public.is_team_member(team_id));

drop policy if exists "match_rsvp_snapshot_entries_insert_member" on public.match_rsvp_snapshot_entries;
create policy "match_rsvp_snapshot_entries_insert_member"
on public.match_rsvp_snapshot_entries
for insert
with check (public.is_team_member(team_id));

drop policy if exists "match_rsvp_snapshot_entries_update_member" on public.match_rsvp_snapshot_entries;
create policy "match_rsvp_snapshot_entries_update_member"
on public.match_rsvp_snapshot_entries
for update
using (public.is_team_member(team_id))
with check (public.is_team_member(team_id));

drop policy if exists "match_rsvp_snapshot_entries_delete_member" on public.match_rsvp_snapshot_entries;
create policy "match_rsvp_snapshot_entries_delete_member"
on public.match_rsvp_snapshot_entries
for delete
using (public.is_team_member(team_id));
