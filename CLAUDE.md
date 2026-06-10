# Artha

## What this is
Household economy PWA for kids — salary, chores, savings, loans, rewards, credit score. React 19 + Vite 8 + TailwindCSS 4 + Supabase (PostgreSQL + Realtime). Single-family personal use today; commercial distribution planned. No native app yet — PWA deployed on Vercel.

- **Vercel**: https://artha-indol.vercel.app
- **GitHub**: https://github.com/fourworx-artha/artha/
- **Git user**: `fourworx` / `fourworxlabs@gmail.com` (set as repo-local config)
- **Supabase project**: `uhmpjkalbzkhrhibgyba`

## Architecture Decisions
- (2025-early) Supabase over Dexie/IndexedDB — needed realtime sync across multiple devices
- (2026-04-15) Device auth via invite codes, not email — children don't have emails; parent generates per-child 6-char codes with 10-min TTL
- (2026-04-15) RLS intentionally disabled on all tables — single-family testing phase; Phase B2 will add `family_id`-based RLS before distribution
- (2026-04-15) `FAMILY_ID` hardcoded as constant — being replaced in W4 by `getFamilyId()` / `setFamilyId()` in `src/utils/family.js`; reads `localStorage('artha_family_id')`, falls back to `VITE_DEV_FAMILY_ID` in dev; DeviceGate self-migrates existing claimed devices
- (2026-04-22) Bonus chores taxed (part of gross) — consistent tax treatment; bonus earnings go through `gross = adjustedSalary + streakBonus + bonusChoreEarnings`
- (2026-04-22) Credit score written at settle time — not at draft creation; `settlePayslip` calls `updatePayslipCreditScore` so historical chart is accurate
- (2026-04-22) Philanthropy earns no interest — by design, discourages hoarding
- (2026-04-27) `progressPeriodStart/End` for projected earnings widget — avoids payday bug where widget showed last settled cycle data on payday Monday
- (2026-06-10) App name: **Arto** (user-facing — onboarding, manifest, all UI copy); "Artha" remains the internal/repo codename — no mass rename of code, DB identifiers, or file names
- (2026-06-10) Bundle ID for Phase E: `com.fourworx.arto` — NOT `com.artha.app`; bundle IDs are permanent once published; `com.fourworx.<app>` is the suite pattern
- (2026-06-10) Stage-gated economic keys (`autoSavePercent`, `interestRate`, `streakBonusEnabled`, `philanthropyPercent`) live **only in `member.config`**, never `family.config`; engine resolves config as `{ ...ENGINE_DEFAULTS, ...family.config, ...member.config }`; makes multi-child config leak structurally impossible
- (2026-06-10) Guided period: new families progress Starter → Saver (2 settled payslips) → Investor (3) → Economist (5); `payPeriod` locked to `'weekly'` until Economist; monthly cadence never interacts with stage thresholds
- (2026-06-10) `settlePayslip` moving to atomic Postgres RPC (`settle_payslip`) — single transaction for all 6 writes; `runPayslip` stores `pending_transactions` + `credit_delta` in the draft JSON; RPC is a dumb committer, zero business logic; tax fund updated via atomic increment (`balance = balance + delta`), not read-modify-write
- (2026-06-11) `ENGINE_DEFAULTS` shipped early (W6 STEP 0, pulled forward by audit fix A1) — `calculatePayslip` resolves `{ ...ENGINE_DEFAULTS, ...familyConfig }`; numeric stage-gated keys default to 0 so configs missing them can never produce NaN. Interim deviation: `streakBonusEnabled: true` (not `false` per W6 spec) to protect pre-W6 families whose configs lack the key — W6 stage patches must flip it to `false`
- (2026-06-11) Onboarding starter config must NOT include `autoSettle` — the W3 first-settle prompt only fires while the key is `undefined`; the parent chooses the mode there (amends session-23 starterConfig)
- (2026-06-11) Backup format v4 — restore preserves payslip `status`/`pending_transactions`/`credit_delta`/`bonus_potential`, maps reward `price → cost`, includes `member_requests`; `join_codes`/`device_claims` deliberately never in backups (device-bound). Do not restore from pre-v4 backups

## Key Business Rules
- `mapReward` maps DB `cost` → JS `price` — never use `.cost` in UI or forms
- On payday, use `progressPeriodStart/End` (not `periodStart/End`) for anything projecting the current active period
- Pending chore logs count as "done" for credit score — parent approval delay must not penalise the child
- All DB operations go through `src/db/operations.js` — never write raw Supabase queries in views
- `FAMILY_ID` always comes from `utils/constants` — never hardcode the string anywhere
- `formatRupees` in `currency.js` is a dead alias — always use the `useCurrency()` hook → `fmt(amount)`
- `calculatePayslip` is a pure function — no DB calls inside it; all DB work is in `runPayslip` / `settlePayslip`
- Do not add RLS policies to Supabase tables yet — intentionally disabled until Phase B

