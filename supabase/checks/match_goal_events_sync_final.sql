-- MATCH-02a check: a repeated final goal sync (p_final = true) on a match
-- that is already completed with its final state changes no goals, so goals
-- corrected after the match stay as they are. Also checks that the first
-- completion and a completed match without a final state still take goals.
--
-- Creates its own minimal tables: run only against a throwaway local
-- database, never a linked or remote one. From the repo root:
--
--   docker run -d --rm --name fp-sqlcheck --network none --pull never \
--     -e POSTGRES_PASSWORD=x public.ecr.aws/supabase/postgres:17.6.1.166
--   cat supabase/checks/match_goal_events_sync_final.sql | sed '/^\\ir /r supabase/migrations/20261026120000_match_goal_events_sync.sql' | sed '/^\\ir /d' \
--     | docker exec -i fp-sqlcheck psql -U postgres -h localhost -q
--   docker stop fp-sqlcheck
--
-- Passes with exit code 0 and two PASS notices; fails with an exception.

\set ON_ERROR_STOP on
create table public.matches (id uuid primary key, status text not null, runtime_state jsonb);
create table public.match_events (
  id uuid primary key, match_id uuid not null references public.matches(id), type text not null,
  minute integer, timestamp_ms bigint, team_side text,
  primary_player_id uuid, secondary_player_id uuid, payload jsonb);
\ir ../migrations/20261026120000_match_goal_events_sync.sql

insert into public.matches values ('00000000-0000-0000-0000-0000000000a1', 'live', '{"id":"s","updatedAt":"t1","status":"running"}');

-- First completion: final sync on the open match writes the goal and stores the state.
select public.sync_match_goal_events('00000000-0000-0000-0000-0000000000a1',
  '{"id":"s","updatedAt":"t9","status":"ended"}',
  '[{"id":"00000000-0000-0000-0000-000000000001","type":"goal_for","minute":3,"timestamp_ms":1,"team_side":"for","primary_player_id":"00000000-0000-0000-0000-0000000000f1"}]'::jsonb,
  true) as first_final;
update public.matches set status = 'completed' where id = '00000000-0000-0000-0000-0000000000a1';

-- Corrected on the details page after completion.
update public.match_events set primary_player_id = '00000000-0000-0000-0000-0000000000f2', minute = 4
 where id = '00000000-0000-0000-0000-000000000001';

-- The racing/repeated final sync with the same final state (and a goal that was later removed).
select public.sync_match_goal_events('00000000-0000-0000-0000-0000000000a1',
  '{"id":"s","updatedAt":"t9","status":"ended"}',
  '[{"id":"00000000-0000-0000-0000-000000000001","type":"goal_for","minute":3,"timestamp_ms":1,"team_side":"for","primary_player_id":"00000000-0000-0000-0000-0000000000f1"},
    {"id":"00000000-0000-0000-0000-000000000002","type":"goal_for","minute":5,"timestamp_ms":2,"team_side":"for"}]'::jsonb,
  true) as repeat_final;

do $$
begin
  if (select count(*) from public.match_events) <> 1
     or (select primary_player_id from public.match_events where id = '00000000-0000-0000-0000-000000000001') <> '00000000-0000-0000-0000-0000000000f2'
     or (select minute from public.match_events where id = '00000000-0000-0000-0000-000000000001') <> 4 then
    raise exception 'FAIL: repeated final sync overwrote corrected goals';
  end if;
  raise notice 'PASS: repeated final sync left corrected goals alone';
end $$;

-- A completed match that never got its final state still takes the first final goals.
insert into public.matches values ('00000000-0000-0000-0000-0000000000a2', 'completed', '{"id":"s2","updatedAt":"t1","status":"running"}');
select public.sync_match_goal_events('00000000-0000-0000-0000-0000000000a2',
  '{"id":"s2","updatedAt":"t9","status":"ended"}',
  '[{"id":"00000000-0000-0000-0000-000000000003","type":"goal_for","minute":7,"timestamp_ms":3,"team_side":"for"}]'::jsonb,
  true) as legacy_final;
do $$
begin
  if not exists (select 1 from public.match_events where id = '00000000-0000-0000-0000-000000000003') then
    raise exception 'FAIL: completed match without final state rejected its first final goals';
  end if;
  raise notice 'PASS: completed match without final state took its first final goals';
end $$;
