# Artha — Codebase Map

> Written after sessions 1–18. Updated: 2026-05-11. Use this when debugging, starting a feature, or returning after time away.

---

## 1. System Overview

Artha is a household economy PWA for children. Parents configure a salary for each child, define mandatory and bonus chores, set economic parameters (tax rate, rent, savings rate, loan terms), and approve or reject what children submit. Children log their chores daily and earn salary on payday, which is automatically split across spending, savings, and philanthropy accounts. There is a full credit score system (300–850), a family tax fund, loans, a rewards store, and sub-goals inside savings.

The app runs in a browser or as a PWA installed on a phone. There is no native app yet — that is Phase E. All state lives in Supabase (PostgreSQL with Realtime subscriptions). Two roles exist: parent and child. All children have the full payslip experience. The entire app is single-family in its current form; multi-tenant architecture is Phase B.

Tech stack: React 19, Vite 8, TailwindCSS 4, Supabase (PostgreSQL + Realtime), deployed on Vercel as a PWA.

**Core user flows:**
- Child logs a chore → parent approves → credit score ticks up; rejection ticks it down
- On payday, parent runs the payslip → system calculates salary, deductions, allocations → parent settles it → balances update, transactions are logged, credit score is adjusted
- Child requests a reward → parent approves → balance is deducted, transaction is logged
- Parent gives a loan → balance is credited, loan outstanding is set → auto-repayment each payday from spending

---

## 2. Critical Files

Files where a bug would corrupt data, break core functionality, or cause the wrong family to see the wrong data.

### `src/engine/payslip.js`
**What it does:** The entire payroll calculation engine in one file. Contains three exports: `calculatePayslip` (pure math, no DB), `runPayslip` (creates a draft payslip in the DB), and `settlePayslip` (commits all balance changes, logs all transactions, updates credit score, marks payslip settled).

**Why dangerous:** Settlement is the only place where all five account balances (spending, savings, philanthropy, sub-goals, loan) are updated together. It also writes the credit score delta, logs every transaction for that period, and credits the tax fund. A bug here will produce wrong balances that are hard to detect and impossible to auto-reverse.

**What breaks if it fails:**
- Wrong balances in all accounts
- Tax fund credited with wrong amount
- Credit score chart shows wrong values
- Transaction history is incomplete or has wrong amounts
- Loan balances don't reduce correctly

### `src/db/operations.js`
**What it does:** Every database read and write in the app — roughly 55 exported functions. Each function translates between JS camelCase and PostgreSQL snake_case. Compound operations (approve reward, settle payslip sub-steps, loan repayment, donations, sub-goal withdrawals) live here. ==This is the only file allowed to touch Supabase directly.==

**Why dangerous:** Every mutation that changes a user's money (spending, savings, philanthropy, sub-goals, loan) goes through `updateMemberAccounts`. This function overwrites the entire `accounts` JSON column — so if any caller assembles the accounts object incorrectly (e.g., omits `subGoals`), data is silently lost. There is no transactional guarantee across multiple sequential DB calls (e.g., approve reward deducts balance AND logs a transaction — if the second call fails, the balance is already gone).

**What breaks if it fails:**
- Balance deducted but transaction not logged (or vice versa)
- Reward balance deducted twice (missing idempotency guard)
- Sub-goals wiped if `accounts` object assembled without them
- `mapReward` maps DB `cost` → JS `price` — if this mapping is changed or missed, all prices in the UI show undefined or NaN

### `src/utils/constants.js`
**What it does:** Defines `FAMILY_ID = 'dev-family-001'`, the hardcoded family identifier that gates every Supabase query. Also defines default economic config, currency options, and transaction type labels.

**Why dangerous:** Every query in `operations.js` filters by `FAMILY_ID`. If this constant is wrong, the app either shows no data or, in a multi-family scenario, shows another family's data. This constant is the single biggest blocker to multi-tenant distribution.

**What breaks if it fails:**
- App loads empty (no family found)
- In a multi-tenant scenario: wrong family's data exposed — a critical privacy breach

### `src/context/FamilyContext.jsx`
**What it does:** Loads the family, all members, all chores, and all active rewards from Supabase on mount. Subscribes to seven Supabase Realtime channels (families, members, chores, rewards, chore_logs, payslips, reward_requests). Every change on any of those tables fires `loadFamily()`, which increments `reloadCount`. Views subscribe to `reloadCount` to know when to refresh.