## Conventions
- `src/db/operations.js` — all ~50 DB operations; every function does camelCase↔snake_case mapping
- `src/engine/` — pure functions only (`calculatePayslip`, `calculateStreak`, `calculateWeeklyInterest`)
- Views never import from Supabase directly; always go through operations.js
- Currency formatting: `useCurrency()` hook from `FamilyContext` → `fmt(amount, opts?)`
- Period dates: `usePeriod()` hook → `{ periodStart, periodEnd, progressPeriodStart, progressPeriodEnd, paydayToday }`
- Bottom sheets defined inline in the view file, not as separate component files
- `src/components/` — shared display-only components (charts, cards); no business logic

## Milestones
- [x] Phase 1: Core payroll engine, payslip system
- [x] Phase 2: Credit score, chore streaks, loans, rewards store, bonus chores
- [x] Phase 3: Supabase migration (full backend, realtime sync)
- [x] Phase 3.5: Settle/approve flow, period progress bars, ledger, philanthropy, sub-goals, utilities, economic controls
- [x] Phase 4: Analytics charts — net worth, credit gauge, savings projection, spending breakdown, tax fund thermometer, sparklines, family fund, bonus chore chart, top rewards
- [x] Phase 5: Device auth — invite codes, DeviceGate, JoinFamily, P2 parent support, vacation mode
- [ ] **Pre-distribution (Launch Blueprint — W1–W9):** accounts validation, atomic settlement RPC, auto-run payslips + first-settle teaching flow, dynamic family_id, guided onboarding (Arto branding, device handoff), guided period / stage system, in-app alerts (banners + bell), first-week checklist + empty states, stage celebrations
- [ ] Phase A: Personal testing — use placeholder names + throwaway PINs (RLS is off; real identities only after Phase B2); test all features, fix bugs, polish UI/UX
- [ ] Phase B2: Multi-tenant architecture — RLS on all 12 tables + realtime channel `family_id` filters (dynamic family_id is pulled forward into pre-distribution work)
- [ ] Phase C: Supabase Auth for founding parent — email + password; JWT carries family_id; account deletion flow
- [ ] Phase D: Legal & compliance — Privacy Policy, ToS, account deletion, COPPA/GDPR-K declarations; URLs reserved at `fourworx.com/arto/privacy` and `fourworx.com/arto/terms`
- [ ] Phase E: Capacitor native app — iOS + Android, bundle ID `com.fourworx.arto`, signing, icons, TestFlight, Play Console
- [ ] Phase F: Monetisation — RevenueCat, free 30-day trial → subscription (~₹499/month)
- [ ] Phase G: Push notifications + Supabase Edge Function for midnight auto-payslip cron

---

## Session Management — Standing Orders

### Start of every session
1. Read the latest file in `/docs/sessions/` before doing anything else
2. Read `HANDOFF.md` — especially the **Next Session Starts Here** block
3. Do not begin work until context from last session is clear

### During a session
- If a significant architectural decision is made, amend CLAUDE.md immediately — do not wait until end of session
- Do not rewrite CLAUDE.md — only add or amend specific sections on instruction

### End of every session — run in this order
1. Write session report to `/docs/sessions/YYYY-MM-DD-session-N.md`
2. Update `HANDOFF.md` — especially the **Next Session Starts Here** block
3. Amend CLAUDE.md if anything permanent changed today
4. Push session to Notion Sessions Log database on the project page:
   - HandOff Version-Start: session report filename
   - Session #: N
   - Session Date: today
   - Phase: current phase
   - Summary: 2-3 line summary of what was done
   - Decisions Made: key decisions from this session
   - Next Step: exact next action
   - Commit: git commit message
5. Update the Project Status callout at the top of the Notion project page:
   - Current Milestone, Status, Last Session date, Blockers
6. Remind Dev to review and run: `git add . → git commit → git push` if working code
7. If this session added a major feature, changed the database schema, or added an external service — update docs/codebase-map.md to reflect the changes. Only update the affected sections, don't rewrite the whole document.

### Notion project page
- **Artha project page** (Project Status callout lives here): https://www.notion.so/kamboj/Artha-358d17006c2681e88d10fc09b6b5725e
- **Fourworx workspace**: (Sessions Log Databse live here and Session logs need to be updated here for Artha) https://www.notion.so/kamboj/Fourworx-341d17006c26814ea58fdc5f236d513c
Notion MCP is available — use it to push session data at end of every session.

### Session report format
```
# Session N — YYYY-MM-DD
## What was accomplished
## Files changed and why
## Decisions made
## Blockers / Open questions
## Exact next step
```

### Handoff doc format
```
## ⚡ Next Session Starts Here
[What to pick up, exact state, immediate next action]
## Current Status
## Architecture
## Open Questions / Blockers
```

### What Claude should never do
- Start work without reading the last session report
- Rewrite CLAUDE.md unprompted
- Suggest solutions without understanding the system context first
- Over-explain what was just built

### Codebase Reference
- docs/codebase-map.md — system map, data flows, danger zones
- Read this when: debugging, starting a new feature, or after 2+ weeks away from the project
- Update this when: new major feature added, database schema changes, new external service integrated
---

## graphify

This project has a graphify knowledge graph at `graphify-out/`.

Rules:
- Before answering architecture or codebase questions, read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
