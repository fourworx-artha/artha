---
name: Artha — Launch Blueprint Handoff (post-session 28)
description: W1–W9 ALL complete — launch blueprint code-complete; DB wiped (D17, no backup); next session = re-onboard fresh + verification pass → Phase A
type: project
---

## ⚡ Next Session Starts Here

**W1–W9 ALL ✅ — the Launch Blueprint is code-complete. The Supabase DB was WIPED
(D17_wipe_all.sql run 2026-06-11, NO backup — Dev chose to discard the data).
The app currently has ZERO families; devices still hold stale localStorage.**

```
Immediate next actions (the re-onboard, in order):
  1. On EVERY device (parent phones + each child device): clear site data /
     localStorage.clear() → reload. All app state is under artha_* keys.
  2. First device → fresh Arto onboarding. PLACEHOLDER names + throwaway PINs (D19 —
     RLS still off). Child devices join via invite codes.
  3. Update VITE_DEV_FAMILY_ID in .env.local to the NEW family UUID
     (Claude can fetch it from the families table via anon key) → restart dev server.
  4. Verification pass on the fresh family:
     - W8: first-week checklist (parent Dashboard) + child first-payday card
       (both only visible at 0 settled payslips)
     - W9: Generate Test History ×5 periods → Starter → Economist, all three gold
       celebration banners fire (saver / investor / economist)
     - Definition of Done checklist (blueprint Part 7) → then Phase A testing begins
Open audit items: A6–A9, A11–A18 — A6 (stale-balance settle) still needs a design decision
(A9's global checkFamilyExists is fine for the single-family re-onboard)
```

### W9 — shipped (session 28)
- `EventBanner.jsx`: celebratory gold variant keyed off `type === 'stage_unlocked'`
  (amber gradient + gold border/glow + gold title, built from the `--warning` token).
- `More.jsx`: Skip-guided-period confirm copy aligned to the W9 spec text verbatim;
  unused `childCount` prop removed.
