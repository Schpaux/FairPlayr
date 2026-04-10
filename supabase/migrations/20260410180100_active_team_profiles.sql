-- Add active team preference for multi-team support.

alter table public.profiles
add column if not exists active_team_id uuid references public.teams(id) on delete set null;

create index if not exists idx_profiles_active_team_id on public.profiles(active_team_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (id = auth.uid())
with check (
  id = auth.uid()
  and (
    active_team_id is null
    or exists (
      select 1
      from public.team_members tm
      where tm.team_id = profiles.active_team_id
        and tm.user_id = auth.uid()
    )
  )
);