**Why dangerous:** It is the heartbeat of the app. If it fails to load, nothing renders. If the Realtime subscription drops silently, all views show stale data. `useCurrency()` and `usePeriod()` are also defined here — 61 and 19 components depend on these hooks respectively. Breaking the context export breaks the entire UI.

**What breaks if it fails:**
- Blank app on load
- Stale data after another device makes a change (realtime failure)
- Currency formatting broken everywhere
- Period dates wrong across all views

### `src/context/AuthContext.jsx`
**What it does:** Manages the logged-in member session. Persists the member ID in `localStorage('artha_member_id')`. On mount, reads localStorage and re-fetches that member from Supabase to restore the session. Exposes `login` (PIN verify), `logout`, `refreshMember`, and `currentMember`.

**Why dangerous:** `ParentShell` and `ChildShell` both check `currentMember.role` to determine which UI to show. If auth is bypassed or role is wrong, a child could see the parent dashboard. If `refreshMember` isn't called after account changes (e.g., after balance updates), the child's displayed balance lags behind reality.

**What breaks if it fails:**
- Login loop: session not restored, bounced back to PIN screen on every refresh
- Role mismatch: wrong shell rendered
- Stale member data: spending balance shown as old value after a reward is purchased

### `src/engine/chores.js`
**What it does:** Three pure functions — `calculateStreak` (counts consecutive days all mandatory chores were approved, going back 60 days), `getDueChoresForMember` (filters chores due today), and `getAvailableBonusChores` (bonus chores always visible when active). The streak output feeds directly into the payslip engine's salary bonus.

**Why dangerous:** `calculateStreak` determines whether a child gets a 5%, 10%, or 15% salary bonus. A bug in the day-of-week logic could silently grant or deny the bonus every week. The function uses "yesterday" as its starting point — a timezone edge case here could break it entirely.

**What breaks if it fails:**
- Wrong streak → wrong streak bonus → wrong gross → wrong tax, savings, spending allocations (cascading)
- Salary bonus never earned even when deserved

### `src/engine/interest.js`
**What it does:** `calculateWeeklyInterest` computes one period's interest on a balance. `projectSavingsGrowth` is used for the savings projection chart. Both are pure functions.

**Why dangerous:** Interest is calculated using the *opening* balance from the previous payslip (not the current balance), specifically to prevent gaming. If this logic is changed to use the current balance, or if the opening balance isn't loaded correctly in `runPayslip`, children could game the system by depositing on settlement day.

**What breaks if it fails:**
- Wrong savings balance after settlement
- Interest tax (applied at the same rate as salary tax, deducted from savings) is wrong
- Sub-goal balances incorrect

---

## 3. Supporting Files

Files that matter but where a bug is visible and recoverable without corrupting data.

### `src/db/supabase.js`
Initialises the Supabase client from two environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Tiny file — if the env vars are missing or wrong, every DB operation fails with a connection error.

### `src/App.jsx`
Defines the entire route tree plus three critical pieces: `DeviceGate` (checks if this device is claimed before showing any route), `ParentShell` (wraps all `/parent/` routes, enforces `role === 'parent'`), and `ChildShell` (wraps all `/child/` routes, enforces `role === 'child'`, watches for reward approval toasts and draft payslip badge). Adding a route here is how new screens become reachable.

### `src/views/parent/Dashboard.jsx`
The parent's main screen. Shows all children's current balances, today's chore status per child, overdue draft payslip warnings, and triggers `runPayslip` / `settlePayslip`. The payslip run/settle flow originates here. Also contains inline `GiveMoneySheet` and `LoanSheet` bottom sheets.

### `src/views/parent/ApproveChores.jsx`
Queue of pending chore logs and member requests (donations, cash withdrawals, savings withdrawals, sub-goal withdrawals, tax goal votes). Parent approves or rejects each item. Contains `approveMemberReq` which dispatches to the right operation based on `req.type`. Getting this wrong would mean approving the wrong action.

### `src/views/parent/EconomicControls.jsx`
Simple/Advanced mode toggle. Lets parents set tax rate, rent, savings interest, loan interest, auto-save percent, philanthropy percent, recurring utilities, payday schedule, and per-child overrides. Changes write to `family.config` via `updateFamilyConfig`. Wrong values here flow into every future payslip calculation.

