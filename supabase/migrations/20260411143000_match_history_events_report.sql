begin;

alter table public.matches
  add column if not exists format text not null default '5v5',
  add column if not exists report_enabled boolean not null default false,
  add column if not exists report_status text not null default 'not_requested',
  add column if not exists report_text text,
  add column if not exists score_for integer not null default 0,
  add column if not exists score_against integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_format_check'
  ) then
    alter table public.matches
      add constraint matches_format_check
      check (format in ('3v3', '5v5', '7v7', '9v9', '11v11'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_report_status_check'
  ) then
    alter table public.matches
      add constraint matches_report_status_check
      check (report_status in ('not_requested', 'pending', 'ready', 'failed'));
  end if;
end $$;

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  type text not null,
  minute integer,
  timestamp_ms bigint,
  team_side text,
  primary_player_id uuid,
  secondary_player_id uuid,
  payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint match_events_type_check check (
    type in (
      'goal_for',
      'goal_against',
      'substitution',
      'penalty',
      'corner',
      'free_kick',
      'card_yellow',
      'card_red',
      'own_goal',
      'period_start',
      'period_end'
    )
  ),
  constraint match_events_team_side_check check (team_side in ('own', 'opponent') or team_side is null)
);

create index if not exists idx_match_events_match_id on public.match_events(match_id);
create index if not exists idx_match_events_type on public.match_events(type);
create index if not exists idx_match_events_timestamp on public.match_events(timestamp_ms);

alter table public.match_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'match_events'
      and policyname = 'match_events_select_team_member'
  ) then
    create policy "match_events_select_team_member"
      on public.match_events
      for select
      using (
        exists (
          select 1
          from public.matches m
          where m.id = match_events.match_id
          and public.is_team_member(m.team_id)
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'match_events'
      and policyname = 'match_events_insert_team_member'
  ) then
    create policy "match_events_insert_team_member"
      on public.match_events
      for insert
      with check (
        exists (
          select 1
          from public.matches m
          where m.id = match_events.match_id
          and public.is_team_member(m.team_id)
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'match_events'
      and policyname = 'match_events_update_team_member'
  ) then
    create policy "match_events_update_team_member"
      on public.match_events
      for update
      using (
        exists (
          select 1
          from public.matches m
          where m.id = match_events.match_id
          and public.is_team_member(m.team_id)
        )
      )
      with check (
        exists (
          select 1
          from public.matches m
          where m.id = match_events.match_id
          and public.is_team_member(m.team_id)
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'match_events'
      and policyname = 'match_events_delete_team_member'
  ) then
    create policy "match_events_delete_team_member"
      on public.match_events
      for delete
      using (
        exists (
          select 1
          from public.matches m
          where m.id = match_events.match_id
          and public.is_team_member(m.team_id)
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_match_events_set_updated_at'
  ) then
    create trigger trg_match_events_set_updated_at
      before update on public.match_events
      for each row
      execute function public.set_updated_at();
  end if;
end $$;

commit;
