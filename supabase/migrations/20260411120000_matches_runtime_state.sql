-- Persist live runtime state for deterministic match clock reconstruction.

alter table if exists public.matches
  add column if not exists runtime_state jsonb;

create index if not exists idx_matches_runtime_state_live
  on public.matches(team_id)
  where status = 'live';