### `src/views/parent/Backup.jsx`
Contains three tools: full data export (JSON download), full data import (JSON upload with destructive wipe-then-restore), and Generate Test History (dev tool). Also contains the Reset All History & Wallets button. This screen has the most destructive operations in the app.

### `src/views/parent/ChildDetail.jsx`
Deep analytics screen for a single child. Shows net worth, spending breakdown, salary capture vs max, bonus chore performance chart, savings growth projection, top rewards chart, and credit score history. Also contains BuyRewardScreen — a full-screen overlay for the parent to buy a reward on behalf of the child directly (no approval queue). Contains the `NetWorthSheet` breakdown.

### `src/views/child/Home.jsx`
The child's main dashboard. Shows credit score gauge, wallet balance, savings balance (including sub-goals), philanthropy balance, projected earnings widget, net worth chart, savings growth chart, bonus chore performance chart, top rewards chart, and credit score history. Contains `NetWorthSheet`, `CashOutSheet`, and `InterestSheet` bottom sheets.

### `src/views/child/Ledger.jsx`
Payslip history grouped by period. Shows settled payslips with `PayslipCard`, pending transactions, and draft payslip banner. The primary historical record for a child's payroll.

### `src/views/child/Savings.jsx`
Savings account view. Shows total savings (account + sub-goals), savings history chart, savings projection, interest stats, and the sub-goals section with progress bars per goal.

### `src/views/child/GoalJar.jsx`
Sub-goals management. Child can add sub-goals, make deposits from spending, and withdraw to spending, philanthropy, another sub-goal, cash, or bank. Withdrawals to spending are immediate; cash/bank create a member request for parent approval.

### `src/views/child/Wallet.jsx`
Full-screen wallet. Shows spending balance, Save to savings button, Cash Out button (creates a withdrawal request), and the full rewards catalog with buy flow.

### `src/views/child/Rewards.jsx`
Rewards store for children. Shows the catalog filtered by category. Tapping a reward opens a confirm sheet — child submits a request, which lands in the parent's approval queue.

### `src/views/child/Chores.jsx`
Today's mandatory and bonus chores for the child. Child taps to mark done (creates a pending chore log). Shows daily progress bar and period progress bar. Vacation notice shown if child is on leave.

### `src/views/parent/ChoreManager.jsx`
CRUD for chores — child-first tab layout. Parent sees each child's tab (plus "All"), with mandatory and bonus chore sections per child. Contains `ChoreForm` bottom sheet for creating/editing chores.

### `src/views/parent/RewardManager.jsx`
CRUD for rewards. Supports preset categories and free-text custom categories. The `mapReward` cost→price mapping is critical here — the form always works in `price`, which `addReward` maps back to DB `cost`.

### `src/views/parent/Loans.jsx`
Parent issues, tracks, and adjusts loans for children. Sets outstanding amount, weekly repayment, and interest-free flag.

### `src/views/parent/TaxFund.jsx`
Shows the family tax fund balance and history. Parent can set a goal (optionally from a child vote), delete the goal, and approve/reject child tax goal vote requests.

### `src/views/child/FamilyFund.jsx`
Child's view of the tax fund. Shows their contributions, the current goal, and lets them submit a tax goal vote.

### `src/views/parent/Vacation.jsx`
Per-child vacation toggle. Parent sets active/inactive and paid/unpaid leave. Vacation state stored in `member.config.vacation`.

### `src/views/parent/Expenses.jsx`
Displays parent-level expense tracking (view into utility charges and family fund outflows).

### `src/views/onboarding/Onboarding.jsx`
First-run screen. Collects family name, parent name, avatar, and PIN. Calls `createFamily()` which inserts into Supabase and auto-claims the device. Only shown once per device (when no family exists).

### `src/views/auth/JoinFamily.jsx`
Shown to any device that has no device claim yet. Child or second parent enters a 6-character invite code generated by the parent in InviteCode screen. On success, the device is claimed and linked to a specific member.

### `src/views/parent/InviteCode.jsx`
Parent generates a 6-character alphanumeric invite code for a specific member. Code has a 10-minute TTL and can only be used once. A live countdown bar shows time remaining.

### `src/views/parent/Members.jsx`
CRUD for family members. Parent can add children (with salary, goal jar config) or additional parents.

