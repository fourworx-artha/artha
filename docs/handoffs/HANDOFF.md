---
name: Artha — Launch Blueprint Handoff (post-session 23)
description: W1–W5 complete; W6 (stage system) is next
type: project
---

## ⚡ Next Session Starts Here

**W1 ✅ W2 ✅ W3 ✅ W4 ✅ W5 ✅ complete.**

```
Immediate next action: delete src/views/onboarding/Onboarding.jsx (unused), then start W6
Pre-req before going live: export JSON backup → reset → re-onboard with placeholder identities (D17/D19)
```

### W6 entry point
Start with **STEP 0**: read `calculatePayslip` and verify the engine resolves config as
`{ ...ENGINE_DEFAULTS, ...family.config, ...member.config }`. If not, fix and add a unit test first.
Full spec: `docs/ARTHA-LAUNCH-BLUEPRINT.md` W6 section.

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

**W6–W9:** not started.

**Roadmap position:**
- [x] Phases 1–5: Core payroll, credit, loans, rewards, analytics, device auth
- [ ] **Pre-distribution (THIS WORK — W1–W9):** Launch readiness (see blueprint)
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
| W6 | Stage system / guided period | **next** | W5 |
| W7 | In-app alerts (table + bell + banners) | pending | W6 |
| W8 | First-week checklist + empty states | pending | W5, W7 |
| W9 | Stage celebrations + guided-period graduation | pending | W6, W7 |

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

### Architecture decisions (not yet in code)

**Dynamic family_id (W4):**
- New `src/utils/family.js` with `getFamilyId()` / `setFamilyId()`
- `getFamilyId()` reads from `localStorage('artha_family_id')`, falls back to `VITE_DEV_FAMILY_ID` in DEV
- DeviceGate self-migrates existing claimed devices by backfilling from cached claim
- `FAMILY_ID` constant deleted entirely after mechanical replacement

**Stage system (W6) — critical design rules:**
- Stage is per-child and **derived** (not stored): `stage = f(settled payslip count)` + `family.config.stageOverride`
- Stage-gated economic keys (`autoSavePercent`, `interestRate`, `streakBonusEnabled`, `philanthropyPercent`) live **only in `member.config`**, never `family.config`
- Engine resolves config as: `{ ...ENGINE_DEFAULTS, ...family.config, ...member.config }`
- ENGINE_DEFAULTS: `{ autoSavePercent: 0, interestRate: 0, philanthropyPercent: 0, streakBonusEnabled: false }`
- Stage patches applied via shared `applyStagePatches(child, throughStage)` helper
- Guided period thresholds (weekly): Saver@2, Investor@3, Economist@5
- `payPeriod` locked to `'weekly'` until Economist (D16)

**Guided period stages:**

| Stage | Unlocks | Features added |
|-------|---------|----------------|
| Starter | Day one | Chores, salary, payslip, tax, rent, wallet, rewards, ledger |
| Saver | 2 settled | Savings account, auto-save 20%, interest 2%, savings projection, sparklines |
| Investor | 3 settled | Streak bonuses, sub-goals, analytics charts, net worth |
| Economist | 5 settled | Loans, credit score, philanthropy, family fund, vacation, utilities, full econ controls |

**Alerts table (W7):**
- New `alerts` table in Supabase with `dedupe_key` column + partial unique index
- `ON CONFLICT (dedupe_key) DO NOTHING` for race-free duplicate prevention
- Alert writes are always try/catch — a failed insert never fails the money operation
- Alerts inside the settle path fire from the JS wrapper AFTER the RPC succeeds

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
| `alerts` | **NEW (W7)** — in-app alerts with dedupe_key |
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
| `src/hooks/useStage.js` | **NEW (W6)** — derived stage + feature gating |
| `src/components/AlertBell.jsx` | **NEW (W7)** — bell icon + unread badge + feed sheet |
| `src/components/EventBanner.jsx` | **NEW (W7)** — stacked dismissible banners |
| `src/components/FirstWeekChecklist.jsx` | **NEW (W8)** — parent dashboard getting-started card |
| `src/components/InviteCodePanel.jsx` | **NEW (W5)** — shared extraction from InviteCode.jsx |

---

## Implementation Notes (carry into sessions)

**W7 — `payslip_settled` body omit `[saved]` for Starter**
At Starter stage `saved` is ₹0 (no auto-save) — looks odd. Omit the saved field from the body when `stage < 'saver'`.

**W7 — mark `payslip_ready` alert read when payslip is manually settled**
When `autoSettle: false`, both a `payslip_ready` and (later) a `payslip_settled` alert exist for the same payslip. After the settle RPC succeeds, mark any `payslip_ready` alert with `data.payslipId = X` as read.

---

## Prior session history

Full session-by-session record (sessions 1–18) in `docs/handoffs/HANDOFF.md` (legacy path). Session reports from session 19 onwards in `docs/sessions/`.
