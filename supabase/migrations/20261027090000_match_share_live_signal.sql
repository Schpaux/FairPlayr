-- FEAT-SHARE-01 (live follow-up): a shared match is live only after the
-- first ▶, and visitors' pages hear about changes at once.
--
-- * Kick-off. «Start kampen» in setup opens the live screen and makes the
--   match ready; the server row turns 'live' then (MATCH-13: history,
--   recovery and sync depend on it). The match itself starts with the first
--   ▶, which starts the clock in runtime_state. get_public_match_share now
--   answers 'upcoming' for a live row whose clock has never started, so the
--   public page keeps its countdown («Venter på avspark» without a time)
--   until then. A passed kick-off time never makes it live. A paused clock
--   (pause, half-time) has started, so it stays live.
-- * Before the first ▶, startsAt is only a time the coach planned: the
--   match's own time, or the share's kickoff_at. A new match created at
--   «Start kampen» has starts_at = started_at (the moment it was set up, not
--   a plan), so that placeholder is never shown as a kick-off. From the first
--   ▶ on, startsAt is what it was (the summary fingerprint depends on it).
-- * Signal. After a change a visitor can see (the match's status, clock,
--   phase or score, its goal events, the share's switches, level and public
--   summary, the share turned off), one Realtime Broadcast message 'updated'
--   with an empty payload goes to the share's private topic. It carries no
--   data: the page then reads get_public_match_share as before, which decides
--   access and content. The topic is 'match-share:' + sha256(token) in hex, so
--   it does not reveal the token. One message per topic per transaction; it
--   is delivered only after the transaction commits, and a Realtime failure
--   never fails the write.
-- * Receiving needs the topic (so the token); sending is not open to clients
--   (no insert policy), so a visitor cannot fake signals. The policy below
--   only reads realtime.messages for these broadcast topics; no table of the
--   app is opened.
--
-- NOT APPLIED. Review, then apply with explicit approval, after
-- 20261026150000_match_shares.

begin;

create or replace function public.match_share_signal_topic(p_token text)
returns text
language sql
immutable
set search_path = public
as $$
  select 'match-share:' || encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

revoke all on function public.match_share_signal_topic(text) from public, anon, authenticated;

-- Sends the 'updated' hint for one share, at most once per transaction.
create or replace function public.send_match_share_signal(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic text;
  v_flag text;
begin
  if p_token is null then
    return;
  end if;

  v_topic := public.match_share_signal_topic(p_token);
  v_flag := 'fairplayr.share_signal_' || substr(md5(v_topic), 1, 16);
  if coalesce(current_setting(v_flag, true), '') = '1' then
    return;
  end if;
  perform set_config(v_flag, '1', true);

  begin
    perform realtime.send('{}'::jsonb, 'updated', v_topic, true);
  exception when others then
    -- A hint only: the page also polls. Never fail the coach's write.
    null;
  end;
end;
$$;

revoke all on function public.send_match_share_signal(text) from public, anon, authenticated;

create or replace function public.match_share_signal_for_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_token text;
begin
  if tg_table_name = 'match_events' then
    -- Goals only (the public timeline); NEW is null on delete, OLD on insert.
    if not (coalesce(new.type, '') in ('goal_for', 'goal_against')
            or coalesce(old.type, '') in ('goal_for', 'goal_against')) then
      return null;
    end if;
    v_match_id := coalesce(new.match_id, old.match_id);
  else
    v_match_id := new.id;
  end if;

  select token into v_token from public.match_shares where match_id = v_match_id;
  if v_token is not null then
    perform public.send_match_share_signal(v_token);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create or replace function public.match_share_signal_for_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.send_match_share_signal(old.token);
  end if;
  if tg_op = 'UPDATE' and new.token is distinct from old.token then
    perform public.send_match_share_signal(new.token);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

revoke all on function public.match_share_signal_for_match() from public, anon, authenticated;
revoke all on function public.match_share_signal_for_share() from public, anon, authenticated;

drop trigger if exists match_share_signal on public.matches;
create trigger match_share_signal
after update on public.matches
for each row
when (
  old.status is distinct from new.status
  or old.runtime_state is distinct from new.runtime_state
  or old.score_for is distinct from new.score_for
  or old.score_against is distinct from new.score_against
  or old.starts_at is distinct from new.starts_at
  or old.started_at is distinct from new.started_at
  or old.opponent_name is distinct from new.opponent_name
  or old.discarded_at is distinct from new.discarded_at
)
execute function public.match_share_signal_for_match();

drop trigger if exists match_share_signal on public.match_events;
create trigger match_share_signal
after insert or update or delete on public.match_events
for each row
execute function public.match_share_signal_for_match();

-- A new share has no visitors yet; changes and the turn-off do.
drop trigger if exists match_share_signal on public.match_shares;
create trigger match_share_signal
after update or delete on public.match_shares
for each row
execute function public.match_share_signal_for_share();

-- Visitors (anon) may receive broadcasts on share topics. Nothing else in
-- realtime.messages, and no sending.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "match_share_signal_receive" on realtime.messages';
    execute $policy$
      create policy "match_share_signal_receive"
      on realtime.messages
      for select
      to anon, authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and (select realtime.topic()) like 'match-share:%'
      )
    $policy$;
  end if;
end;
$$;

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
