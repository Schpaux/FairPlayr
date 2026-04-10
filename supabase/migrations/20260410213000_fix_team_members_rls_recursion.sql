-- Fix recursive RLS on team_members and harden membership-based policies.

-- Security-definer helper to avoid self-referential policy recursion.
create or replace function public.is_team_member(_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = _team_id
      and tm.user_id = auth.uid()
  );
$$;

create or replace function public.is_team_owner(_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = _team_id
      and t.owner_id = auth.uid()
  );
$$;

-- Allow authenticated roles to execute helper checks.
revoke all on function public.is_team_member(uuid) from public;
revoke all on function public.is_team_owner(uuid) from public;
grant execute on function public.is_team_member(uuid) to anon, authenticated;
grant execute on function public.is_team_owner(uuid) to anon, authenticated;

-- TEAM_MEMBERS: drop old recursive policy and recreate per operation.
drop policy if exists "team_members_select_member" on public.team_members;
drop policy if exists "team_members_insert_owner_only" on public.team_members;
drop policy if exists "team_members_select_visible" on public.team_members;
drop policy if exists "team_members_insert_owner" on public.team_members;
drop policy if exists "team_members_update_owner" on public.team_members;
drop policy if exists "team_members_delete_owner_or_self" on public.team_members;

create policy "team_members_select_visible"
on public.team_members
for select
using (
  user_id = auth.uid()
  or public.is_team_member(team_id)
);

create policy "team_members_insert_owner"
on public.team_members
for insert
with check (
  public.is_team_owner(team_id)
);

create policy "team_members_update_owner"
on public.team_members
for update
using (
  public.is_team_owner(team_id)
)
with check (
  public.is_team_owner(team_id)
);

create policy "team_members_delete_owner_or_self"
on public.team_members
for delete
using (
  public.is_team_owner(team_id)
  or user_id = auth.uid()
);

-- TEAMS: use helper instead of inline subquery against team_members.
drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
on public.teams
for select
using (public.is_team_member(id));

-- PLAYERS: use helper for all membership checks.
drop policy if exists "players_select_member" on public.players;
create policy "players_select_member"
on public.players
for select
using (public.is_team_member(team_id));

drop policy if exists "players_insert_member" on public.players;
create policy "players_insert_member"
on public.players
for insert
with check (public.is_team_member(team_id));

drop policy if exists "players_update_member" on public.players;
create policy "players_update_member"
on public.players
for update
using (public.is_team_member(team_id))
with check (public.is_team_member(team_id));

drop policy if exists "players_delete_member" on public.players;
create policy "players_delete_member"
on public.players
for delete
using (
  source = 'manual'
  and public.is_team_member(team_id)
);

-- EXTERNAL TEAM LINKS: use helper for select/write checks.
drop policy if exists "external_team_links_select_member" on public.external_team_links;
create policy "external_team_links_select_member"
on public.external_team_links
for select
using (public.is_team_member(team_id));

drop policy if exists "external_team_links_insert_member" on public.external_team_links;
create policy "external_team_links_insert_member"
on public.external_team_links
for insert
with check (
  public.is_team_member(team_id)
  and created_by = auth.uid()
);

drop policy if exists "external_team_links_update_member" on public.external_team_links;
create policy "external_team_links_update_member"
on public.external_team_links
for update
using (public.is_team_member(team_id))
with check (
  public.is_team_member(team_id)
  and created_by = auth.uid()
);

drop policy if exists "external_team_links_delete_member" on public.external_team_links;
create policy "external_team_links_delete_member"
on public.external_team_links
for delete
using (public.is_team_member(team_id));
