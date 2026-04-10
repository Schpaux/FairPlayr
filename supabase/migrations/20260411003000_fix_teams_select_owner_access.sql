-- Fix team creation flow: allow owners to read their own team row immediately
-- after insert, before team_members row is created.

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
on public.teams
for select
using (
  owner_id = auth.uid()
  or public.is_team_member(id)
);
