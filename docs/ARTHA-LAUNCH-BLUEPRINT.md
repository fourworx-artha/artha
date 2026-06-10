# ARTHA — LAUNCH BLUEPRINT (Rev 2, final, self-contained)

> **This document supersedes** ARTHA-REDESIGN-PLAN-v2, ARTHA-NOTIFICATIONS-PLAN-v3, and
> Blueprint Rev 1. Do not consult those files. Everything needed is here.
>
> **Audience:** Claude Code (implementation) and Dev (review).
> **Scope:** pre-distribution product work — onboarding, guided-period stages, in-app alerts,
> settlement safety, dynamic family ID, first-week retention. Solo dev, part-time, PWA-only,
> global audience. Monetisation, push notifications, RLS, and native app are OUT of scope
> (Phases B2/E/F/G of the existing roadmap).

## Rev 2 changelog (what changed since Rev 1)

1. **Stage config patches are per-child, never family-level** (fixes the multi-child leak bug).
   Stage-gated economic keys now live ONLY in `member.config` — see W6.
2. **Guided period introduced.** Thresholds: Saver @ 2, Investor @ 3, Economist @ 5 settled
   payslips. `payPeriod` locked to weekly until Economist; onboarding no longer asks
   weekly/monthly. *(Dev: if you prefer Economist @ 4 for a strict "first month" frame, change
   one number in W6 — everything else holds.)*
3. **All former open questions answered** (Q1 reset = yes; Q2 timezone = yes; Q3 security = option c,
   fake data during Phase A; Q4 thresholds = 2/3/5). Open-questions section is gone; only the
   pinned subtitle remains.
4. **W4 gains a zero-touch dev-device migration** (DeviceGate backfills `artha_family_id` from
   the cached device claim — required, not optional).
5. **W5 screen copy corrected to Arto** (D12); payday screen simplified; InviteCode extraction
   is now mandatory.
6. **W6 gains the explicit Starter child-view spec**, stage-aware PayslipCard, Economic Controls
   gating during the guided period, an engine config-merge verification as step 0, and Generate
   Test History named as the stage-testing tool.
7. **W3 test list extended** to 0-rate engine paths (interestRate/autoSavePercent = 0).
8. **W7:** `createAlert` stays in operations.js but alert writes must NEVER fail the money
   operation (try/catch rule); pruning gets a 24h localStorage guard.
9. **W9:** Economist celebration reframed as guided-period graduation; "Unlock All" becomes
   "Skip the guided period".

**Rev 2.1 additions:**

10. **`chores_all_done` fires at LOG time** (pending counts as done — consistent with the
    existing credit-score principle); `chore_rejected` is the correction if a log is rejected.
11. **Alert deduplication is atomic:** new `dedupe_key` column + partial unique index; closes
    the P1/P2 check-then-insert race for `payslip_overdue` and `chores_all_done`.
12. **"Skip the guided period" applies the cumulative stage patches** to every Tier 2 child via
    a shared `applyStagePatches` helper (no zero-rate Economist); children added after a skip
    get the patch at creation.
13. W6 files list gains `OnboardingFlow.jsx` — the screen-7 mock payslip needs `stage: 'starter'`
    once PayslipCard is stage-aware.

---

# PART 1 — THE DIRECTION

## What's changing and why

Artha is feature-complete but built as a personal tool: every feature visible at once, no
onboarding, hardcoded family, manual payslip ritual, silent UI. To distribute it, five shifts:

1. **The Guided Period.** New families start with a minimal economy (chores → salary →
   tax/rent → wallet → rewards) and unlock savings, then analytics, then the full economy over
   their **first five paydays**. One concept per stage; the staged reveal IS the curriculum.
   At Economist the guided period ends and the parent gains full control of the financial
   environment ("hand-holding until you can decide your own economy").
2. **Guided onboarding** that takes a parent from install to "child can earn" in under
   5 minutes, ending with the child's device claimed — not just the parent's dashboard.
3. **Auto-run payslips, taught-then-automated settlement.** Drafts always auto-create on
   payday. The FIRST settle is manual and guided (the core teaching moment); afterwards the
   parent is offered auto-settle.
4. **In-app alerts** (banners + bell feed). No push — push's flagship case (payday alert when
   the app is closed) is impossible without the Phase G server cron; all push work moves there.
5. **Money-safety hardening:** atomic settlement via Postgres RPC, accounts validation, dynamic
   `family_id` (the half of Phase B that onboarding requires).

## Critical design rules (apply throughout)

- **Stage gating is config-driven in the ENGINE, not just the UI** — and stage-gated economic
  keys (`autoSavePercent`, `interestRate`, `streakBonusEnabled`, `philanthropyPercent`) exist
  **only in `member.config`, never in `family.config`**. The engine falls back to 0/false when
  absent. This makes the "UI hides the card while config still allocates money" bug structurally
  impossible, including for siblings at different stages.
- **No surveillance/shame notifications.** Nothing that reports a child's failure to the parent
  by default ("didn't log chores", "only earned X%", "streak broken").
- **No hardcoded currency anywhere.** All copy uses `fmt()` from `useCurrency()`; all default
  amounts are computed from the child's salary.
- **Tier 1 (coin jar) is untouched and orthogonal.** Tiers = age choice at child creation.
  Stages = guided-period progression for Tier 2 children only.
- **Alert writes never fail money operations.** Every `createAlert` call is wrapped so a failed
  insert logs a warning and the approval/settle proceeds.
- Existing conventions hold: all DB access via `operations.js`, engine functions stay pure,
  views never import Supabase.

