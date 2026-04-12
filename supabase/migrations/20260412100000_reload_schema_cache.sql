begin;

-- Ensure report_generated_at column exists (idempotent)
alter table public.matches
  add column if not exists report_generated_at timestamptz;

-- Reload PostgREST schema cache so new columns are visible
notify pgrst, 'reload schema';

commit;
