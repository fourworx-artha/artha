-- W6: Stage system / guided period
-- Run this in the Supabase SQL editor BEFORE deploying the W6 build.
-- Safe to re-run (IF NOT EXISTS).

-- Stage the payslip was earned at ('starter' | 'saver' | 'investor' | 'economist').
-- NULL on pre-W6 rows — PayslipCard renders those with all rows (economist).
alter table payslips
  add column if not exists stage text;

-- Note: the family.config / member.config changes (stage-gated keys moving to
-- member.config, configTouched, stageOverride) are plain JSON — no DDL needed.
-- The app self-migrates pre-W6 configs on first load (migrateStageConfig).
