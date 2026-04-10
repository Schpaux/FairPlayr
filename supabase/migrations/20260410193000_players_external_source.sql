-- Prepare players for external import sources (phase 1: Spond)

alter table public.players
  add column if not exists source text not null default 'manual',
  add column if not exists external_provider text,
  add column if not exists external_id text,
  add column if not exists is_managed boolean not null default false;

-- Ensure source is explicit and valid.
alter table public.players
  drop constraint if exists players_source_check;

alter table public.players
  add constraint players_source_check
    check (source in ('manual', 'spond'));

-- Keep phase-1 semantics strict and easy to reason about:
-- manual players are app-managed only, spond players carry provider+external id and are managed.
alter table public.players
  drop constraint if exists players_source_external_consistency_check;

alter table public.players
  add constraint players_source_external_consistency_check
    check (
      (source = 'manual' and external_provider is null and external_id is null and is_managed = false)
      or
      (source = 'spond' and external_provider = 'spond' and external_id is not null and is_managed = true)
    );

-- Helps future sync/import dedupe by external identity inside a team.
create unique index if not exists idx_players_team_provider_external_id_unique
  on public.players(team_id, external_provider, external_id)
  where external_provider is not null and external_id is not null;

-- Block deletion of managed/external players at DB level.
drop policy if exists "players_delete_member" on public.players;
create policy "players_delete_member"
on public.players
for delete
using (
  source = 'manual'
  and exists (
    select 1
    from public.team_members tm
    where tm.team_id = players.team_id
      and tm.user_id = auth.uid()
  )
);
