-- W7: In-app alerts (banners + bell)
-- Run this in the Supabase SQL editor BEFORE deploying the W7 build.
-- Safe to re-run (IF NOT EXISTS / exception-guarded).

create table if not exists alerts (
  id           uuid primary key default gen_random_uuid(),
  family_id    text not null,
  member_id    text,              -- null = family-wide; for parent alerts, the child the alert is about
  target_role  text not null,     -- 'parent' | 'child' | 'all'
  type         text not null,
  title        text not null,
  body         text,
  data         jsonb,             -- { payslipId, choreId, amount, stage, ... }
  channels     text[] not null,   -- ['banner','bell']
  dedupe_key   text,              -- optional idempotency key, e.g. 'overdue:{payslipId}'
  read_at      timestamptz,
  dismissed_at timestamptz,
  created_at   timestamptz default now()
);

create index if not exists idx_alerts_member
  on alerts(family_id, member_id, created_at desc);

-- NOTE: the blueprint specified a PARTIAL unique index (where dedupe_key is not
-- null), but PostgREST's on_conflict cannot target a partial index (Postgres
-- won't infer it without the predicate, which supabase-js can't send). A FULL
-- unique index is equivalent here: Postgres treats NULLs as distinct, so any
-- number of no-dedupe alerts still insert, while duplicate dedupe_keys are
-- rejected — createAlert upserts with ON CONFLICT (dedupe_key) DO NOTHING,
-- race-free across two parent devices.
create unique index if not exists idx_alerts_dedupe
  on alerts(dedupe_key);

-- Realtime: AlertBell badges update live via the existing family-sync channel.
do $$
begin
  alter publication supabase_realtime add table alerts;
exception
  when duplicate_object then null;  -- already in the publication
end $$;

-- RLS stays off like all tables until Phase B2.
-- Pruning (>30 days) is done client-side by deleteOldAlerts() on app load.
