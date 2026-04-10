-- Add persisted runtime timestamps for active/completed match flow.

alter table if exists public.matches
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;

create index if not exists idx_matches_team_live_started_at
  on public.matches(team_id, started_at desc)
  where status = 'live';
