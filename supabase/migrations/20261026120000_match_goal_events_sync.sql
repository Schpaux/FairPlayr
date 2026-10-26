-- MATCH-02a: make a match's goal rows equal the goals of one runtime state,
-- atomically and only while that state is still the match's own.
--
-- The API (src/lib/server/matches/service.ts, syncGoalEventsWithRuntimeState)
-- computes the goal rows from the device's runtime state
-- (src/domain/goalEventSync.ts) and calls this function. The match row is
-- locked for the check and all writes, so they serialise with every other
-- update of the match (live writes, the completion, a discard):
--
-- * A live-screen sync (p_final = false) writes only while the match is not
--   completed and its runtime_state is still this revision (same `id` and
--   `updatedAt`). A sync overtaken by a newer state, the completion or a
--   discard writes nothing and returns false.
-- * The completion's sync (p_final = true) runs before the match is marked
--   completed. On an open match it also stores the final state, so a live
--   sync still in flight sees it is out of date and writes nothing. Once the
--   match is completed with a final (ended) state it writes nothing and
--   returns false: two completions that both read the match open before
--   either finished cannot let the later one overwrite goals corrected after
--   the match. A completed match that never got its final state (as in
--   updateMatchStatus) still takes the goals of the first one that arrives.
--
-- The completion itself goes through complete_match_with_goal_events (below),
-- which runs this function and the transition to completed as one step.
--
-- Goal rows not in p_goals are deleted, the others inserted or updated with
-- the device's event id. Other event types are not touched. Runs as the
-- caller (RLS applies).
--
-- NOT APPLIED. Review, then apply with explicit approval. Until it is, the
-- API falls back to its previous, non-atomic writes.

create or replace function public.sync_match_goal_events(
  p_match_id uuid,
  p_runtime_state jsonb,
  p_goals jsonb,
  p_final boolean
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_state jsonb;
begin
  select status, runtime_state
    into v_status, v_state
    from public.matches
   where id = p_match_id
     for update;

  if not found then
    return false;
  end if;

  if p_final then
    if v_status = 'completed' and (v_state ->> 'status') = 'ended' then
      return false;
    end if;
    if v_status <> 'completed' then
      update public.matches set runtime_state = p_runtime_state where id = p_match_id;
    end if;
  elsif v_status = 'completed'
     or (v_state ->> 'id') is distinct from (p_runtime_state ->> 'id')
     or (v_state ->> 'updatedAt') is distinct from (p_runtime_state ->> 'updatedAt') then
    return false;
  end if;

  delete from public.match_events
   where match_id = p_match_id
     and type in ('goal_for', 'goal_against')
     and id not in (select (goal ->> 'id')::uuid from jsonb_array_elements(p_goals) as goal);

  insert into public.match_events as existing (
    id, match_id, type, minute, timestamp_ms, team_side,
    primary_player_id, secondary_player_id, payload
  )
  select goal.id, p_match_id, goal.type, goal.minute, goal.timestamp_ms, goal.team_side,
         goal.primary_player_id, goal.secondary_player_id, goal.payload
    from jsonb_to_recordset(p_goals) as goal(
      id uuid,
      type text,
      minute integer,
      timestamp_ms bigint,
      team_side text,
      primary_player_id uuid,
      secondary_player_id uuid,
      payload jsonb
    )
  on conflict (id) do update
     set type = excluded.type,
         minute = excluded.minute,
         timestamp_ms = excluded.timestamp_ms,
         team_side = excluded.team_side,
         primary_player_id = excluded.primary_player_id,
         secondary_player_id = excluded.secondary_player_id,
         payload = excluded.payload
   -- An id that belongs to another match is left alone.
   where existing.match_id = excluded.match_id
     and (existing.type, existing.minute, existing.timestamp_ms, existing.team_side,
          existing.primary_player_id, existing.secondary_player_id, existing.payload)
         is distinct from
         (excluded.type, excluded.minute, excluded.timestamp_ms, excluded.team_side,
          excluded.primary_player_id, excluded.secondary_player_id, excluded.payload);

  return true;
end;
$$;

grant execute on function public.sync_match_goal_events(uuid, jsonb, jsonb, boolean) to authenticated;

-- MATCH-02a: the first completion of a match and its final goals, as one
-- step under the match row lock.
--
-- The API calls this when a match is completed for the first time with a
-- final runtime state. p_match holds the columns the completion writes
-- (status, ended_at, score, report fields, runtime_state, format); only those
-- present are changed. While the match row is locked it:
--
-- * returns no row when the match is already completed (another completion
--   won; the API then re-plans this request as the repeat it now is), and
-- * otherwise makes the goal rows equal p_goals and stores the final state
--   (sync_match_goal_events, p_final = true) and writes the completion.
--
-- Two completions with different final states can therefore not mix: the
-- stored result, the runtime state and the goal rows all come from the one
-- that completed first. Any error rolls all of it back, so the match stays
-- open for the device's retry. The report is generated afterwards, outside
-- this transaction. Runs as the caller (RLS applies).

create or replace function public.complete_match_with_goal_events(
  p_match_id uuid,
  p_match jsonb,
  p_goals jsonb
)
returns setof public.matches
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current public.matches;
  v_next public.matches;
begin
  select *
    into v_current
    from public.matches
   where id = p_match_id
     for update;

  if not found or v_current.status = 'completed' then
    return;
  end if;

  perform public.sync_match_goal_events(p_match_id, p_match -> 'runtime_state', p_goals, true);

  -- Columns missing from p_match keep their current value.
  v_next := jsonb_populate_record(v_current, p_match);

  return query
  update public.matches
     set status = v_next.status,
         ended_at = v_next.ended_at,
         score_for = v_next.score_for,
         score_against = v_next.score_against,
         report_enabled = v_next.report_enabled,
         report_status = v_next.report_status,
         report_text = v_next.report_text,
         report_generated_at = v_next.report_generated_at,
         runtime_state = v_next.runtime_state,
         format = v_next.format
   where id = p_match_id
  returning *;
end;
$$;

grant execute on function public.complete_match_with_goal_events(uuid, jsonb, jsonb) to authenticated;
