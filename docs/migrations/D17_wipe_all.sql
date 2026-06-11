-- D17 — Full wipe for the fresh-start re-onboard (NO backup kept, per Dev 2026-06-11).
-- Empties all 13 tables so the next device load routes to onboarding
-- (checkFamilyExists() must find zero family rows — A9).
--
-- Run in the Supabase SQL editor. IRREVERSIBLE.
--
-- After running, on EVERY device (parent phones + each child device):
--   clear the site's localStorage (Settings → Clear site data, or
--   DevTools console: localStorage.clear()) and reload.
-- The first device then onboards fresh; child devices join via invite codes.
-- Use placeholder names + throwaway PINs (D19 — RLS is still off).

truncate table
  alerts,
  member_requests,
  reward_requests,
  utility_charges,
  chore_logs,
  transactions,
  payslips,
  rewards,
  chores,
  join_codes,
  device_claims,
  members,
  families
cascade;