### `src/views/parent/UtilityLogger.jsx`
Parent logs ad-hoc utility charges (e.g., electricity overage, internet bill) against one or more children. These are deducted in the next payslip.

### `src/auth/PinAuth.jsx`
The login screen. Shows an avatar grid of all members (filtered to just the claimed member if the device is a child device). Selected member shows a 4-digit PIN pad. On correct PIN, navigates to the appropriate shell based on role.

### `src/auth/pinUtils.js`
`hashPin` and `verifyPin` using Web Crypto API SHA-256. Salted with `artha:` prefix. PINs are never stored in plain text.

### `src/components/PayslipCard.jsx`
Renders a single settled or draft payslip — earnings breakdown, bonus chores, deductions, net, allocations, interest. Used in both the Ledger (child view) and ChildDetail (parent view).

### `src/components/NetWorthChart.jsx`
Custom SVG line chart (no Recharts dependency) showing net worth over settled payslips. Used in child Home and parent ChildDetail.

### `src/components/CreditGauge.jsx`
Arc gauge SVG showing the credit score from 300 to 850 with colour bands.

### `src/components/CreditScorePopup.jsx`
Modal popup explaining the credit score, what changed this period, and improvement tips. Shown once per period when a child's score changes.

### `src/components/SavingsGrowthChart.jsx`
Line chart projecting savings growth for 12 weeks using `projectSavingsGrowth` from the interest engine.

### `src/components/SpendingBreakdown.jsx`
Donut chart showing spending by category (reward, rent, tax, utility, loan repayment, other). Used in parent ChildDetail.

### `src/components/TopRewardsChart.jsx`
Horizontal bar chart showing the top 5 most-purchased rewards. Used in child Home and parent ChildDetail.

### `src/components/ChildNav.jsx`
Bottom navigation bar for the child shell. Five tabs: Home, Chores, Ledger, Savings, Rewards. Shows amber badge on Ledger tab when a draft payslip exists.

### `src/components/ParentNav.jsx`
Bottom navigation bar for the parent shell. Four tabs: Dashboard, Chores, Approve, More. Shows pending count badge on Approve tab.

### `src/components/InstallPrompt.jsx`
PWA install banner that appears when the browser fires the `beforeinstallprompt` event.

### `src/utils/currency.js`
`formatCurrency(amount, currency, opts)` — the underlying formatter. Also exports `roundRupees` (rounds to 2 decimal places). Note: `formatRupees` is a dead alias that should never be used — always use the `useCurrency()` hook.

### `src/utils/dates.js`
All date logic: `today()`, `currentPeriodStart/End()`, `isPayday()`, `isDueToday()`, `daysAgo()`, `displayDate()`, `shortDate()`. Period boundary logic is subtle — payday is the first day of the new period, so the period end is always the day before payday.

### `src/db/seed.js`
Seeds the database with the developer's family data on first launch (checks member count > 0 before seeding, so idempotent). Contains real chore and reward data for the family. Will be removed or generalised at distribution.

### `src/db/schema.js`
Schema reference file (not used at runtime — documentation only).

### `src/db/migrate.js`
Migration utility for moving data from an earlier Dexie/IndexedDB schema to Supabase. Only needed for historical one-time migration.

---

## 4. Scaffolding / Config

Files that are setup boilerplate and rarely need to change.

| File | Purpose |
|---|---|
| `vite.config.js` | Build config: React plugin, TailwindCSS plugin, PWA plugin (manifest, service worker, icon paths, cache strategy) |
| `eslint.config.js` | ESLint rules for React hooks and fast-refresh |
| `package.json` | Dependencies: React 19, react-router-dom 7, @supabase/supabase-js 2, date-fns 4, recharts 3, lucide-react |
| `index.html` | HTML shell, Google Fonts (JetBrains Mono), PWA meta tags, React root mount |
| `src/main.jsx` | React root render — mounts `<App />` into `#root` |
| `src/index.css` | Global CSS variables (colour tokens, typography), pin dot styles, `fadeInUp` keyframe, Tailwind imports |
| `public/` | Static assets: favicon, PWA icons (192px, 512px), apple-touch-icon |
| `.env` (not committed) | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — required for the app to connect to any database |

---

## 5. Data Flow Maps

Plain English paths from user action to database, for each major operation.

### Child marks a mandatory chore done

