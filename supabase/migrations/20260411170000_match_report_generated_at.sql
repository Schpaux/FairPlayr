begin;

alter table public.matches
  add column if not exists report_generated_at timestamptz;

commit;
