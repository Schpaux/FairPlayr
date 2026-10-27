-- FEAT-SHARE-04: the lineup and bench on the public match page, as an
-- option under «Del live».
--
-- * match_shares.share_lineup («Vis lagoppstilling og benk») is off by
--   default and only allowed while «Del live» is on (constraint below), so
--   turning «Del live» off turns it off too. The coach's API sends it off in
--   the same write; the constraint makes sure no row keeps it.
-- * What the page shows, from the match's runtime_state (the coach's device
--   writes it through the existing runtime sync):
--     'planned'  before the first ▶: the starting positions and bench as
--                they stand now. Once «Start kampen» has written a runtime
--                state, from that; before it, from the setup's planned start
--                that the coach's device sends with the share
--                (match_shares.planned_lineup, player ids by slot and the
--                bench; kept only while the option is on).
--     'current'  while live: who is on the pitch and on the bench now
--                (substitutions, undo and position swaps arrive with the
--                runtime state, and the existing signal tells open pages).
--     'start'    after the match, only with «Del oppsummering» on too: the
--                lineup at the first ▶ (runtime_state.kickoffLineup). Older
--                matches have none; it is never rebuilt from other fields,
--                and the page then says so calmly.
-- * Names: only at the 'detailed' level for the youth group, the same rule
--   as goal scorers. Otherwise each position and bench place is an empty
--   marker: no name, initials, shirt number or player id ever leaves here.
--   Player ids are only used to look names up and are never returned.
-- * Nothing else of the match is opened by this option, and the live,
--   score, goal and summary rules are unchanged. The summary fingerprint
--   (match_share_summary_basis) does not read the lineup.
--
-- NOT APPLIED. Review, then apply with explicit approval, after
-- 20261027090000_match_share_live_signal.

begin;

alter table public.match_shares
  add column if not exists share_lineup boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'match_shares_lineup_needs_live'
  ) then
    alter table public.match_shares
      add constraint match_shares_lineup_needs_live check (not share_lineup or share_live);
  end if;
end $$;

alter table public.match_shares
  add column if not exists planned_lineup jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'match_shares_planned_lineup_valid'
  ) then
    -- Only while the option is on, an object, and small (a squad, not a store).
    alter table public.match_shares
      add constraint match_shares_planned_lineup_valid check (
        planned_lineup is null
        or (share_lineup and jsonb_typeof(planned_lineup) = 'object' and pg_column_size(planned_lineup) <= 16384)
      );
  end if;
end $$;