1. Child taps a chore on the Chores screen
2. `Chores.jsx` calls `addChoreLog(choreId, memberId, today())` in operations.js
3. operations.js inserts a row into `chore_logs` with `status: 'pending'`
4. Supabase Realtime fires — `FamilyContext` calls `loadFamily()`, `reloadCount` increments
5. Parent sees the badge on the Approve tab increment
6. Parent opens ApproveChores, taps Approve
7. `ApproveChores.jsx` calls `approveChoreLog(logId)` in operations.js
8. operations.js updates the `chore_logs` row to `status: 'approved'`, sets `approved_at`
9. `updateCreditScore(memberId, +2)` is called — score ticks up
11. Realtime fires again — all views refresh

### Payslip run and settlement (payday flow)

1. Parent opens Dashboard on payday — sees child cards and a "Run Payslip" button
2. Parent taps Run Payslip for a child
3. `Dashboard.jsx` calls `runPayslip(memberId)` from the payslip engine
4. Engine loads: family config, member data, all chores, chore logs for the period, utility charges for the period, and 60 days of chore logs for streak calculation
5. `calculatePayslip()` runs — pure math, no DB calls — computing gross, deductions, net, allocations, interest, loan repayment, credit score delta
6. Result is saved via `addPayslip()` in operations.js as a new row in `payslips` with `status: 'draft'`
7. Nothing else is written to the DB — member balances are unchanged at this point
8. Parent reviews the draft payslip (shown as a PayslipCard in the dashboard and ledger)
9. Parent taps Settle
10. `settlePayslip(payslipId)` in the engine runs:
    a. Fetches the payslip row and the member
    b. Calls `updateMemberAccounts` — overwrites spending, savings, philanthropy, sub-goals, loan with the payslip's `balancesAfter` values
    c. Calls `updateTaxFund` — adds salary tax + interest tax to the family tax fund balance and appends a history entry
    d. Loops through all transactions (salary, bonuses, taxes, rent, utilities, interest, loan events) and calls `addTransaction` for each one
    e. Computes the credit score delta (based on completion %, missed chore count, loan repayment)
    f. Calls `updateCreditScore` with the delta
    g. Calls `updatePayslipStatus` (draft → settled) and `updatePayslipCreditScore` (writes settled score back to payslip row so historical chart is accurate)
11. Realtime fires — all views refresh with new balances

### Child buys a reward (child-initiated)

1. Child opens the Rewards screen, taps a reward
2. Confirm bottom sheet shows balance before/after
3. Child confirms — `Rewards.jsx` calls `addRewardRequest(memberId, rewardId, rewardTitle, amount)` in operations.js
4. operations.js inserts into `reward_requests` with `status: 'pending'`; child's balance is NOT deducted yet
5. Realtime fires — parent's Approve badge increments
6. Parent opens ApproveChores, sees the reward request, taps Approve
7. `ApproveChores.jsx` calls `approveRewardRequest(requestId, memberId, amount)` in operations.js
8. operations.js checks current spending balance, deducts it via `updateMemberAccounts`, logs a `reward` transaction via `addTransaction`, marks reward request as approved
9. Realtime fires — child's wallet balance updates, child sees "🎉 [Reward] approved!" toast

### Parent buys a reward directly for a child

1. Parent opens ChildDetail, taps "Buy Reward" button
2. BuyRewardScreen overlay opens — category filter, 2-column reward grid
3. Parent selects a reward, taps confirm
4. `ChildDetail.jsx` calls `parentBuyReward(memberId, rewardId, rewardTitle, amount)` in operations.js
5. operations.js deducts spending via `updateMemberAccounts`, logs a `reward` transaction — no request queue involved
6. Realtime fires — balances refresh

### Parent gives a loan to a child

1. Parent opens Dashboard, taps the child card, then Give Loan in the sheet
2. `Dashboard.jsx` calls `giveLoan(memberId, amount, weeklyRepayment, interestFree)` in operations.js
3. operations.js fetches the member, adds `amount` to spending balance, sets `accounts.loan` with outstanding + repayment schedule
4. Logs a `loan_credit` transaction
5. Every subsequent payday: `calculatePayslip` computes loan interest on outstanding, then repayment up to min(weeklyRepay, outstanding, spending), sets `newLoanOutstanding`
6. At settlement: `updateMemberAccounts` writes new loan balance; `loan_interest` and `loan_repay` (or `loan_cleared`) transactions are logged

