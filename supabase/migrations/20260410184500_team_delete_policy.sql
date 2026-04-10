-- Allow team owners to delete their own teams.

drop policy if exists "teams_delete_owner" on public.teams;
create policy "teams_delete_owner"
on public.teams
for delete
using (owner_id = auth.uid());