-- One lineup for the public answer: occupied positions and the bench, with
-- names only when p_names. Null when the source is not a lineup.
create or replace function public.match_share_public_lineup(
  p_team_id uuid,
  p_kind text,
  p_source jsonb,
  p_on_field jsonb,
  p_names boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slots jsonb;
  v_bench jsonb;
  v_field_ids jsonb;
  v_field jsonb;
  v_bench_out jsonb;
begin
  -- jsonb_typeof(null) is null, so every check is coalesced.
  if coalesce(jsonb_typeof(p_source), '') <> 'object'
     or coalesce(jsonb_typeof(p_source -> 'format'), '') <> 'string'
     or coalesce(jsonb_typeof(p_source -> 'formationId'), '') <> 'string' then
    return null;
  end if;

  -- The kick-off snapshot and the setup's planned start keep their positions
  -- in slotAssignments; a runtime state in liveSlotAssignments.
  v_slots := case
    when p_kind = 'start' then p_source -> 'slotAssignments'
    else coalesce(p_source -> 'liveSlotAssignments', p_source -> 'slotAssignments')
  end;
  if coalesce(jsonb_typeof(v_slots), '') <> 'object' then
    return null;
  end if;
  v_bench := case when jsonb_typeof(p_source -> 'benchPlayerIds') = 'array' then p_source -> 'benchPlayerIds' else '[]'::jsonb end;

  -- A position counts only with a player who is on the field (as the live
  -- pitch shows it); the snapshot at kick-off is already filtered that way.
  select coalesce(jsonb_agg(s.value), '[]'::jsonb)
    into v_field_ids
    from jsonb_each(v_slots) s
   where jsonb_typeof(s.value) = 'string'
     and (coalesce(jsonb_typeof(p_on_field), '') <> 'array' or p_on_field ? (s.value #>> '{}'));

  select coalesce(jsonb_agg(
           jsonb_build_object('slot', s.key)
           || case when p_names and nullif(btrim(p.name), '') is not null
                then jsonb_build_object('name', btrim(p.name)) else '{}'::jsonb end
           order by s.key
         ), '[]'::jsonb)
    into v_field
    from jsonb_each(v_slots) s
    left join public.players p
      on p.id::text = (s.value #>> '{}') and p.team_id = p_team_id
   where jsonb_typeof(s.value) = 'string'
     and v_field_ids ? (s.value #>> '{}');

  select coalesce(jsonb_agg(
           case when p_names and nullif(btrim(p.name), '') is not null
             then jsonb_build_object('name', btrim(p.name)) else '{}'::jsonb end
           order by b.ordinality
         ), '[]'::jsonb)
    into v_bench_out
    from jsonb_array_elements(v_bench) with ordinality as b(value, ordinality)
    left join public.players p
      on p.id::text = (b.value #>> '{}') and p.team_id = p_team_id
   where jsonb_typeof(b.value) = 'string'
     and not (v_field_ids ? (b.value #>> '{}'))
     and b.ordinality <= 40;

  return jsonb_build_object(
    'kind', p_kind,
    'available', true,
    'format', p_source ->> 'format',
    'formationId', p_source ->> 'formationId',
    'field', v_field,
    'bench', v_bench_out
  );
end;
$$;

revoke all on function public.match_share_public_lineup(uuid, text, jsonb, jsonb, boolean) from public, anon, authenticated;

create or replace function public.get_public_match_share(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_share public.match_shares;
  v_match public.matches;
  v_team_name text;
  v_phase text;
  v_kicked_off boolean;
  v_planned_kickoff timestamptz;
  v_live_visible boolean;
  v_show_score boolean;
  v_show_names boolean;
  v_lineup_kind text;
  v_lineup jsonb;
  v_state jsonb;
  v_result jsonb;
  v_goals jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;

  select * into v_share from public.match_shares where token = p_token;
  if not found or not (v_share.share_live or v_share.share_summary) then
    return null;
  end if;

  select * into v_match from public.matches where id = v_share.match_id;
  if not found then
    return null;
  end if;

  select name into v_team_name from public.teams where id = v_match.team_id;

  v_state := case when jsonb_typeof(v_match.runtime_state) = 'object' then v_match.runtime_state else null end;

  -- The first ▶ starts the clock; until then a live row is only ready.
  v_kicked_off := jsonb_typeof(v_state -> 'clock') = 'object'
    and jsonb_typeof(v_state -> 'clock' -> 'startedAtMs') = 'number';

  v_phase := case
    when v_match.status = 'completed' then 'completed'
    when v_match.status = 'live' and v_kicked_off then 'live'
    else 'upcoming'
  end;

  v_planned_kickoff := case
    when not v_share.kickoff_from_match then v_share.kickoff_at
    when v_match.started_at is not null and v_match.starts_at = v_match.started_at then null
    else v_match.starts_at
  end;

  -- Live data only with «Del live»; with only «Del oppsummering» a running
  -- match is just «pågår». After the match the final status follows the level.
  v_live_visible := v_phase = 'live' and v_share.share_live;
  v_show_score := v_share.detail_level in ('result', 'detailed')
    and (v_live_visible or v_phase = 'completed');
  v_show_names := v_show_score and v_share.detail_level = 'detailed' and v_share.age_group = 'youth';

  v_result := jsonb_build_object(
    'phase', v_phase,
    'teamName', coalesce(v_team_name, ''),
    'opponentName', v_match.opponent_name,
    'startsAt', case
      when v_phase = 'upcoming' then v_planned_kickoff
      when v_share.kickoff_from_match then v_match.starts_at
      else coalesce(v_share.kickoff_at, v_match.started_at)
    end,
    'shareLive', v_share.share_live,
    'shareSummary', v_share.share_summary,
    'detailLevel', v_share.detail_level
  );

  if v_live_visible then
    v_result := v_result || jsonb_build_object(
      'live', jsonb_build_object(
        'updatedAt', v_match.updated_at,
        'phase', v_state ->> 'phase',
        'status', v_state ->> 'status',
        'halves', v_state -> 'halves',
        'regularSecondsPerHalf', v_state -> 'regularSecondsPerHalf',
        'phaseStartedAtElapsedMs', v_state -> 'phaseStartedAtElapsedMs',
        'clock', jsonb_build_object(
          'startedAtMs', v_state -> 'clock' -> 'startedAtMs',
          'pausedAtMs', v_state -> 'clock' -> 'pausedAtMs',
          'accumulatedPausedMs', v_state -> 'clock' -> 'accumulatedPausedMs',
          'isRunning', v_state -> 'clock' -> 'isRunning'
        )
      )
    );
  end if;

  if v_show_score then
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'minute', e.minute,
               'side', case e.type when 'goal_for' then 'own' else 'opponent' end
             )
             || case when v_show_names and e.type = 'goal_for' then jsonb_build_object(
                  'scorer', coalesce(nullif(e.payload ->> 'primaryPlayerName', ''), scorer.name),
                  'assist', coalesce(nullif(e.payload ->> 'secondaryPlayerName', ''), assist.name)
                ) else '{}'::jsonb end
             order by e.timestamp_ms nulls last, e.minute nulls last, e.created_at
           ), '[]'::jsonb)
      into v_goals
      from public.match_events e
      left join public.players scorer
        on scorer.id = e.primary_player_id and scorer.team_id = v_match.team_id
      left join public.players assist
        on assist.id = e.secondary_player_id and assist.team_id = v_match.team_id
     where e.match_id = v_match.id
       and e.type in ('goal_for', 'goal_against');

    v_result := v_result || jsonb_build_object(
      'score', jsonb_build_object(
        'for', greatest(coalesce(v_match.score_for, 0), 0),
        'against', greatest(coalesce(v_match.score_against, 0), 0)
      ),
      'goals', v_goals
    );
  end if;

  -- FEAT-SHARE-04: the lineup, only with «Vis lagoppstilling og benk» (which
  -- needs «Del live»); after the match only with «Del oppsummering» too.
  v_lineup_kind := case
    when not (v_share.share_lineup and v_share.share_live) then null
    when v_phase = 'upcoming' then 'planned'
    when v_phase = 'live' then 'current'
    when v_phase = 'completed' and v_share.share_summary then 'start'
    else null
  end;

  if v_lineup_kind is not null then
    v_lineup := case
      when v_lineup_kind = 'start' then public.match_share_public_lineup(
        v_match.team_id, 'start', v_state -> 'kickoffLineup', null,
        v_share.detail_level = 'detailed' and v_share.age_group = 'youth')
      -- Before «Start kampen» there is no runtime state yet: the setup's
      -- planned start (already only starters on positions) stands in.
      when v_lineup_kind = 'planned' and jsonb_typeof(v_state -> 'liveSlotAssignments') is distinct from 'object' then
        public.match_share_public_lineup(
          v_match.team_id, 'planned', v_share.planned_lineup, null,
          v_share.detail_level = 'detailed' and v_share.age_group = 'youth')
      else public.match_share_public_lineup(
        v_match.team_id, v_lineup_kind, v_state, v_state -> 'onFieldPlayerIds',
        v_share.detail_level = 'detailed' and v_share.age_group = 'youth')
    end;
    v_result := v_result || jsonb_build_object(
      'lineup', coalesce(v_lineup, jsonb_build_object('kind', v_lineup_kind, 'available', false))
    );
  end if;

  if v_phase = 'completed' and v_share.share_summary then
    v_result := v_result || jsonb_build_object(
      'summary',
      case
        when v_share.public_summary_text is not null
         and v_share.public_summary_level = v_share.detail_level
         and v_share.public_summary_basis = public.match_share_summary_basis(v_result) then
          jsonb_build_object(
            'status', 'ready',
            'text', v_share.public_summary_text,
            'generatedAt', v_share.public_summary_generated_at,
            'basis', v_share.public_summary_basis
          )
        else jsonb_build_object('status', 'pending', 'text', null, 'generatedAt', null, 'basis', null)
      end
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_public_match_share(text) from public;
grant execute on function public.get_public_match_share(text) to anon, authenticated;

commit;