### Device claiming (new device setup)

1. New device loads the app — `DeviceGate` checks `localStorage('artha_device_claim')`
2. No claim found — calls `getDeviceClaim()` and `checkFamilyExists()` in parallel
3. Family exists, device unclaimed → shows JoinFamily screen
4. User enters a 6-char invite code
5. `JoinFamily.jsx` calls `claimDevice(code)` in operations.js
6. operations.js validates the code (not expired, not already used), marks it used, upserts a `device_claims` row linking `device_id` → `family_id` + `member_id`
7. Claim is cached in `localStorage('artha_device_claim')`
8. DeviceGate transitions to 'ready' — full app loads
9. PinAuth auto-selects the claimed member if `memberId` is set

### Child requests a cash withdrawal

1. Child opens Wallet, taps "Cash / Bank out"
2. `CashOutSheet` opens — shows amount input and destination (physical cash or bank transfer)
3. Child confirms — `Wallet.jsx` calls `addMemberRequest` with type `cash_withdrawal` in operations.js
4. operations.js inserts into `member_requests` with `status: 'pending'`; balance not touched yet
5. Parent sees badge increment on Approve tab
6. Parent approves — `ApproveChores.jsx` calls `approveSpendingWithdrawal(requestId, memberId, amount, destination)` in operations.js
7. operations.js deducts spending, logs a withdrawal transaction, marks request approved

---

## 6. Database Map

All 12 tables in Supabase. RLS is currently disabled on all tables — intentional during single-family testing phase.