- `STAGE_UNLOCKED_COPY` (payslip.js) verified verbatim against the W9 spec table — no change.
- Unit test locks the graduation invariant (5 settles → exactly 3 celebrations,
  mirroring the settle wrapper's count-based detection). 23/23 vitest; build clean.
- Generate Test History confirmed to drive the REAL settle path (`runPayslip` →
  `settlePayslip` RPC) — settling periods newest-first is safe (stage = count-based).
  The LIVE graduation smoke test needs the fresh family (old children were already Economist).

### D17 — executed (session 28)
- **No backup taken** — Dev explicitly discarded the historical data; the "fresh v4
  export" step is dropped (the v4 backup format itself stays in the app).
- In-app "Reset All History" was insufficient (keeps families/members/chores/rewards/
  device_claims; a surviving family row routes fresh devices to JoinFamily — A9).
- `docs/migrations/D17_wipe_all.sql` (NEW) — TRUNCATE … CASCADE across all 13 tables.
  **Run in Supabase 2026-06-11.** DB is empty; onboarding fires once localStorage is cleared.
- `.env.local` `VITE_DEV_FAMILY_ID` points at the deleted family — harmless until the
  re-onboard; update + dev-server restart afterwards (step 3 above).

### W8 — shipped (session 27)
- `FirstWeekChecklist.jsx` on the parent Dashboard (until ANY settled payslip): family created ✓,
  per-child device login (→ Invite Code), first chore logged (hint), first chore approved
  (→ Approve), ⏳ first payday (day name from `paydayDow`). Data: new `getFirstWeekProgress`
  op (device_claims + limit-1 chore_logs probes) + FamilyContext `settledCounts`.
- Bonus-chore hint (D7) after first settle — hidden once an active bonus chore exists;
  dismissal permanent per device (`artha_bonus_hint_dismissed`).
- Child Home first-payday card (until that child's first settled payslip; steps aside while
  a draft is pending): payday day name + "[N] chores done so far this week" (pending counts).
- Empty-state audit: shared `EmptyChartNote` ("Charts appear after a couple of paydays") in
  NetWorthChart / SavingsGrowthChart / CreditScoreLineChart / SpendingBreakdown / TopRewardsChart;
  SavingsGrowthChart now needs 2 ACTUAL points (projection-only was a flat zero line);
  bar charts render 1-point fine and stay gated at call sites; Sparkline keeps its dashed mini
  placeholder. Main exposure was Skip-guided-period (all charts unlock with zero history).

### W7 — shipped (session 26)
- `alerts` table (13th) — `docs/migrations/W7_alerts.sql`. **Deviation:** dedupe_key has a FULL
  unique index, not the blueprint's partial one — PostgREST `on_conflict` can't infer a partial
  index; NULLs are distinct so it behaves identically. `createAlert` upserts with
  `ignoreDuplicates: true` → ON CONFLICT DO NOTHING, race-free across two parent devices.
- `tryCreateAlert` is the standard write path — a failed alert insert never fails the money op;
  settle-path alerts fire from the JS wrapper AFTER the RPC.
- Launch catalog wired: settle wrapper fires `first_payslip` (count===1, INSTEAD of
  payslip_settled — never both) / `payslip_settled` (D9 summary body; `saved` omitted for
  Starter payslips) / `stage_unlocked` (W9 copy); Dashboard auto-run writes `payslip_ready`
  (manual mode, dedupe `ready:{id}`); `refreshBanners` writes `payslip_overdue` (dedupe
  `overdue:{id}`); operations.js fires `chore_approved`/`chore_rejected` (bell),
  `chores_all_done` (at LOG time, pending counts as done, dedupe `alldone:{member}:{date}`),
  `reward_approved` (banner+bell), `reward_rejected`, `cash_approved` (cash destination only).
- Computed banners (no table row, local per-day dismissal): `chores_due` (child Home),
  `approvals_pending` (Dashboard).
- UI: `AlertBell` (badge + feed sheet) + `EventBanner` (max 2, priority payslip > stage > rest)
  in Dashboard + child Home headers; `useAlerts` hook + `alertRoute(alert, role)`;
  `alerts` on FamilyContext's realtime channel; `deleteOldAlerts` (>30d, 24h guard) on load.
- Absorbed: Dashboard drafted + overdue local banners, ChildShell reward toast (removed).
- Settling retires that payslip's `payslip_ready`/`payslip_overdue` (read + dismissed).
- Alerts are ephemera: never in backups; cleared on reset (Backup.jsx) and import.

### W6 — shipped (session 25)
- Stage = derived per child: `deriveStage(settledCount, family.config.stageOverride)` — never stored.
  Thresholds: Saver@2, Investor@3, Economist@5. Pure helpers in `src/utils/stages.js`;
  data (STAGES / STAGE_PATCHES / FEATURE_STAGES / STAGE_GATED_KEYS) in `utils/constants.js`.
- `useStage(member)` / `useStages()` in `src/hooks/useStage.js`; `FamilyContext` exposes `settledCounts`.
- Advancement at settle: `settlePayslip` applies the cumulative patch via `applyStagePatches`
  (shared with Skip-guided-period in More.jsx and `addMember` under `stageOverride`).
- `ENGINE_DEFAULTS.streakBonusEnabled` is now **false** (interim `true` retired) — safe because
  `migrateStageConfig` (one-shot, in FamilyContext load) backfills pre-W6 families: copies
  effective stage-key values into each child's `member.config`, then strips them from `family.config`.
- `runPayslip` stamps `stage` into drafts; PayslipCard removes rows above the payslip's stage
  (legacy null = economist/full). Onboarding mock payslip is `stage: 'starter'`.
- EconomicControls: guided mode pre-Economist (tax/rent/payday-dow/autoSettle/per-child auto-save);
  all config writes merge + append `configTouched` per layer (A10 fixed); stage-gated keys written
  only to children whose stage unlocked them.
- Route guards: ChildStageRoute (/child/savings, /goal, /family-fund), ParentStageRoute
  (/parent/loans, /tax-fund, /vacation, /utilities).

---

## 🔍 W1–W5 Consistency Audit (2026-06-11 — code review only, nothing fixed yet)

Full read-through of W1–W5 work. Findings ordered by severity. **No code was changed.**

### 🔴 Critical — fix before W6

> **✅ A1, A2, A3 fixed (2026-06-11, same session as audit).**
> - A1: `ENGINE_DEFAULTS` pulled forward into `src/engine/payslip.js` — `calculatePayslip` now resolves `{ ...ENGINE_DEFAULTS, ...familyConfig }`, killing NaN at the source; regression test added (13/13 pass). NOTE: `streakBonusEnabled` defaults **true** in ENGINE_DEFAULTS for now (no existing config has the key; `false` would have silently disabled streak bonuses for the live family). W6 stage patches must flip it to `false` once member.config backfill exists.
> - A2: `App.jsx` DeviceGate now reads `cached?.familyId` (camelCase).
> - A3: `autoSettle` removed from the W5 starter config (stays `undefined` so the first-settle prompt fires); dead prompt check removed from the Dashboard auto-settle branch. This amends session-23's documented starterConfig (which listed `autoSettle: false`).

**A1. New onboarded families produce NaN payslips (W5 ↔ W6 sequencing bug).**
`OnboardingFlow.jsx` starterConfig deliberately omits `autoSavePercent` / `interestRate` / `philanthropyPercent` / `streakBonusEnabled` (stage-gated keys), but the W6 `ENGINE_DEFAULTS` layer that would supply defaults **does not exist yet**. `calculatePayslip` (`src/engine/payslip.js:178`) computes `roundRupees(net * config.autoSavePercent)` → `NaN` when the key is missing (`roundRupees(NaN)` = `NaN`). NaN propagates into `allocations.spending`, `balancesAfter.spending`, and the draft row (serialised as `null` in JSON). The W2 RPC then writes corrupt `balances_after` into `members.accounts` at settle. Any family created through the new onboarding gets a broken first payslip on its first payday. Also: `streakBonusEnabled` missing → engine defaults it **true** (`config.streakBonusEnabled !== false`), contradicting Starter-stage intent. Interim fix options: write explicit zeros into starterConfig, or pull `ENGINE_DEFAULTS` forward (it's W6 STEP 0 anyway).

**A2. W4 device self-migration never fires (key-case bug).**
`App.jsx:79` checks `cached?.family_id`, but the cached claim is always stored camelCase (`familyId`) — both `getDeviceClaim()` and `claimDevice()` return `{ deviceId, familyId, memberId }`. The backfill of `artha_family_id` for pre-W4 devices therefore never runs; in prod (`!DEV`) `getFamilyId()` returns `null` on those devices and every query targets a null family. Fix: `cached?.familyId`.

**A3. First-settle teaching prompt can never appear for onboarded families (W3 ↔ W5 conflict).**
starterConfig sets `autoSettle: false`, but `checkFirstSettlePrompt` (`Dashboard.jsx:616`) only fires when `autoSettle` is `undefined`/`null`. New families will never see the automation choice that W3 was built around. Additionally, the prompt check inside the auto-settle branch (`Dashboard.jsx:599–607`) is dead code: it tests `autoSettle === undefined` inside `if (family.config?.autoSettle)` — can never both be true. Decide: either onboarding omits `autoSettle`, or the prompt logic uses a separate `autoSettleChosen` marker.

### 🟠 High

> **✅ A4, A5 fixed (2026-06-11, same session).**
> - A4: parent creation in `Members.jsx` now relies on `addMember`'s canonical default; child creation includes `philanthropy/subGoals/loan` (keeping `goalJar`); the child **edit** path spreads canonical defaults first, so legacy-shaped members self-heal on save; `seed.js` members get the full shape; `updateMember` now runs `validateAccounts` when `accounts` is in the changes (bypass closed). NOTE: existing DB rows with the legacy shape are healed only on Members-edit or settle — parents created pre-fix keep the old shape until edited (no money ops touch parents, so harmless).
> - A5: backup format bumped to **version 4** — export now includes `member_requests`; import restores payslip `status` / `pending_transactions` / `credit_delta` / `bonus_potential`, maps reward `price → cost` (with pre-v4 `cost` fallback), and clears + re-inserts `member_requests`. `join_codes`/`device_claims` deliberately stay out of backups (device-bound, ephemeral).

**A4. `Members.jsx` and `seed.js` create members with the legacy accounts shape — W1 validation then bricks money ops.**
`Members.jsx:81` creates children with `{ spending: 0, savings: 0, goalJar }` (no `philanthropy`, no `subGoals`, no `loan`); `Members.jsx:67` creates parents without `subGoals`; `seed.js` seeds all four members with the `goalJar` shape. W1's `validateAccounts` (`operations.js:212`) requires finite `philanthropy` and an array `subGoals`, so **any** `updateMemberAccounts` call for these members throws — giveBonus, approveRewardRequest, transfers, reset, all of it. The seeded dev family fails the same way. Also `updateMember(id, { accounts })` (`operations.js:209`) bypasses `validateAccounts` entirely (the Members edit path uses it).

**A5. Backup restore silently corrupts W2 payslips and reward prices.**
- `importAllData` (`operations.js:1301–1316`) re-inserts payslips **without** `status`, `pending_transactions`, `credit_delta`, `bonus_potential`. A backed-up draft comes back with `status` null → `mapPayslip` defaults it to `'settled'` — the draft is now unsettleable and looks settled without its balances ever applied.
- Export maps reward `cost → price` (`mapReward`), but import reads `r.cost` (`operations.js:1271`) → every restored reward has `cost: undefined`.
- `exportAllData` omits `member_requests` entirely (pending donations/votes/withdrawals lost; stale rows also aren't deleted on import).
This matters now: the pre-live plan is "export → reset → re-onboard" (D17/D19).

**A6. Settle overwrites interim wallet activity (W2 design risk).**
`settle_payslip` RPC sets `accounts = balances_after` wholesale — values computed at **draft** time. Any transaction between draft and settle (reward purchase, parent bonus, savings↔wallet transfer, early loan repayment) is silently reverted. The window is real: W3 auto-runs drafts on payday, manual-mode parents may settle days later (the overdue-drafts banner exists precisely because of this). Consider: RPC re-derives balances from deltas, or blocks/queues wallet ops while a draft exists, or recomputes the draft at settle time.

### 🟡 Medium

**A7. Missed payday = silently skipped payslip.** Auto-run (`Dashboard.jsx:594`) fires only when `payday === true` and a parent opens the dashboard that day. W3 removed the manual Run button and `RunPayslipButton` renders `null` in the `run` phase. If no parent opens the app on payday, that period's payslip is never created and no UI can create it. Known Phase G (cron) gap, but worth an interim "Run missed payslip" affordance.

**A8. Onboarding create has no rollback/idempotency.** `createFamily` calls `setFamilyId(familyId)` *before* inserting; if the insert fails, localStorage points at a non-existent family. If `handleCreate` fails partway (child insert, chore insert), retrying creates a **second** family with a new UUID, orphaning the first (`OnboardingFlow.jsx:179–242`, `operations.js:1500`).

**A9. `checkFamilyExists()` is global, contradicting W4/W5 direction.** Any family row in the DB routes every new device to 'join' — a second family can permanently never onboard (`operations.js:1489`, used in `App.jsx:87`). Acceptable single-family stopgap, but must become a per-device decision before distribution; flagging so it isn't forgotten.

> **✅ A10 fixed (2026-06-11, session 25, as part of W6).** All EconomicControls writes now merge into the existing config (vacation + stage keys survive) and append changed keys to that layer's `configTouched`; "Reset to defaults" preserves vacation and re-seeds stage patches.

**A10. EconomicControls clobbers `member.config.vacation` (and future W6 stage keys).** "Same for all" save clears child configs via `updateMemberConfig(ch.id, null)`; per-child save replaces the whole config with just `economicFields` (`EconomicControls.jsx:186–197`). Either path wipes the `vacation` flag written by `setMemberVacation`. W6's per-child stage-gated keys will live in the same object — this write pattern must become a merge.

**A11. `autoPayslip` backwards-compat is read in only one place.** `EconomicControls.jsx:96` reads `c.autoSettle ?? c.autoPayslip`, but the Dashboard auto-settle path reads `family.config?.autoSettle` directly. A legacy family with only `autoPayslip: true` shows the toggle ON in EconomicControls yet never auto-settles.

### 🟢 Low / cosmetic

- **A12.** Onboarding payslip preview footer shows "Generated Invalid Date" — `buildMockPayslip` has no `createdAt` (`PayslipCard.jsx:226`). Preview also formats in INR even when another currency was detected (known/accepted per session 23).
- **A13.** Onboarding step counters are inconsistent: "STEP x OF 8" across 11 screens; PARENT_PIN repeats "STEP 2", CHILD_PROFILE/PIN/ADD_MORE all say "STEP 3", and 7–8 never appear.
- **A14.** `src/views/onboarding/Onboarding.jsx` still present, unimported (already scheduled for deletion).
- **A15.** Backup "Generate Test History" tool: inserts `utility_charges` with `label`/`charged_at`/`family_id` keys while the real schema/ops use `reason` (insert errors are unchecked → silently no utility charges); donation backdate targets `type = 'donation'` but donations are written as `type: 'withdrawal'`; `.order().limit()` chained on an `update()` is not valid PostgREST (risks backdating *all* parent_bonus rows). Dev-only tool.
- **A16.** `detectCurrency` has no EUR country mapping although EUR is in `CURRENCIES` (European users silently get INR).
- **A17.** Ledger asymmetry: `interestTax` taxes savings **+ sub-goal** interest, but only savings interest is recorded as an income transaction — sub-goal interest never appears in the ledger (`payslip.js:401–405` vs `:226–227`).
- **A18.** `getPayslipForPeriod` uses `.single()` and treats PGRST116 as "not found" — but PGRST116 also fires for *multiple* rows, so the duplicate-run guard in `runPayslip` would pass if 2+ payslips ever share a `period_end` (the W2 unique index only covers drafts).

---

## Current Status

**W1 ✅** — `validateAccounts()` guard in `operations.js`; `addMember` default accounts fixed; `Backup.jsx` reset spread bug fixed.

**W2 ✅** — Atomic settlement RPC deployed.
- `docs/migrations/W2_settle_payslip_rpc.sql` run in Supabase ✅
- `payslips` table has new columns: `pending_transactions jsonb`, `credit_delta integer`
- `payslips_member_period_uniq` partial unique index on `(member_id, period_start) WHERE status='draft'`
- `settle_payslip(p_payslip_id)` Postgres function live
- `runPayslip` now pre-computes all transactions + credit delta at draft time
- `settlePayslip` is a 1-line wrapper: `return rpcSettlePayslip(payslipId)`

**W3 ✅** — Auto-run drafts + zero-case hardening + first-settle flow.
- `streakBonusEnabled` guard in `calculatePayslip` (defaults `true` for existing families)
- Vitest installed; 12 zero-case tests in `src/engine/payslip.test.js` — all pass
- `autoPayslip` → `autoSettle` rename (backwards compat: reads `c.autoSettle ?? c.autoPayslip`)
- Dashboard auto-run fires on every payday; auto-settles if `family.config.autoSettle: true`
- Manual "Run Payslip" button removed; `RunPayslipButton` shows "Settle Pay" (draft) or "✓ Settled"
- First-settle prompt: fires after any settle when `autoSettle` is undefined — asks parent to choose automation mode

**W4 ✅** — Dynamic family_id.
- `src/utils/family.js` with `getFamilyId()` / `setFamilyId()`; reads `localStorage`, falls back to `VITE_DEV_FAMILY_ID` in DEV
- `FAMILY_ID` constant deleted from `constants.js`; all 17 import sites migrated to `getFamilyId()`
- `createFamily` generates UUID + calls `setFamilyId`; `claimDevice` calls `setFamilyId` after claim
- `DeviceGate` self-migrates existing devices synchronously before state init

**W5 ✅** — Onboarding flow shipped.
- `OnboardingFlow.jsx` (10 steps): Welcome → Family → Parent profile/PIN → Child profile/PIN → Add more → Chores → Payday → Preview → Handoff
- `InviteCodePanel.jsx` extracted as shared component; `InviteCode.jsx` refactored to use it
- Starter config written on completion (no stage-gated keys)
- `createFamily` accepts optional `config` param; `seed.js` DEV guard added + import fixed
- PWA manifest + `<title>` + apple meta renamed to "Arto"
- `Onboarding.jsx` (old) still present — delete before W6

**W6 ✅** — Stage system / guided period (session 25).
- Derived stages + thresholds; `useStage`/`useStages`; per-child settled counts in FamilyContext
- `applyStagePatches` shared helper (settle advancement / skip-guided / addMember-under-override)
- `migrateStageConfig` one-shot self-migration for pre-W6 families; `ENGINE_DEFAULTS.streakBonusEnabled` now `false`
- Stage stamped in payslip drafts (**requires `docs/migrations/W6_payslips_stage.sql`**); stage-aware PayslipCard
- Child + parent surfaces gated per feature map; route guards; "Skip the guided period" in More
- EconomicControls guided mode + merge writes + `configTouched` (A10 fixed)

**W7 ✅** — In-app alerts (session 26).
- `alerts` table + `docs/migrations/W7_alerts.sql` (**must run in Supabase before deploy**)
- `createAlert`/`tryCreateAlert` + full catalog insertion points (settle wrapper, chore/reward/cash ops, Dashboard auto-run + overdue check, addChoreLog all-done)
- `AlertBell` + `EventBanner` + `useAlerts`/`alertRoute`; realtime via family-sync channel
- Absorbed: drafted/overdue Dashboard banners, ChildShell reward toast
- stage_unlocked alerts already firing (W9 copy inline in payslip.js)

**W8 ✅** — First-week checklist + empty states (session 27).
- `FirstWeekChecklist.jsx` + `getFirstWeekProgress` op; bonus-chore hint (D7); child first-payday card
- `EmptyChartNote` across all chart components; SavingsGrowthChart needs 2 actual points

**W9 ✅** — Stage celebrations + graduation (session 28).
- Celebratory gold banner variant in EventBanner (`type === 'stage_unlocked'`)
- Skip confirm copy aligned to spec; graduation invariant unit test (23/23)
- Live graduation smoke test deferred to the fresh-family verification pass

**Roadmap position:**
- [x] Phases 1–5: Core payroll, credit, loans, rewards, analytics, device auth
- [x] **Pre-distribution (W1–W9): code-complete** (session 28) — verification pass on the
      fresh family pending (re-onboard → Generate Test History ×5 → DoD checklist)
- [ ] Phase B2: RLS on all tables + realtime channel family_id filters
- [ ] Phase C: Supabase Auth (email+password founding parent), account deletion
- [ ] Phase D: Legal & compliance — Privacy Policy, ToS, COPPA/GDPR-K
- [ ] Phase E: Capacitor native app — bundle ID `com.fourworx.arto` (NOT com.artha.app — D13)
- [ ] Phase F: Monetisation — RevenueCat, subscription
- [ ] Phase G: Push notifications + server cron for midnight auto-payslip

**App name (D12):** User-facing = **Arto**. Internal/repo codename = Artha. No mass rename.

**Security (D19):** RLS is off. Do not use real names or PINs during Phase A testing.

---

## Workstream Plan (W1–W9)

| # | Workstream | Status | Depends on |
|---|-----------|--------|-----------|
| W1 | Accounts validation guard | ✅ done | — |
| W2 | Atomic settlement RPC | ✅ done | W1 |
| W3 | Auto-run drafts + zero-case hardening + first-settle flow | ✅ done | W2 |
| W4 | Dynamic family_id + dev-device self-migration | ✅ done | — |
| W5 | Onboarding flow (incl. device handoff) | ✅ done | W3, W4 |
| W6 | Stage system / guided period | ✅ done | W5 |
| W7 | In-app alerts (table + bell + banners) | ✅ done | W6 |
| W8 | First-week checklist + empty states | ✅ done | W5, W7 |
| W9 | Stage celebrations + guided-period graduation | ✅ done (live smoke test → fresh family) | W6, W7 |

Full specs in `docs/ARTHA-LAUNCH-BLUEPRINT.md` Part 4.

---

## Architecture

**Stack:** React 19 + Vite 8 + TailwindCSS 4 + Supabase (PostgreSQL + Realtime) + PWA

**Supabase project:** `uhmpjkalbzkhrhibgyba`
**Deployed:** `https://artha-indol.vercel.app` → moving to `arto.fourworx.com` post-W5
**GitHub:** `https://github.com/fourworx-artha/artha`
**HANDOFF lives at:** `docs/handoffs/HANDOFF.md` (not root)

### Key conventions (must not break)
- All DB access via `src/db/operations.js` — views never import Supabase directly
- Engine functions (`src/engine/`) are pure — no DB calls inside them
- Currency: `useCurrency()` hook → `fmt(amount)` — never hardcode ₹ symbol
- Period dates: `usePeriod()` hook → `{ periodStart, periodEnd, progressPeriodStart, progressPeriodEnd, paydayToday }`
- `getFamilyId()` from `src/utils/family.js` — replaces deleted `FAMILY_ID` constant (W4 ✅)

### Architecture decisions (implemented)

**Accounts validation (W1):**
- `validateAccounts(accounts)` runs at top of `updateMemberAccounts` — throws if balances are non-finite or subGoals is not an array
- Every call site that was missing `...member.accounts` spread has been fixed

**Atomic settlement RPC (W2):**
- `settle_payslip(p_payslip_id)` Postgres function — single transaction for all 6 writes
- `runPayslip` pre-computes `pendingTransactions` + `creditDelta` at draft time; stored in the draft row
- `settlePayslip` in `payslip.js` delegates entirely to `rpcSettlePayslip` from `operations.js`
- Tax fund update uses atomic increment (`balance = balance + delta`) — not read-modify-write

**Stage system (W6) — ✅ all in code (session 25):**
- Stage is per-child and **derived** (not stored): `deriveStage(settledCount, family.config.stageOverride)` in `src/utils/stages.js`
- Stage-gated economic keys (`autoSavePercent`, `interestRate`, `streakBonusEnabled`, `philanthropyPercent`) live **only in `member.config`** — `migrateStageConfig` moved pre-W6 values out of `family.config` (effective values, then strip)
- Engine resolves config as: `{ ...ENGINE_DEFAULTS, ...family.config, ...member.config }`
- ENGINE_DEFAULTS: `{ autoSavePercent: 0, interestRate: 0, philanthropyPercent: 0, streakBonusEnabled: false }` — final spec values
- Stage patches via shared `applyStagePatches(child, throughStage)` (operations.js) — three callers: settle advancement, Skip guided period, addMember under override; `configTouched` (per layer) protects parent edits
- Guided period thresholds (weekly): Saver@2, Investor@3, Economist@5; `payPeriod` locked `'weekly'` until Economist (D16)
- `settlePayslip` returns `{ settled, stageAdvanced }` — W9 celebrations consume `stageAdvanced`
- Settled counts treat legacy NULL `status` as settled (matches `mapPayslip`)

**Guided period stages:**

| Stage | Unlocks | Features added |
|-------|---------|----------------|
| Starter | Day one | Chores, salary, payslip, tax, rent, wallet, rewards, ledger |
| Saver | 2 settled | Savings account, auto-save 20%, interest 2%, savings projection, sparklines |
| Investor | 3 settled | Streak bonuses, sub-goals, analytics charts, net worth |
| Economist | 5 settled | Loans, credit score, philanthropy, family fund, vacation, utilities, full econ controls |

**Alerts table (W7) — ✅ shipped (session 26):**
- `alerts` table with `dedupe_key` + FULL unique index (NOT partial — PostgREST `on_conflict`
  can't infer a partial index; NULLs are distinct so behaviour is identical)
- `ON CONFLICT (dedupe_key) DO NOTHING` via upsert `ignoreDuplicates` — race-free duplicates
- Alert writes are always try/catch (`tryCreateAlert`) — a failed insert never fails the money operation
- Alerts inside the settle path fire from the JS wrapper AFTER the RPC succeeds
- Ephemera: never in backups, cleared on reset/import, pruned client-side >30 days

### Supabase tables (current + planned)

| Table | Notes |
|-------|-------|
| `families` | config JSON — family-level settings only; stage-gated keys removed in W6 |
| `members` | `config` JSON — per-child stage-gated keys live here (W6) |
| `chores` | mandatory \| bonus; assignedTo array |
| `chore_logs` | pending \| approved \| rejected |
| `transactions` | typed; salary/tax/rent/interest/bonus/reward/etc |
| `payslips` | draft \| settled; has `pending_transactions`, `credit_delta` (W2 ✅); gains `stage` field in W6 |
| `rewards` | rewards store |
| `reward_requests` | child redemption queue |
| `utility_charges` | ad-hoc charges |
| `member_requests` | donation / subgoal_withdrawal / tax_goal_vote / cash_withdrawal |
| `join_codes` | 6-char invite codes, 10-min TTL |
| `device_claims` | device_id → family_id + member_id |
| `alerts` | **NEW (W7 ✅)** — in-app alerts with dedupe_key (full unique index); migration `docs/migrations/W7_alerts.sql` |
| _(unique index)_ | `payslips_member_period_uniq` on `(member_id, period_start) WHERE status='draft'` — **done W2 ✅** |

### Key files

| File | Purpose |
|------|---------|
| `src/db/operations.js` | All ~50 DB operations; camelCase↔snake_case mappers |
| `src/engine/payslip.js` | `calculatePayslip` (pure) + `runPayslip` + `settlePayslip` (RPC wrapper) |
| `src/engine/chores.js` | `calculateStreak` |
| `src/engine/interest.js` | `calculateWeeklyInterest` |
| `src/context/FamilyContext.jsx` | Realtime subscription; `reloadCount` trigger |
| `src/context/DeviceContext.jsx` | `DeviceContext` + `useDevice` hook |
| `src/App.jsx` | Routes + `DeviceGate` + shells |
| `src/auth/PinAuth.jsx` | Avatar grid + PIN pad |
| `src/views/auth/JoinFamily.jsx` | First-time device code entry |
| `src/views/parent/InviteCode.jsx` | Parent generates invite codes |
| `src/utils/constants.js` | `FAMILY_ID` (deleted in W4), defaults, stage defs (added in W6) |
| `docs/handoffs/HANDOFF.md` | **← this file** (not root HANDOFF.md) |
| `src/views/onboarding/OnboardingFlow.jsx` | **NEW (W5)** — replaces Onboarding.jsx |
| `src/utils/family.js` | **NEW (W4)** — `getFamilyId()` / `setFamilyId()` |
| `src/hooks/useStage.js` | **NEW (W6 ✅)** — `useStage` / `useStages` hooks |
| `src/utils/stages.js` | **NEW (W6 ✅)** — pure stage derivation + patch computation |
| `docs/migrations/W6_payslips_stage.sql` | **NEW (W6 ✅)** — `payslips.stage` column (RUN IN SUPABASE) |
| `src/components/AlertBell.jsx` | **NEW (W7 ✅)** — bell icon + unread badge + feed sheet |
| `src/components/EventBanner.jsx` | **NEW (W7 ✅)** — stacked dismissible banners (max 2, priority) |
| `src/hooks/useAlerts.js` | **NEW (W7 ✅)** — alert feed hook + `alertRoute(alert, role)` |
| `docs/migrations/W7_alerts.sql` | **NEW (W7 ✅)** — alerts table (RUN IN SUPABASE before deploy) |
| `src/components/FirstWeekChecklist.jsx` | **NEW (W8 ✅)** — parent dashboard getting-started card |
| `src/components/EmptyChartNote.jsx` | **NEW (W8 ✅)** — shared chart empty-state placeholder |
| `src/components/InviteCodePanel.jsx` | **NEW (W5)** — shared extraction from InviteCode.jsx |

---

## Implementation Notes (carry into sessions)

> ✅ Both session-25 W7 notes implemented in session 26: the settle summary body omits
> `saved` for Starter-stage payslips, and `markPayslipPromptAlertsHandled(payslipId)`
> retires `payslip_ready` AND `payslip_overdue` (read + dismissed) after the settle RPC.

> ✅ W9 implemented in session 28: celebratory variant in `EventBanner.jsx` keyed off
> `type === 'stage_unlocked'`; copy verified against spec; graduation invariant unit-tested.
> Only the LIVE graduation pass remains — runs on the fresh family after the re-onboard.

**W8 — checklist queries already exist**
FirstWeekChecklist needs: device_claims (child claim), chore_logs (any row / any approved),
payslips settled (hides card) — all readable through existing operations.

---

## Prior session history

Full session-by-session record (sessions 1–18) in `docs/handoffs/HANDOFF.md` (legacy path). Session reports from session 19 onwards in `docs/sessions/`.