---

# PART 2 — DECISIONS (all final; no open questions remain)

| # | Decision |
|---|----------|
| D1 | Stage is **per-child and derived**: `stage(child) = f(that child's settled payslip count)` + family-level `stageOverride` for "Skip the guided period". No stored stage column. New siblings start at Starter. |
| D2 | Tier 1 children do not participate in stages. |
| D3 | First payslip = manual settle with guided review; then prompt to enable auto-settle (prompt defaults to Yes). |
| D4 | Onboarding rent default = ~5% of the entered salary, rounded to a clean number, stored flat. |
| D5 | Currency auto-detected from locale with a "Change" link in onboarding. |
| D6 | Onboarding adds ONE child, with "Add another child" and "Skip — add more later". |
| D7 | No bonus chores in onboarding; a dismissible hint card on the parent dashboard introduces them after the first settle. |
| D8 | Stage names visible to both parent and child (framed as levels for the child). |
| D9 | Weekly-summary content folds into the payslip-settled alert body — not separate alerts. |
| D10 | `seed.js` becomes dev-only (`import.meta.env.DEV`); onboarding is the sole production path. |
| D11 | Alerts live in a new Supabase `alerts` table — supports read/unread, simple write points. |
| D12 | **App name: Arto.** In-app and to children it is just "Arto"; store listings and marketing use "Arto by Fourworx". "Artha" remains the internal/repo codename — no mass rename of code, docs, or DB identifiers. All user-facing copy in this plan (onboarding screens, alerts) says **Arto**. |
| D13 | **Bundle ID for Phase E: `com.fourworx.arto`** — NOT `com.artha.app` as older HANDOFF.md notes say. Bundle IDs are permanent once published; `com.fourworx.<app>` is the suite pattern. **Claude Code: correct the Phase E commands in HANDOFF.md and CLAUDE.md** (`npx cap init Arto com.fourworx.arto --web-dir dist`) next time either file is updated. |
| D14 | **Web home:** PWA at `arto.fourworx.com` (Vercel custom domain, replaces artha-indol.vercel.app); marketing at `fourworx.com/arto`; Phase D legal URLs reserved: `fourworx.com/arto/privacy`, `fourworx.com/arto/terms`. No standalone domains. |
| D15 | **Guided period thresholds (weekly payslips):** Saver @ 2 · Investor @ 3 · Economist @ 5. Marketing frame: "Five paydays. That's the guided period." |
| D16 | **`payPeriod` locked to `'weekly'` during the guided period.** Onboarding does not ask weekly/monthly — only the payday day-of-week. The weekly/monthly toggle (and `paydayDom`) is an Economist-gated control in Economic Controls. "Skip the guided period" unlocks it immediately for families who insist on monthly from day one. Monthly cadence therefore never interacts with stage thresholds. |
| D17 | **Q1 (dev family):** reset. Export a JSON backup first (contains real names — keep it local, never commit), then wipe via the Backup tools and run the full onboarding path as the test. |
| D18 | **Q2 (timezone):** yes. Onboarding auto-detects (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and stores `timezone` in family config; `dates.js` period-boundary functions use it instead of device-local time. |
| D19 | **Q3 (security, decided as option c):** during Phase A testing — i.e. starting NOW — use placeholder child names and throwaway PINs. Real names and real PINs only after Phase B2 (RLS) ships. Rationale: RLS is off and the anon key is public, so all table data including 4-digit SHA-256 PIN hashes (static salt → instantly brute-forced) is readable/writable by anyone with the Vercel URL. The D17 reset is the natural moment to re-onboard with fake identities. |

## 📌 Pinned — decide later, pre-Phase E (not blocking, do NOT implement now)

**App Store subtitle (30-char limit).** Constraints decided: must contain "Chores";
financial-education angle wanted; "payslips" excluded (wrong search intent — adults seeking
work payroll). Parked candidates, all ≤30 chars: "Chores & money skills for kids" (30) ·
"Chores that teach money" (23) · "Chores & financial skills" (25) · "Chores & money lessons" (22).
Localise per storefront (allowance vs pocket money) when finalising at Phase E with the full
store listing.

---

# PART 3 — EXECUTION ORDER

| Step | Workstream | Effort | Depends on |
|------|-----------|--------|-----------|
| 1 | W1 Accounts validation guard | 30 min | — |
| 2 | W2 Atomic settlement RPC | 2–3 hrs | W1 |
| 3 | W3 Auto-run drafts + zero-case hardening + first-settle flow | 2 hrs | W2 |
| 4 | W4 Dynamic family_id (+ dev-device self-migration) | 1–2 hrs | — |
| 5 | W5 Onboarding flow (incl. device handoff) | 4–5 hrs | W3, W4 |
| 6 | W6 Stage system / guided period | 4–5 hrs | W5 |
| 7 | W7 Alerts (table + bell + banners) | 3–4 hrs | W6 |
| 8 | W8 First-week checklist + empty states | 2 hrs | W5, W7 |
| 9 | W9 Stage celebrations + guided-period graduation | 1 hr | W6, W7 |

~4–5 Claude Code sessions. Afterwards, resume the roadmap at **Phase B2** (RLS + realtime
filters), then C → D → E.

Per standing orders: when each workstream lands, update CLAUDE.md's Milestones and Architecture
Decisions, and codebase-map.md where schema/services change (W2, W4, W7 qualify).

---

# PART 4 — WORKSTREAMS IN FULL

## W1 — Accounts validation guard

`updateMemberAccounts` overwrites the entire `accounts` JSON; a malformed caller silently
destroys `subGoals` or `loan`. Add a guard:

```js
// src/db/operations.js
function validateAccounts(accounts) {
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!isNum(accounts.spending) || !isNum(accounts.savings) || !isNum(accounts.philanthropy))
    throw new Error('validateAccounts: balance fields must be finite numbers');
  if (!Array.isArray(accounts.subGoals))
    throw new Error('validateAccounts: subGoals must be an array');
  if (accounts.loan !== null && typeof accounts.loan !== 'object')
    throw new Error('validateAccounts: loan must be null or object');
}
```

Call it at the top of `updateMemberAccounts` before the Supabase `.update()`. While there,
**audit every call site** of `updateMemberAccounts` and confirm each spreads the full existing
accounts object (`{ ...member.accounts, spending: x }`).

**Files:** `src/db/operations.js`

---

## W2 — Atomic settlement RPC

**Problem:** `settlePayslip` is ~6 sequential writes (accounts → tax fund → N transactions →
credit score → payslip status) with no transaction. A mid-sequence failure, or two parents
acting concurrently (P1/P2 is a supported setup), corrupts balances with no rollback and no
trace of what half-ran. In a money app for children this is the worst possible failure class.

**Fix:** move the commit into one Postgres function — single transaction, all-or-nothing:

```sql
create or replace function settle_payslip(p_payslip_id text)
returns jsonb
language plpgsql
as $$
declare
  ps record;
  m  record;
begin
  -- 1. Lock the payslip row; idempotency guard
  select * into ps from payslips where id = p_payslip_id for update;
  if ps is null then raise exception 'payslip not found'; end if;
  if ps.status = 'settled' then raise exception 'payslip already settled'; end if;

  select * into m from members where id = ps.member_id for update;

  -- 2. Write accounts from ps.balances_after (engine already computed everything)
  -- 3. Tax fund: add salary tax + interest tax to families.tax_fund_balance, append history
  -- 4. Insert all transaction rows from the draft's pending_transactions
  -- 5. Credit score: apply credit_delta to members.credit_score (clamped 300–850)
  -- 6. Mark payslip settled + write settled credit_score back to the payslip row

  return jsonb_build_object('settledScore', ..., 'newBalances', ...);
end $$;
```

Implementation notes:
- The JS engine keeps full ownership of **calculation**: `calculatePayslip` (pure) and
  `runPayslip` (creates the draft with `balances_after`, an explicit `pending_transactions`
  list, and `credit_delta` precomputed and stored in the draft's JSON). The RPC only **commits**
  what the draft contains — extend `runPayslip` to store those fields if it doesn't yet.
- `settlePayslip` in `src/engine/payslip.js` becomes a thin wrapper around
  `supabase.rpc('settle_payslip', ...)` (exposed through `operations.js` per convention).
- Vacation logic, "pending counts as done", and all business rules stay in JS at draft time —
  the RPC contains zero business logic beyond the commit.
- Keep the existing double-settle UI error message; the RPC's exception is its source of truth.

**Files:** Supabase migration (function), `src/engine/payslip.js`, `src/db/operations.js`

---

## W3 — Auto-run drafts + zero-case hardening + first-settle teaching flow

1. **Auto-RUN always.** On any app open (ParentShell or Tier2Shell mount), for each Tier 2
   child: if today ≥ payday for the current period AND no payslip (draft or settled) exists for
   that period → call `runPayslip`. Remove the manual "Run Payslip" button from Dashboard.
   Add a DB unique index `(member_id, period_start)` to guard against two devices racing.
2. **Zero-case hardening (test all of these; add `src/engine/payslip.test.js` — vitest, ships
   with Vite):**
   - ZERO chore logs in the period → valid payslip: completion 0%, adjustedSalary 0, deductions
     computed, net clamped ≥ 0, no division by empty `activeDates`.
   - `autoSavePercent: 0` and `philanthropyPercent: 0` → 100% of net to spending, no ₹0
     allocation transactions inserted.
   - `interestRate: 0` → no interest rows; `projectSavingsGrowth` and `calculateWeeklyInterest`
     return sane values with rate 0 and/or balance 0 (no divide-by-zero, no NaN in charts).
   - `streakBonusEnabled: false` (new flag, see W6) → streak bonus skipped entirely.
3. **First settle is manual + guided.** If the family has zero settled payslips:
   - Parent banner: "🎉 It's [Child]'s first payday! Review the payslip together."
   - Settle flow unchanged (PayslipCard → Approve & Pay).
   - Immediately after that first settle, a one-time sheet:
     "Want future payslips to settle automatically on payday? You can still review them
     afterwards, and change this anytime in Economic Controls."
     [Yes, automate ✓ (default)] / [No, I'll settle manually] → writes `autoSettle` to family config.
4. **Auto-settle thereafter** (`autoSettle: true`): after auto-run, immediately call the settle
   RPC. Parent banner: "✅ [Child]'s payslip settled — earned [fmt(net)]. Tap to review."
   Child banner: "💰 Payday! You earned [fmt(net)]."
5. **Toggle** in Economic Controls (visible at all stages — it's core behaviour, not a fine-tune).

**Files:** `src/utils/constants.js` (`autoSettle: false` default until the prompt),
`src/engine/payslip.js`, `src/engine/payslip.test.js` (new), `src/App.jsx` (both shells),
`src/views/parent/Dashboard.jsx`, `src/views/parent/EconomicControls.jsx`,
Supabase migration (unique index)

---

## W4 — Dynamic family_id (Phase B1, pulled forward)

Onboarding creates families, so the hardcoded `FAMILY_ID = 'dev-family-001'` must die first.
RLS is NOT part of this step (Phase B2).

1. New `src/utils/family.js`:
   ```js
   export function getFamilyId() {
     return localStorage.getItem('artha_family_id')
       ?? (import.meta.env.DEV ? import.meta.env.VITE_DEV_FAMILY_ID : null);
   }
   export function setFamilyId(id) { localStorage.setItem('artha_family_id', id); }
   ```
2. `createFamily()` calls `setFamilyId(newUuid)` after insert.
3. `claimDevice()` (and the parent-bypass path) call `setFamilyId(claim.family_id)`.
4. **Required self-migration for already-claimed devices** (the deployed PWA is a production
   build — `import.meta.env.DEV` is false there, so the env fallback never fires on real
   devices). In DeviceGate, synchronously before routing:
   ```js
   if (!localStorage.getItem('artha_family_id')) {
     const claim = readCachedClaim();           // existing helper
     if (claim?.family_id) setFamilyId(claim.family_id);
   }
   ```
   All three current dev devices have cached claims → they self-heal on first boot after deploy.
   No manual steps. `VITE_DEV_FAMILY_ID` in `.env` (add to the PR) covers fresh local dev only.
5. Mechanical replacement: every import of `FAMILY_ID` from `utils/constants` →
   `getFamilyId()` (all of `operations.js`, `FamilyContext.jsx`, DeviceGate in `App.jsx`,
   `seed.js`). Delete the constant. `getFamilyId() === null` → DeviceGate routes to
   onboarding/JoinFamily, never queries.

**Files:** `src/utils/family.js` (new), `src/utils/constants.js`, `src/db/operations.js`,
`src/context/FamilyContext.jsx`, `src/App.jsx`, `src/views/auth/JoinFamily.jsx`,
`src/db/seed.js`, `.env`

---

## W5 — Onboarding flow

**Goal:** install → child-can-earn in under 5 minutes, collecting ONLY what Starter needs.
Single component with step state (`src/views/onboarding/OnboardingFlow.jsx`, replacing
`Onboarding.jsx`), same `/onboarding` route. **All copy says Arto (D12).**

### Screens

**1 — Welcome**
```
Welcome to Arto
The app that teaches your child how money really works.
[Get Started →]
```

**2 — Family name**
```
What should we call your family?
[The Kamboj Family]
This is just for display — your kids will see it too.
```

**3 — Founding parent**
```
Let's set you up first.
Name · Avatar (8–10 grid) · 4-digit PIN
You'll use this PIN to log in.
```

**4 — First child**
```
Now let's add your child.
Name · Avatar · 4-digit PIN
Weekly salary: [currency-symbol] [____]
(How much they can earn per week if they complete all their chores)
```
- Currency auto-detected from locale → "Change currency" link (D5).
- Timezone captured silently here or at completion (D18).
- After this screen: "Add another child" / "Continue with one" (D6).

**5 — First chores**
```
What should [Aarav] do to earn their salary?
[+ Make bed]            ← pre-filled editable example
[+ Clear dishes]        ← pre-filled editable example
[+ Add another chore]
These are mandatory — [Aarav]'s salary depends on completing them.
💡 Start with 2–3 simple chores. You can add more anytime.
```
Mandatory daily chores only; minimum one to proceed.

**6 — Payday** (simplified per D16 — weekly only, no period choice)
```
When is payday?
Every [Saturday ▼]
(Payday is weekly while Arto guides your family through the basics —
you'll unlock more options as you progress.)
```

**7 — The "how it works" moment** (the conversion-critical screen)
Render the REAL `PayslipCard` component fed a mock payslip built from the entered salary and
Starter defaults — not a lookalike. Above it: `Here's how [Aarav]'s first payslip will look:`
Below it:
```
Yep — just like real life, not all the money is theirs to spend.
Tax and rent are set to sensible defaults. You can change them anytime.
[Start your family's economy →]
```

**8 — Done + device handoff** (do NOT end at the dashboard)
```
You're all set! 🎉  [Aarav]'s first payday is [Saturday].

Now set up [Aarav]'s device:
[Generate invite code]  → live code + TTL countdown, inline
"Open Arto on [Aarav]'s device and enter this code."

[Or do this later from More → Invite Code]
[Go to Dashboard →]
```
**Required (not optional):** extract code generation + countdown rendering from
`InviteCode.jsx` into a shared component/helper so this screen and the More screen use the
same logic. The parent spends 1–2 minutes here fetching the child's device — the countdown is
the key UX moment and must not be a reimplementation.

### What completion writes

- `createFamily()` → UUID → `setFamilyId()` → auto-claim this device as parent.
- `addMember()` parent, `addMember()` child(ren) (Tier 2 default), `addChore()` × N.
- **Family config (Starter, guided period):**
  ```js
  {
    currency: detected,                 // D5
    timezone: detected,                 // D18
    payPeriod: 'weekly',                // D16 — locked until Economist
    paydayDow: chosen,                  // screen 6
    taxRate: 0.10,
    rentAmount: round5pct(salary),      // D4
    utilitiesAmount: 0,
    loanInterestRate: 0.05,             // dormant until Economist
    autoSettle: false,                  // first-settle prompt sets it (W3)
    configTouched: [],
    // NOTE: autoSavePercent / interestRate / philanthropyPercent / streakBonusEnabled
    // are deliberately ABSENT — they are per-child member.config keys only (W6).
  }
  ```
- `member.config` for each child starts empty of stage keys (engine defaults them to 0/false).
- `seed.js`: wrap entire body in `if (!import.meta.env.DEV) return;` (D10).
- **PWA manifest rename (D12):** update `vite.config.js` PWA manifest — `name: "Arto"`,
  `short_name: "Arto"` — and the `<title>`/meta in `index.html`.

**Files:** `src/views/onboarding/OnboardingFlow.jsx` (new, replaces Onboarding.jsx),
`src/App.jsx`, `src/db/seed.js`, `src/utils/constants.js`, `src/components/InviteCodePanel.jsx`
(new shared extraction), `src/views/parent/InviteCode.jsx` (refactor to use it),
`vite.config.js`, `index.html`

---

## W6 — Stage system / guided period

### Stages and thresholds (per Tier 2 child, derived — D1, D15)

| Stage | Unlocks after (settled payslips, weekly) |
|-------|------------------------------------------|
| **Starter** | day one |
| **Saver** | 2 |
| **Investor** | 3 |
| **Economist** | 5 — **guided period ends** |

"Skip the guided period": button in parent More → confirm sheet → sets
`family.config.stageOverride: 'economist'` **AND applies the cumulative stage patches**
(Saver + Investor + Economist) to every Tier 2 child's `member.config` via the shared helper —
a skipped family runs the same default economy a graduated family runs, never a zero-rate
Economist with a full UI. While `stageOverride` is set, `addMember` applies the full patch to
any newly created Tier 2 child too. Always available.
Monthly cadence never interacts with thresholds (D16 — payPeriod is weekly until Economist).

### Feature → stage map

| Feature | Starter | Saver | Investor | Economist |
|---|---|---|---|---|
| Mandatory + bonus chores, salary, payslip, tax, rent, wallet, rewards store, ledger, cash-out | ✅ | ✅ | ✅ | ✅ |
| Savings account, auto-save %, interest, savings projection, sparklines | ❌ | ✅ | ✅ | ✅ |
| Streak bonuses, sub-goals, analytics charts, net worth | ❌ | ❌ | ✅ | ✅ |
| Loans, credit score, philanthropy, family tax fund + voting, vacation mode, recurring utilities, payday schedule (weekly/monthly), advanced econ controls, per-child overrides UI | ❌ | ❌ | ❌ | ✅ |

### STEP 0 — verify the engine's config merge (do before any other W6 work)

This whole design depends on `calculatePayslip` resolving effective config **per-field** as
`{ ...ENGINE_DEFAULTS, ...family.config, ...member.config }` where
`ENGINE_DEFAULTS = { autoSavePercent: 0, interestRate: 0, philanthropyPercent: 0, streakBonusEnabled: false }`.
Read the actual resolution code. If it reads rates straight from `family.config`, or merges
all-or-nothing, **fix the resolution first** and add a unit test for the three-layer merge.

### Layer 1 — engine/config (the truth)

- New flag `streakBonusEnabled` read by `calculatePayslip` (skip streak bonus when false).
- **Stage-gated keys are per-child only** (critical design rule): `autoSavePercent`,
  `interestRate`, `philanthropyPercent`, `streakBonusEnabled` live exclusively in
  `member.config` and must never be written to `family.config`. A Starter sibling therefore
  always resolves them to the engine defaults (0/false) regardless of what any other child has.
- **Stage advancement** (detected at settle time: derived stage before vs after): apply the
  patch to **the advancing child's `member.config`**, skipping any key present in that child's
  `member.config.configTouched`. Implement as one shared helper —
  `applyStagePatches(child, throughStage)` — used by THREE callers: settle-time advancement
  (patch for the newly reached stage), "Skip the guided period" (cumulative patch through
  Economist for all Tier 2 children), and `addMember` when `stageOverride` is set (cumulative
  patch for the new child). One code path, no drift:

| Advancing to | Patch (into that child's member.config) |
|---|---|
| Saver | `autoSavePercent: 0.20, interestRate: 0.02` |
| Investor | `streakBonusEnabled: true` |
| Economist | `philanthropyPercent: 0.03` |

- **configTouched is per-layer:** editing a child's rate in Economic Controls appends the key
  to that child's `member.config.configTouched` (stage patches skip it); editing a family-level
  setting appends to `family.config.configTouched`. Two lists, each guarding its own layer.

### Layer 2 — view gating

New `src/hooks/useStage.js`:
```js
export function useStage(member) {
  // derived from member's settled payslip count (FamilyContext caches counts per member)
  // + family.config.stageOverride
  // returns { stage, has: (feature) => boolean, override }
}
```

#### Starter child view — explicit spec (`child-tier2/` surfaces)

**ChildNav: four tabs — Home, Chores, Ledger, Rewards.** Savings tab absent until Saver.

**Home.jsx visible at Starter:**
- Header: name + avatar — credit score ★ chip REMOVED (Economist)
- Wallet card (balance + Cash/Bank-out) — NO sparkline (Saver)
- Spent card — NO sparkline
- Projected earnings widget (its interest line already auto-hides at 0)
- Payday / draft-payslip banners (W3/W7) and first-week card (W8)

**Home.jsx hidden at Starter:** Savings card, Philanthropy card, loan chip, Family Fund entry,
the ENTIRE STATS section (net worth, savings growth, salary-captured, bonus performance, top
rewards, credit history, credit gauge — all Saver+ or above anyway), NetWorthSheet, credit
popup. The Starter Home is deliberately short: balance, today's chores, payday countdown.

**Wallet.jsx (`/child/wallet`):** reward catalog + Cash Out stay (cash-out is how money becomes
real — core Starter); "Save" button hidden until Saver.

**Per-stage additions:** Saver → Savings tab + card + sparklines + savings/projection charts.
Investor → GoalJar/sub-goals, streak UI, full STATS section. Economist → credit chip + gauge +
popup + history, philanthropy card, Family Fund, loan chip.

#### PayslipCard is stage-aware (replaces session-13 "dimmed when zero" rule)

PayslipCard receives the payslip's stage and **removes (not dims)** rows for features above it:
a Starter payslip shows exactly salary → tax → rent → net → spending; no savings/philanthropy
allocation lines, no interest/loan rows, no streak line. The payslip is the curriculum — it
must only teach what's unlocked. `runPayslip` stores `stage` in the payslip JSON at draft time
so historical payslips render with the stage they were earned at; legacy payslips without the
field render full (economist).

#### Parent view gating

- More menu: Loans, Tax Fund, Vacation Mode, Utility Logger hidden until any child is Economist.
- **Economic Controls during the guided period (pre-Economist):** tax rate, rent, payday
  day-of-week, autoSettle toggle; plus per-child auto-save % once that child reaches Saver
  (writes to that child's member.config + configTouched). Everything else — payPeriod toggle,
  interest rates, philanthropy %, utilities, loan rate, Advanced mode, per-child overrides UI —
  appears at Economist.
- Dashboard child cards: hide savings/philanthropy tiles and credit chip per that child's stage.
- ChildDetail: charts and Buy Reward per the feature map; donate section Economist-only.
- Routes for gated screens redirect home if accessed directly.

#### Stage-transition testing (dev tooling)

No new tool needed: the existing **Generate Test History** button (Backup screen) already
creates N settled payslips per child via `runPayslip` → `settlePayslip`. Verify after W2 that
it routes through the RPC wrapper (it must), so generated payslips correctly drive stage
derivation, patches, and celebrations — generating 5 periods for a child should walk them
Starter → Economist and fire every celebration. That IS the test.

**Files:** `src/hooks/useStage.js` (new), `src/utils/constants.js` (stage defs, feature map,
patches, ENGINE_DEFAULTS), `src/engine/payslip.js` (`streakBonusEnabled`, stage stored in
draft, advancement detection), `src/engine/payslip.test.js` (config-merge test),
`src/context/FamilyContext.jsx` (per-member settled counts), `src/views/parent/EconomicControls.jsx`
(guided-period mode + configTouched), `src/components/ChildNav.jsx`, `src/components/PayslipCard.jsx`,
parent More list, `src/views/child-tier2/Home.jsx`, `Savings.jsx`, `GoalJar.jsx`, `Wallet.jsx`,
`src/views/parent/Dashboard.jsx`, `ChildDetail.jsx`, `src/App.jsx` (route guards),
`src/views/parent/Backup.jsx` (verify test-history path),
`src/views/onboarding/OnboardingFlow.jsx` (screen-7 mock payslip gains `stage: 'starter'` so
the onboarding preview stays a Starter card once PayslipCard is stage-aware)

---

## W7 — In-app alerts (banners + bell)

Two channels only. **No push in this plan** — moved wholesale to Phase G (requires server cron
for its flagship payday use case; permission UX, VAPID infra, quiet hours, per-device timezones
come with it).

### Table

```sql
create table alerts (
  id          uuid primary key default gen_random_uuid(),
  family_id   text not null,
  member_id   text,              -- null = family-wide
  target_role text not null,     -- 'parent' | 'child' | 'all'
  type        text not null,
  title       text not null,
  body        text,
  data        jsonb,             -- { payslipId, choreId, amount, stage, ... }
  channels    text[] not null,   -- ['banner','bell']
  dedupe_key  text,              -- optional idempotency key, e.g. 'overdue:{payslipId}'
  read_at     timestamptz,
  dismissed_at timestamptz,
  created_at  timestamptz default now()
);
create index idx_alerts_member on alerts(family_id, member_id, created_at desc);
create unique index idx_alerts_dedupe on alerts(dedupe_key) where dedupe_key is not null;
-- createAlert inserts with ON CONFLICT (dedupe_key) DO NOTHING (via upsert ignoreDuplicates)
-- so duplicate-prone alerts are race-free across two parent devices — no check-then-insert.
-- RLS stays off like all tables until Phase B2
```

**Pruning:** `deleteOldAlerts()` (>30 days) runs on app load, guarded by a
`localStorage('artha_alerts_pruned_at')` timestamp — skip if pruned within 24h. No cron.

**Reliability rule:** `createAlert` lives in `operations.js` alongside the operation that
triggers it (consistent with existing compound operations like `approveRewardRequest`, which
already deducts AND logs). But every alert write is wrapped:
```js
try { await createAlert(...); } catch (e) { console.warn('alert write failed', e); }
```
**A failed alert insert must never fail or roll back the money operation.** Alerts inside the
settle path fire from the JS wrapper AFTER the RPC succeeds — never inside the transaction.

### Launch catalog — these 15, nothing else

All amounts via `fmt()`. "Computed" = derived live on load, no table row.

| Type | Recipient | Channels | Message |
|---|---|---|---|
| `payslip_settled` | Parent | banner+bell | "✅ [Child]'s payslip settled — earned [net]. Tap to review." Body folds in the weekly summary: "[X]% chores · [earned] earned · [saved] saved." (D9) |
| `payslip_settled` | Child | banner+bell | "💰 Payday! You earned [net] this week." Same summary body. |
| `payslip_ready` (manual mode) | Parent | banner+bell | "📋 It's payday! [Child]'s payslip is ready to review and settle." |
| `payslip_overdue` | Parent | banner+bell | "⚠️ [Child]'s payslip is overdue — settle it before the next one." (absorbs the existing overdue banner) |
| `first_payslip` | Parent | banner+bell | "🎉 [Child]'s first payslip! Review it together — ask them what they think about tax and rent." |
| `first_payslip` | Child | banner+bell | "🎉 Your first payslip! Welcome to the real world — tax and rent are real." |
| `chores_due` (computed) | Child | banner | "📋 You have [N] chores to do today" |
| `chores_all_done` | Child | banner+bell | "✅ All done for today! Great work." |
| `approvals_pending` (computed) | Parent | banner | "🔔 [N] items waiting for your approval" |
| `chore_approved` | Child | bell | "✅ [Chore] approved!" |
| `chore_rejected` | Child | bell | "❌ [Chore] was not approved." |
| `reward_approved` | Child | banner+bell | "🎉 [Reward] approved! [amount] deducted from wallet." (absorbs the existing toast) |
| `reward_rejected` | Child | bell | "❌ [Reward] request was declined." |
| `cash_approved` | Child | bell | "💵 Cash withdrawal of [amount] approved — collect from your parent." |
| `stage_unlocked` (templated) | Parent + Child | banner+bell | See W9. |

**Explicitly NOT in launch:** evening chore reminders and stale-approval nudges (need server
scheduling → Phase G); streak/savings-milestone/credit-band alerts (fast-follow once stages
prove out); ALL surveillance alerts — "child did zero chores", "earned only X%", "streak
broken", week-over-week decline — cut on principle, not deferred.

### Insertion points

| Event | Fires from |
|---|---|
| payslip_settled / first_payslip / stage_unlocked | settle wrapper in `payslip.js`, after RPC success |
| payslip_ready | auto-run path (W3) when `autoSettle: false` |
| payslip_overdue | Dashboard load check (existing logic, now writes an alert row) — `dedupe_key: 'overdue:{payslipId}'` guarantees once per payslip |
| chore_approved / chore_rejected | `approveChoreLog` / `rejectChoreLog` in operations.js |
| reward_approved / reward_rejected | `approveRewardRequest` / reject in operations.js |
| cash_approved | `approveSpendingWithdrawal` in operations.js |
| chores_all_done | **At LOG time** — when the child logs today's last mandatory chore (pending counts as done, per the existing credit-score principle; a later rejection is corrected by `chore_rejected`). `dedupe_key: 'alldone:{memberId}:{date}'` |

### UI

**`src/components/AlertBell.jsx`** — bell in both shell headers; unread-count badge; tap →
bottom sheet, newest first, unread bold + blue dot; "Mark all read"; tapping an alert navigates
via `data` and marks read. Add `alerts` to FamilyContext's realtime channels for live badges.

**`src/components/EventBanner.jsx`** — stacked cards at top of Dashboard / child Home; icon +
title + dismiss ✕; max 2 visible, priority = payslip > stage > chores/approvals; dismiss writes
`dismissed_at` (computed banners dismiss in local state for the day).

**Files:** Supabase migration, `src/components/AlertBell.jsx` + `EventBanner.jsx` (new),
`src/db/operations.js` (`createAlert`, `getAlerts`, `markAlertRead`, `markAllAlertsRead`,
`deleteOldAlerts`), `src/engine/payslip.js`, `src/views/parent/Dashboard.jsx`,
`src/views/child-tier2/Home.jsx`, `src/App.jsx`, `src/context/FamilyContext.jsx`

---

## W8 — First-week checklist + empty states

The highest-churn window is onboarding-complete → first payday: up to 7 days of dead air.

**Parent dashboard card** (`FirstWeekChecklist.jsx`, shown until first settled payslip):
```
GETTING STARTED
☑ Family created
☐ [Aarav] logged in on their device     → taps to Invite Code
☐ First chore logged                     → hint: "this one's [Aarav]'s move"
☐ First chore approved                   → taps to Approve
⏳ First payday — [Saturday]
```
All computed from existing data: device_claims (child claim exists), chore_logs (any row),
chore_logs approved (any), payslips settled (hides card).

**Child home card** (until first settled payslip):
"🗓️ Your first payday is [Saturday]. Every chore you do this week becomes money." +
"[N] chores done so far this week" progress line.

**Bonus-chore hint** (D7): dismissible card on parent Dashboard after first settle:
"💡 Did you know? Bonus chores let [Child] earn extra beyond their salary. Add one in Chores."

**Empty-state audit:** every chart with 0 or 1 settled payslips must render a friendly
placeholder, not broken axes — NetWorthChart, SavingsGrowthChart, credit history,
salary-captured, bonus-performance, TopRewardsChart, sparklines. Pattern:
`if (data.length < 2) return <EmptyChartNote text="Charts appear after a couple of paydays" />`.
(Mostly Saver+/Investor+ surfaces, but they must be clean the day they unlock.)

**Files:** `src/components/FirstWeekChecklist.jsx` (new), `src/views/parent/Dashboard.jsx`,
`src/views/child-tier2/Home.jsx`, chart components in `src/components/`

---

## W9 — Stage celebrations + guided-period graduation

Templated `stage_unlocked` alerts (banner + bell, both audiences), fired when the derived stage
changes across a settle (W6 detection). Distinct celebratory banner styling.

| Stage | Parent | Child |
|---|---|---|
| Saver | "🎉 Saver unlocked! [Child] now has a savings account earning interest. Auto-save is set to 20% — adjust it anytime." | "🎉 New: Savings Account! Part of each payslip now goes into savings — and your savings earn interest. Money that makes money!" |
| Investor | "🎉 Investor unlocked! Savings goals, streak bonuses, and analytics charts are now available for [Child]." | "🎉 New features! Set savings goals, earn streak bonuses for doing chores every day, and see your money charts." |
| Economist | "🎓 Guided period complete! Your family now runs the full economy — loans, credit score, philanthropy, and every control unlocked. Fine-tune everything in Economic Controls." | "🎓 You're an Economist! You've mastered earning and saving — now the full financial world is open: loans, a credit score, and giving." |

The "Skip the guided period" confirm sheet (parent More):
"This unlocks everything immediately — loans, credit score, philanthropy, and all economic
controls — and sets the standard rates (20% auto-save, 2% savings interest, 3% philanthropy)
for every child. You can adjust all of them in Economic Controls. Most families enjoy the
five-payday guided journey. Skip it?"

**Files:** celebration variant in `EventBanner.jsx`, trigger in the settle wrapper
(`payslip.js`), `src/views/parent/More` (skip button)

---

# PART 5 — DEFERRED / OUT OF SCOPE (do not build now)

| Item | Lands in |
|---|---|
| RLS on all tables + Realtime channel `family_id` filters + realtime authorization (channels are currently table-wide — at multi-tenant scale every family's writes trigger every other family's full reload; MUST be in B2's scope) | Phase B2 |
| Supabase Auth (email+password founding parent), account deletion | Phase C |
| Privacy policy, ToS, COPPA/GDPR-K (URLs reserved per D14) | Phase D |
| Capacitor native app (bundle ID `com.fourworx.arto` per D13) | Phase E |
| Monetisation | Phase F |
| ALL push notifications: VAPID, service-worker push, `push_subscriptions` table, Edge Function sender, permission UX, quiet hours, frequency caps, weekly summary push, evening reminders, stale-approval nudges — plus the midnight auto-payslip cron that makes payday push actually work | Phase G |
| Surveillance alerts (child-failure reports to parent) | Never by default; opt-in setting at most, post-launch |
| Stage fast-follow alerts (streak milestones, savings milestones, credit-band changes, loan events) | Post-launch fast-follow |

---

# PART 6 — SECURITY (decided — D19)

RLS is off and the anon key ships in the public Vercel bundle: all 12 tables are readable AND
writable by anyone with the URL, including children's names and PIN hashes (4-digit, SHA-256,
static salt → brute-forced instantly). **Decision (D19, option c):** Phase A testing proceeds
with placeholder child names and throwaway PINs, starting from the D17 reset. The pre-reset
JSON backup contains real names — keep it local, never commit it. Real identities return only
after Phase B2 ships RLS. Do not add RLS policies in this plan (standing order).

---

# PART 7 — DEFINITION OF DONE

- [ ] Fresh device → onboarding → child device claimed → chore logged → approved → payday →
      guided first settle → auto-settle prompt: full path works with zero console errors
- [ ] **W6 step 0 verified:** `calculatePayslip` resolves config per-field as
      defaults ← family ← member, with a unit test proving the three-layer merge
- [ ] New family starts at Starter: child Home shows only wallet/spent/projected/chores per the
      Starter spec; ChildNav has four tabs; a Starter payslip allocates 100% of net to spending
      and the PayslipCard shows no savings/philanthropy/interest/loan/streak rows
- [ ] **Sibling isolation:** Child A at Saver (auto-save 20% applies) while Child B at Starter
      settles with 0% to savings and no savings UI — verified in the same family
- [ ] 2nd settle → Saver celebration + savings UI appear; parent-customised per-child keys
      survive stage patches (configTouched respected per layer)
- [ ] Generate Test History ×5 periods walks a fresh child Starter → Economist through the real
      RPC settle path, firing all three celebrations
- [ ] "Skip the guided period" on a fresh family: full UI AND standard rates apply to every
      child (no zero-rate Economist); a child added after the skip gets the rates at creation
- [ ] Duplicate-prone alerts are race-free: two parent devices loading simultaneously produce
      exactly one `payslip_overdue` row; double-logging the last chore produces exactly one
      `chores_all_done` row (dedupe_key verified)
- [ ] Settle RPC: a mid-settle failure leaves balances untouched (test with an intentionally
      failing version); double-settle raises cleanly; alert writes fire after the RPC and a
      forced alert failure does not affect the settle
- [ ] 0-chore week auto-runs a valid ₹0 payslip; 0-rate engine paths (interest, auto-save,
      projection) produce no NaN/crash
- [ ] Bell badge updates in realtime across P1/P2; banners dismiss and stay dismissed; prune
      respects the 24h guard
- [ ] `FAMILY_ID` constant no longer exists; all three existing devices self-migrate via the
      DeviceGate claim backfill with no manual steps
- [ ] All user-facing amounts render via `fmt()` — grep for hardcoded '₹' in new code returns nothing
- [ ] Onboarding, manifest, and index.html say "Arto" (D12); Phase E notes in HANDOFF.md and
      CLAUDE.md corrected to `com.fourworx.arto` (D13)
- [ ] CLAUDE.md milestones + architecture decisions updated; codebase-map.md updated for the
      `alerts` table, settle RPC, and dynamic family_id