### `families`
One row per family. Stores the family name and two critical JSON columns: `config` (all economic parameters — tax rate, rent, savings rate, interest rates, payday schedule, currency) and `tax_fund_balance` + `tax_fund_history` (the family's pooled tax fund). Every economic setting used in payroll comes from this row.

Related to: `members` (one-to-many by `family_id`), `chores` (by `family_id`), `rewards` (by `family_id`)

### `members`
One row per person — parents and children. Key fields: `role` (parent/child), `base_salary`, `pin` (SHA-256 hash), `credit_score` (300–850), `accounts` (JSON: spending, savings, philanthropy, subGoals array, loan object), `config` (JSON: per-child economic overrides, vacation state). The `accounts` column is the most mutation-sensitive field in the entire app.

Related to: `families` (many-to-one), `chore_logs`, `transactions`, `payslips`, `reward_requests`, `utility_charges`, `member_requests`, `device_claims`

### `chores`
Chore definitions. `type` is either `mandatory` (affects salary via completion %) or `bonus` (fixed value, paid at settlement). `assigned_to` is a JSON array of member IDs — empty means open to all children for bonus chores. `recurrence` controls which days it's due: daily, weekday, weekend, weekly, or custom (with `days_per_week`). `is_active` soft-deletes rather than hard-deletes.

Related to: `families` (by `family_id`), `chore_logs` (by `chore_id`)

### `chore_logs`
One row per chore completion attempt. `status` is pending, approved, or rejected. Created when a child marks a chore done; updated when parent approves or rejects. The payslip engine reads these to compute completion percentage and streak.

Related to: `members` (by `member_id`), `chores` (by `chore_id`)

### `transactions`
Immutable audit log of every financial event. `type` is one of: salary, bonus, parent_bonus, tax, rent, utility, interest, loan_credit, loan_repay, loan_interest, loan_cleared, reward, deposit, withdrawal. Amount is positive for credits, negative for debits. Every settlement writes multiple transaction rows in sequence. These power the Ledger view and analytics charts.

Related to: `members` (by `member_id`)

### `payslips`
One row per completed payroll run per child. `status` is draft (calculated, not yet committed to balances) or settled (balances updated). Key JSON columns: `earnings` (salary, chore completion %, streak, bonuses, vacation flags), `deductions` (tax, rent, utilities, loan interest), `allocations` (savings %, philanthropy %, spending), `balances_after` (the exact account state after settlement), `credit_score` (written at settlement time, not draft time). `bonus_potential` stores the max possible bonus chore earnings for that period.

Related to: `members` (by `member_id`)

### `rewards`
Catalog of redeemable items. `cost` in the DB maps to `price` in JS (via `mapReward` — this mapping is a known sharp edge). `is_active` soft-deletes. `category` is preset (screen_time, treat, experience, material, custom) or a free-text custom string.

Related to: `families` (by `family_id`), `reward_requests` (by `reward_id`)

### `reward_requests`
Child-initiated reward purchase requests. `status`: pending (waiting for parent), approved, rejected. When approved, the balance is deducted and a transaction is logged. Stores `reward_title` as a snapshot (in case reward is later deleted).

Related to: `members` (by `member_id`), `rewards` (by `reward_id`)

### `utility_charges`
Ad-hoc charges logged by the parent against a child for one-off expenses (e.g., phone bill overage). Collected during `runPayslip` for the relevant period and deducted from gross as a utility line item.

Related to: `members` (by `member_id`)

### `member_requests`
Multi-purpose approval queue for actions requiring parent sign-off: `donation` (child wants to donate from philanthropy), `subgoal_withdrawal`, `cash_withdrawal`, `tax_goal_vote`. The `metadata` JSON field carries type-specific data (subgoal ID, destination, etc.). Approved by parent in ApproveChores.

Related to: `families` (by `family_id`), `members` (by `member_id`)

### `join_codes`
Six-character alphanumeric invite codes generated by the parent. Each code has a 10-minute TTL (`expires_at`), is single-use (`used_at`), and is linked to a specific `family_id` and `member_id`. Used during device claiming.

Related to: `families` (by `family_id`), `members` (by `member_id`)

### `device_claims`
Maps `device_id` (UUID stored in localStorage) to `family_id` + `member_id`. One row per device. `member_id: null` means the device is a parent device (sees all members). Child devices have a specific `member_id` and PinAuth auto-selects that member. Upserted on claim — a device can be reclaimed.

Related to: `families` (by `family_id`), `members` (by `member_id`)

---

## 7. External Services

### Supabase
**URL:** `https://uhmpjkalbzkhrhibgyba.supabase.co`

**What it does:** PostgreSQL database (12 tables, all data), Realtime subscriptions (7 channels in FamilyContext), and storage for all app state. No Supabase Auth is used yet — authentication is custom PIN-based. RLS is disabled on all tables.

**Files connected:**
- `src/db/supabase.js` — client initialisation
- `src/db/operations.js` — all queries and mutations
- `src/context/FamilyContext.jsx` — Realtime subscriptions
- `src/App.jsx` — DeviceGate direct Supabase calls (device_claims upsert on skip/bypass)

**Environment variables required:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Vercel
**URL:** `https://artha-indol.vercel.app`

**What it does:** Hosts the built React SPA. Serves the PWA assets (HTML, JS, CSS, icons, service worker). No server-side code — purely static hosting. Environment variables are set in the Vercel project dashboard.

**Files connected:** `vite.config.js` (build output), `public/` (static assets)

### Google Fonts (JetBrains Mono)
Loaded in `index.html` via `<link>` tags. Used throughout the app as the primary monospace font for the terminal aesthetic. Cached by the PWA service worker (`CacheFirst` strategy). If Google Fonts is unreachable, the app falls back to system monospace fonts.

---

## 8. Danger Zones

Areas where mistakes have serious financial or security consequences.

### `settlePayslip` — the most dangerous function in the app
Calling it twice on the same payslip throws an error (guarded), but calling it with wrong data writes wrong balances. There is no rollback — if `updateMemberAccounts` succeeds but a subsequent `addTransaction` fails, the balance is updated but the transaction is missing. Future sessions won't know what caused the balance change. Never add logic to this function without understanding the full settlement sequence.

### `updateMemberAccounts` — overwrites the entire accounts JSON
This function takes the full `accounts` object and writes it wholesale to the DB. Every caller must spread the existing accounts first (`{ ...member.accounts, spending: newValue }`). If any caller forgets `subGoals` or `loan` in the spread, those fields are silently deleted from the database. There is no schema enforcement on the JSON column.

### `importAllData` — destructive restore
The backup restore operation in `Backup.jsx` deletes all rows across 8 tables for the family before re-inserting from the JSON file. There is no confirmation step after the user picks a file. If the JSON is malformed or from a different schema version, the restore may fail mid-way, leaving the database in a partially wiped state with no rollback.

### `FAMILY_ID = 'dev-family-001'`
Every single Supabase query uses this constant. It is currently hardcoded in `src/utils/constants.js`. In multi-tenant distribution (Phase B), this must become dynamic. Until then, changing this string to anything else will make the app see a different (or empty) family. Never hardcode this string anywhere except `constants.js`.

### Credit score mutations
Credit score is written in three places: at chore approval (`updateCreditScore(+2)`), at chore rejection (`updateCreditScore(-5)`, in ApproveChores), and at payslip settlement (`updateCreditScore(delta)` + `updatePayslipCreditScore(payslipId, settledScore)`). The settlement score must be written to both the member row and the payslip row — if only one is updated, the live score and historical chart will diverge. The `settlePayslip` function does both.

### PIN hashing
PINs are hashed with SHA-256 + `artha:` salt via Web Crypto in `pinUtils.js`. If the salt prefix is changed, all existing PINs become unverifiable and every user is locked out. If verification logic is changed to be case-insensitive or trimmed, the security guarantee weakens. The PIN is the only authentication factor currently.

### Economic Controls — loan interest must always exceed savings interest
`EconomicControls.jsx` enforces in the UI that loan interest rate ≥ savings interest rate. If this validation is removed, children could profitably borrow money and earn more on savings than they pay in loan interest — a child-exploitable economic bug. The engine itself does not enforce this.

### Backup / Reset All History & Wallets
The Reset button in `Backup.jsx` wipes chore_logs, transactions, payslips, utility_charges, reward_requests, member_requests, and zeros all balances. It has a two-step confirmation UI, but once confirmed it fires immediately with no undo. Do not trigger this without testing it first in a dev/staging context.

---

## 9. If This Breaks

Quick symptom → investigation guide for common failure scenarios.

| Symptom | Where to look |
|---|---|
| **App shows blank / loading spinner forever** | Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars. Check `FamilyContext.jsx` — if `loadFamily` throws, loading stays true. Check Supabase project is not paused (free tier pauses after 1 week inactivity). |
| **Balances don't change after settling a payslip** | Check `settlePayslip` in `payslip.js`. Check `updateMemberAccounts` was actually called. Check Supabase logs for any DB error during settlement. |
| **Credit score chart is flat (all periods same score)** | The bug: score was being written at draft time, not settlement. `settlePayslip` must call both `updateCreditScore` AND `updatePayslipCreditScore`. If chart is flat, check that `updatePayslipCreditScore` is being called with the settled score (not the pre-settlement score). |
| **Salary calculation is wrong (wrong amounts on payslip)** | Start at `calculatePayslip` in `payslip.js`. Check: chore log query range (periodStart/periodEnd correct?), activeDates calculation (only days with any logs), streak bonus %, vacation flags. |
| **Chore completion % doesn't match what parent approved** | `calculatePayslip` computes completion using only `activeDates` (days the child logged at least one chore). Days before the child started using the app are excluded. This is intentional — don't change it without understanding the implications. |
| **Rewards showing NaN price** | `mapReward` in operations.js maps DB column `cost` → JS property `price`. If any code reads `.cost` directly from a reward object, it gets undefined. All UI and forms must use `.price`. |
| **Wrong family's data (or no data)** | Check `FAMILY_ID` in `src/utils/constants.js`. If it doesn't match the row in Supabase's `families` table, all queries return empty. |
| **Device gate loops / child stuck at Join screen** | Check `localStorage('artha_device_claim')` in the browser. If it's corrupt (invalid JSON), `readCachedClaim` returns null and the gate keeps rechecking. Clear localStorage and reclaim. Also check `device_claims` table in Supabase — the row for this device's UUID must exist. |
| **Realtime not working (balance doesn't update on other device)** | Check `FamilyContext.jsx` channel subscription. Supabase Realtime requires the DB tables to have replication enabled — confirm in Supabase dashboard under Database → Replication. Also check if the Supabase project is on the free tier with connection limits hit. |
| **Savings interest is zero or wrong after settlement** | `runPayslip` loads the previous settled payslip to get `openingSavings` and `openingSubGoals`. If no previous payslip exists (first payslip), it falls back to current balance. If the previous payslip is still in draft, `openingSavings` is null and falls back to current balance. Check `calculateWeeklyInterest(openingSavingsBase, config.interestRate)` — rate must be > 0 and balance must be > 0. |

---

*This document describes the system as of session 18 (2026-04-28). Update the relevant sections when new tables, services, or major features are added.*
