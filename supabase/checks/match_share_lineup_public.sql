-- FEAT-SHARE-04 check: get_public_match_share and the lineup option, with
-- synthetic data, against the full migration chain. All test data lives in
-- one transaction that is rolled back.
--
-- Run only against a throwaway local database, never a linked or remote
-- one. From the repo root:
--
--   docker run -d --rm --name fp-sqlcheck --network none --pull never \
--     -e POSTGRES_PASSWORD=x public.ecr.aws/supabase/postgres:17.6.1.166
--   for f in supabase/migrations/*.sql; do
--     (echo '\set ON_ERROR_STOP on'; cat "$f") | docker exec -i fp-sqlcheck psql -U postgres -h localhost -q || break
--   done
--   docker exec -i fp-sqlcheck psql -U postgres -h localhost -q < supabase/checks/match_share_lineup_public.sql
--   docker stop fp-sqlcheck
--
-- Passes with exit code 0 and only PASS notices; fails with an exception.
-- Every answer is read as anon (the public page's role).

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

begin;

create function pg_temp.ok(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception 'FAIL: %', label;
  end if;
  raise notice 'PASS: %', label;
end $$;

-- Every key anywhere in an answer.
create function pg_temp.keys(j jsonb) returns setof text language sql as $$
  with recursive walk(v) as (
    select j
    union all
    select x.v from walk w,
      lateral (
        select e.value from jsonb_each(case when jsonb_typeof(w.v) = 'object' then w.v else '{}'::jsonb end) e
        union all
        select a.value from jsonb_array_elements(case when jsonb_typeof(w.v) = 'array' then w.v else '[]'::jsonb end) a
      ) x(v)
  )
  select distinct e.key from walk, jsonb_each(case when jsonb_typeof(walk.v) = 'object' then walk.v else '{}'::jsonb end) e
$$;

-- No player id (or any uuid), no shirt number, no individual playing time,
-- and only keys the public page knows.
create function pg_temp.no_leak(label text, r jsonb) returns void language plpgsql as $$
declare
  v_extra text;
begin
  perform pg_temp.ok(label || ': answer present', r is not null);
  perform pg_temp.ok(label || ': no uuid', r::text !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
  perform pg_temp.ok(label || ': no player id text', position('player-' in r::text) = 0);
  select string_agg(k, ',') into v_extra from pg_temp.keys(r) k
   where k not in ('phase','teamName','opponentName','startsAt','shareLive','shareSummary','detailLevel',
                   'live','updatedAt','status','halves','regularSecondsPerHalf','phaseStartedAtElapsedMs',
                   'clock','startedAtMs','pausedAtMs','accumulatedPausedMs','isRunning',
                   'score','for','against','goals','minute','side','scorer','assist',
                   'lineup','kind','available','format','formationId','field','bench','slot','name',
                   'summary','text','generatedAt','basis');
  perform pg_temp.ok(label || ': only public keys (extra: ' || coalesce(v_extra, '-') || ')', v_extra is null);
end $$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000c0ac', 'coach@example.invalid');
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000c0ac');
insert into public.teams (id, name, owner_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'Lyn G12', '00000000-0000-0000-0000-00000000c0ac'),
  ('00000000-0000-0000-0000-0000000000a2', 'Annet lag', '00000000-0000-0000-0000-00000000c0ac');
insert into public.players (id, team_id, name, number) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Ada', 1),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', ' Bo ', 2),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', 'Cato', 3),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1', 'Dina', 4),
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000a1', 'Eli', 5),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000a1', 'Fia', 6),
  -- Another team's player: never named through this match.
  ('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000a2', 'Fremmed', 9);

-- One match per phase/flag combination.
insert into public.matches (id, team_id, title, opponent_name, starts_at, status, created_by) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'Kamp', 'Skeid', '2026-11-01 10:00+00', 'upcoming', '00000000-0000-0000-0000-00000000c0ac');

-- ---------------------------------------------------------------- planned
-- Before «Start kampen»: no runtime state, the setup's planned start.
insert into public.match_shares (match_id, team_id, token, share_live, share_summary, detail_level, age_group, share_lineup, planned_lineup, created_by)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', repeat('a', 43),
        true, true, 'detailed', 'youth', true,
        '{"format":"7v7","formationId":"7v7-2-3-1",
          "slotAssignments":{"gk":"00000000-0000-0000-0000-0000000000b1","lb":"00000000-0000-0000-0000-0000000000b2","cm":"00000000-0000-0000-0000-0000000000b3","st":null,"rw":"00000000-0000-0000-0000-0000000000b9"},
          "benchPlayerIds":["00000000-0000-0000-0000-0000000000b4","00000000-0000-0000-0000-0000000000b5"]}',
        '00000000-0000-0000-0000-00000000c0ac');

set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.no_leak('planned/setup', :'r');
select pg_temp.ok('planned/setup: phase upcoming, lineup planned from setup',
  (:'r'::jsonb) ->> 'phase' = 'upcoming' and (:'r'::jsonb) -> 'lineup' = '{
    "kind":"planned","available":true,"format":"7v7","formationId":"7v7-2-3-1",
    "field":[{"slot":"cm","name":"Cato"},{"slot":"gk","name":"Ada"},{"slot":"lb","name":"Bo"},{"slot":"rw"}],
    "bench":[{"name":"Dina"},{"name":"Eli"}]}'::jsonb);
select pg_temp.ok('planned/setup: no live, score or summary before kick-off',
  not ((:'r'::jsonb) ? 'live') and not ((:'r'::jsonb) ? 'score') and not ((:'r'::jsonb) ? 'summary'));

-- After «Start kampen» (runtime state written, clock not started): from the runtime state.
update public.matches set status = 'live', runtime_state = '{
  "status":"ready","phase":"first_half","halves":2,"format":"7v7","formationId":"7v7-2-3-1",
  "clock":{"startedAtMs":null,"pausedAtMs":null,"accumulatedPausedMs":0,"isRunning":false},
  "liveSlotAssignments":{"gk":"00000000-0000-0000-0000-0000000000b1","lb":"00000000-0000-0000-0000-0000000000b2","cm":"00000000-0000-0000-0000-0000000000b6","st":null},
  "initialOnFieldPlayerIds":["00000000-0000-0000-0000-0000000000b1","00000000-0000-0000-0000-0000000000b2","00000000-0000-0000-0000-0000000000b6"],
  "onFieldPlayerIds":["00000000-0000-0000-0000-0000000000b1","00000000-0000-0000-0000-0000000000b2","00000000-0000-0000-0000-0000000000b6"],
  "benchPlayerIds":["00000000-0000-0000-0000-0000000000b3","00000000-0000-0000-0000-0000000000b4","00000000-0000-0000-0000-0000000000b5"],
  "playerAccumulatedMs":{"00000000-0000-0000-0000-0000000000b1":0},
  "onFieldStartedAtElapsedMs":{"00000000-0000-0000-0000-0000000000b1":null}}'
 where id = '00000000-0000-0000-0000-0000000000d1';

set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.no_leak('planned/runtime', :'r');
select pg_temp.ok('planned/runtime: still upcoming, lineup from runtime state (Fia, not the setup)',
  (:'r'::jsonb) ->> 'phase' = 'upcoming' and (:'r'::jsonb) -> 'lineup' = '{
    "kind":"planned","available":true,"format":"7v7","formationId":"7v7-2-3-1",
    "field":[{"slot":"cm","name":"Fia"},{"slot":"gk","name":"Ada"},{"slot":"lb","name":"Bo"}],
    "bench":[{"name":"Cato"},{"name":"Dina"},{"name":"Eli"}]}'::jsonb);

-- ---------------------------------------------------------------- live
-- Kicked off, then Cato on for Fia. The state carries individual playing
-- time, stints and events with player ids; none may leave.
update public.matches set started_at = '2026-11-01 10:02+00', runtime_state = '{
  "status":"running","phase":"first_half","halves":2,"regularSecondsPerHalf":1500,"phaseStartedAtElapsedMs":0,
  "format":"7v7","formationId":"7v7-2-3-1",
  "clock":{"startedAtMs":1793527320000,"pausedAtMs":null,"accumulatedPausedMs":0,"isRunning":true},
  "kickoffLineup":{"format":"7v7","formationId":"7v7-2-3-1",
    "slotAssignments":{"gk":"00000000-0000-0000-0000-0000000000b1","lb":"00000000-0000-0000-0000-0000000000b2","cm":"00000000-0000-0000-0000-0000000000b6","st":null},
    "benchPlayerIds":["00000000-0000-0000-0000-0000000000b3","00000000-0000-0000-0000-0000000000b4","00000000-0000-0000-0000-0000000000b5"]},
  "liveSlotAssignments":{"gk":"00000000-0000-0000-0000-0000000000b1","lb":"00000000-0000-0000-0000-0000000000b2","cm":"00000000-0000-0000-0000-0000000000b3","st":"00000000-0000-0000-0000-0000000000b5"},
  "initialOnFieldPlayerIds":["00000000-0000-0000-0000-0000000000b1","00000000-0000-0000-0000-0000000000b2","00000000-0000-0000-0000-0000000000b6"],
  "onFieldPlayerIds":["00000000-0000-0000-0000-0000000000b1","00000000-0000-0000-0000-0000000000b2","00000000-0000-0000-0000-0000000000b3"],
  "benchPlayerIds":["00000000-0000-0000-0000-0000000000b6","00000000-0000-0000-0000-0000000000b4","00000000-0000-0000-0000-0000000000b1","00000000-0000-0000-0000-0000000000b5"],
  "playerAccumulatedMs":{"00000000-0000-0000-0000-0000000000b1":600000,"00000000-0000-0000-0000-0000000000b6":420000},
  "onFieldStartedAtElapsedMs":{"00000000-0000-0000-0000-0000000000b3":420000},
  "events":[{"id":"e1","type":"substitution","playerOutId":"00000000-0000-0000-0000-0000000000b6","playerInId":"00000000-0000-0000-0000-0000000000b3"}]}'
 where id = '00000000-0000-0000-0000-0000000000d1';

set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.no_leak('live', :'r');
-- st holds Eli, who is not on the field (stale slot): dropped. Ada in the
-- bench list is on the field: dropped from the bench.
select pg_temp.ok('live: current lineup after the substitution',
  (:'r'::jsonb) ->> 'phase' = 'live' and (:'r'::jsonb) -> 'lineup' = '{
    "kind":"current","available":true,"format":"7v7","formationId":"7v7-2-3-1",
    "field":[{"slot":"cm","name":"Cato"},{"slot":"gk","name":"Ada"},{"slot":"lb","name":"Bo"}],
    "bench":[{"name":"Fia"},{"name":"Dina"},{"name":"Eli"}]}'::jsonb);

-- ---------------------------------------------------------------- completed
update public.matches set status = 'completed', ended_at = '2026-11-01 11:00+00',
  runtime_state = jsonb_set(jsonb_set(runtime_state, '{status}', '"ended"'), '{phase}', '"ended"')
 where id = '00000000-0000-0000-0000-0000000000d1';

set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.no_leak('completed', :'r');
select pg_temp.ok('completed: starting lineup and original bench, not the final one',
  (:'r'::jsonb) ->> 'phase' = 'completed' and (:'r'::jsonb) -> 'lineup' = '{
    "kind":"start","available":true,"format":"7v7","formationId":"7v7-2-3-1",
    "field":[{"slot":"cm","name":"Fia"},{"slot":"gk","name":"Ada"},{"slot":"lb","name":"Bo"}],
    "bench":[{"name":"Cato"},{"name":"Dina"},{"name":"Eli"}]}'::jsonb);
select pg_temp.ok('completed: summary block present', (:'r'::jsonb) ? 'summary');

-- Without «Del oppsummering»: no lineup (and no summary) after the match.
update public.match_shares set share_summary = false where match_id = '00000000-0000-0000-0000-0000000000d1';
set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.no_leak('completed/no summary', :'r');
select pg_temp.ok('completed/no summary: no lineup', not ((:'r'::jsonb) ? 'lineup') and not ((:'r'::jsonb) ? 'summary'));
update public.match_shares set share_summary = true where match_id = '00000000-0000-0000-0000-0000000000d1';

-- An older match without kickoffLineup: never rebuilt from other fields.
savepoint older;
alter table public.matches disable trigger matches_completed_is_terminal;
update public.matches set runtime_state = runtime_state - 'kickoffLineup' where id = '00000000-0000-0000-0000-0000000000d1';
alter table public.matches enable trigger matches_completed_is_terminal;
set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.ok('completed/older: start lineup unavailable',
  (:'r'::jsonb) -> 'lineup' = '{"kind":"start","available":false}'::jsonb);
rollback to savepoint older;

-- ---------------------------------------------------------------- anonymity
-- Only detailed + youth names anyone. Everything else: empty markers.
create function pg_temp.anon_case(p_level text, p_age text) returns void language plpgsql as $$
declare
  r jsonb;
begin
  update public.match_shares set detail_level = p_level, age_group = p_age
   where match_id = '00000000-0000-0000-0000-0000000000d1';
  set local role anon;
  r := public.get_public_match_share(repeat('a', 43));
  reset role;
  perform pg_temp.no_leak('anon ' || p_level || '/' || p_age, r);
  perform pg_temp.ok('anon ' || p_level || '/' || p_age || ': markers only', r -> 'lineup' = '{
    "kind":"start","available":true,"format":"7v7","formationId":"7v7-2-3-1",
    "field":[{"slot":"cm"},{"slot":"gk"},{"slot":"lb"}],
    "bench":[{},{},{}]}'::jsonb);
  perform pg_temp.ok('anon ' || p_level || '/' || p_age || ': no names anywhere',
    not exists (select 1 from pg_temp.keys(r) k where k in ('name', 'scorer', 'assist')));
end $$;
select pg_temp.anon_case('result', 'youth');
select pg_temp.anon_case('status', 'youth');
select pg_temp.anon_case('result', 'child');
select pg_temp.anon_case('status', 'child');
select pg_temp.anon_case('result', 'unknown');
select pg_temp.anon_case('status', 'unknown');

-- The same while live and planned (result level, child).
savepoint phases;
alter table public.matches disable trigger matches_completed_is_terminal;
update public.matches set status = 'live', runtime_state = jsonb_set(runtime_state, '{status}', '"running"')
 where id = '00000000-0000-0000-0000-0000000000d1';
set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.no_leak('anon live result/unknown', :'r');
select pg_temp.ok('anon live result/unknown: markers only', (:'r'::jsonb) -> 'lineup' = '{
  "kind":"current","available":true,"format":"7v7","formationId":"7v7-2-3-1",
  "field":[{"slot":"cm"},{"slot":"gk"},{"slot":"lb"}],"bench":[{},{},{}]}'::jsonb);
update public.matches set status = 'upcoming', runtime_state = null where id = '00000000-0000-0000-0000-0000000000d1';
alter table public.matches enable trigger matches_completed_is_terminal;
set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.no_leak('anon planned result/unknown', :'r');
select pg_temp.ok('anon planned result/unknown: markers only', (:'r'::jsonb) -> 'lineup' = '{
  "kind":"planned","available":true,"format":"7v7","formationId":"7v7-2-3-1",
  "field":[{"slot":"cm"},{"slot":"gk"},{"slot":"lb"},{"slot":"rw"}],"bench":[{},{}]}'::jsonb);
rollback to savepoint phases;

-- Names for a child group cannot be stored at all.
savepoint child_names;
do $$
begin
  update public.match_shares set detail_level = 'detailed', age_group = 'child'
   where match_id = '00000000-0000-0000-0000-0000000000d1';
  raise exception 'FAIL: detailed/child was accepted';
exception when check_violation then
  raise notice 'PASS: detailed/child rejected by match_shares_names_need_youth';
end $$;
rollback to savepoint child_names;
update public.match_shares set detail_level = 'detailed', age_group = 'youth'
 where match_id = '00000000-0000-0000-0000-0000000000d1';

-- ---------------------------------------------------------------- hiding
-- Lineup option off: no lineup in any phase.
update public.match_shares set share_lineup = false, planned_lineup = null where match_id = '00000000-0000-0000-0000-0000000000d1';
set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.no_leak('lineup off/completed', :'r');
select pg_temp.ok('lineup off/completed: no lineup', not ((:'r'::jsonb) ? 'lineup'));

savepoint lineup_off;
alter table public.matches disable trigger matches_completed_is_terminal;
update public.matches set status = 'live', runtime_state = jsonb_set(runtime_state, '{status}', '"running"')
 where id = '00000000-0000-0000-0000-0000000000d1';
set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.no_leak('lineup off/live', :'r');
select pg_temp.ok('lineup off/live: live shown, no lineup', (:'r'::jsonb) ? 'live' and not ((:'r'::jsonb) ? 'lineup'));
update public.matches set status = 'upcoming', runtime_state = null where id = '00000000-0000-0000-0000-0000000000d1';
alter table public.matches enable trigger matches_completed_is_terminal;
set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.ok('lineup off/planned: no lineup', not ((:'r'::jsonb) ? 'lineup'));
rollback to savepoint lineup_off;

-- A planned lineup cannot be kept while the option is off.
savepoint planned_off;
do $$
begin
  update public.match_shares set planned_lineup = '{"format":"7v7"}'
   where match_id = '00000000-0000-0000-0000-0000000000d1';
  raise exception 'FAIL: planned_lineup kept with share_lineup off';
exception when check_violation then
  raise notice 'PASS: planned_lineup rejected while share_lineup is off';
end $$;
rollback to savepoint planned_off;

-- «Del live» off: the lineup option cannot stay on ...
update public.match_shares set share_lineup = true where match_id = '00000000-0000-0000-0000-0000000000d1';
savepoint live_off;
do $$
begin
  update public.match_shares set share_live = false where match_id = '00000000-0000-0000-0000-0000000000d1';
  raise exception 'FAIL: share_lineup kept with share_live off';
exception when check_violation then
  raise notice 'PASS: share_live off with share_lineup on rejected by match_shares_lineup_needs_live';
end $$;
rollback to savepoint live_off;

-- ... and with both off (as the API writes it) a summary-only page has no lineup.
update public.match_shares set share_live = false, share_lineup = false where match_id = '00000000-0000-0000-0000-0000000000d1';
set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.no_leak('live off/completed', :'r');
select pg_temp.ok('live off/completed: summary, no lineup',
  (:'r'::jsonb) ? 'summary' and not ((:'r'::jsonb) ? 'lineup') and not ((:'r'::jsonb) ? 'live'));

-- Summary only while the match runs: «pågår», nothing live, no lineup.
savepoint summary_only_live;
alter table public.matches disable trigger matches_completed_is_terminal;
update public.matches set status = 'live', runtime_state = jsonb_set(runtime_state, '{status}', '"running"')
 where id = '00000000-0000-0000-0000-0000000000d1';
alter table public.matches enable trigger matches_completed_is_terminal;
set role anon;
select public.get_public_match_share(repeat('a', 43)) as r \gset
reset role;
select pg_temp.no_leak('live off/live', :'r');
select pg_temp.ok('live off/live: phase live, no live block, no score, no lineup',
  (:'r'::jsonb) ->> 'phase' = 'live' and not ((:'r'::jsonb) ?| array['live', 'score', 'lineup']));
rollback to savepoint summary_only_live;

-- ---------------------------------------------------------------- access
-- The public page cannot call the lineup helper or read the table directly.
do $$
begin
  set local role anon;
  perform public.match_share_public_lineup(null, 'start', '{}'::jsonb, null, true);
  raise exception 'FAIL: anon could call match_share_public_lineup';
exception when insufficient_privilege then
  reset role;
  raise notice 'PASS: anon cannot call match_share_public_lineup';
end $$;
do $$
begin
  set local role anon;
  perform 1 from public.match_shares;
  raise exception 'FAIL: anon could read match_shares';
exception when insufficient_privilege then
  reset role;
  raise notice 'PASS: anon cannot read match_shares';
end $$;
select pg_temp.ok('authenticated cannot call match_share_public_lineup',
  not has_function_privilege('authenticated', 'public.match_share_public_lineup(uuid,text,jsonb,jsonb,boolean)', 'execute'));
select pg_temp.ok('anon can call get_public_match_share',
  has_function_privilege('anon', 'public.get_public_match_share(text)', 'execute'));

-- Unknown or malformed tokens.
set role anon;
select pg_temp.ok('unknown token: null', public.get_public_match_share(repeat('z', 43)) is null);
select pg_temp.ok('malformed token: null', public.get_public_match_share('short') is null);
reset role;

rollback;
