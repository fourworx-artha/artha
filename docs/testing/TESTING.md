# Artha — Testing Checklist
**Setup: 2 parents (P1 = main device, P2 = second device) · 1 child (C1)**

---

## PHASE 1 — Fresh Start

- [ ] Truncate all Supabase tables (SQL provided in HANDOFF)
- [ ] Clear localStorage on all 3 devices
- [ ] Open app on P1 → JoinFamily screen appears
- [ ] Tap "I'm the parent on the main device →" → proceeds to Who are you?
- [ ] Default members seeded: see at least 1 parent + 1 child in the avatar grid
- [ ] P1 logs in as Parent → reaches parent dashboard

---

## PHASE 2 — Family Setup (P1)

### Members
- [ ] More → Family Members → edit parent name + PIN
- [ ] Add a second parent member (set role = parent, set PIN)
- [ ] Add a child (set name, avatar, salary, PIN)
- [ ] Verify all 3 members appear on the PIN screen

### Economic Controls
- [ ] More → Economic Controls → Simple mode shows only Tax / Rent / Auto-save
- [ ] Switch to Advanced → see Utilities, Interest, Philanthropy % sliders
- [ ] Set Tax = 10%, Rent = 50, Auto-save = 20%
- [ ] Save → "Saved ✓" appears
- [ ] Reopen Economic Controls → values persisted correctly

### Chores
- [ ] More → (back) → Chores → Add a mandatory daily chore assigned to child
- [ ] Add a second mandatory weekday chore assigned to child
- [ ] Add one bonus chore assigned to child
- [ ] All 3 chores appear in chore list

### Rewards
- [ ] More → Reward Manager → Add 2 rewards with different prices
- [ ] Rewards appear in list

---

## PHASE 3 — Device Auth (P2 + C1)

### P2 device setup
- [ ] P1: More → Invite Code → select P2 (parent member) → Generate Code
- [ ] P1 generates code — 6-char code shown with countdown
- [ ] P2 opens app → JoinFamily screen appears
- [ ] P2 enters code → reaches PIN screen showing only P2's avatar
- [ ] P2 enters PIN → reaches parent dashboard
- [ ] Reload P2 app → goes straight to PIN (no JoinFamily again)

### C1 device setup
- [ ] P1: More → Invite Code → select child → Generate Code
- [ ] C1 opens app → JoinFamily screen appears
- [ ] C1 enters code → PIN screen shows only child's avatar (no parent visible)
- [ ] C1 enters PIN → reaches child home screen
- [ ] Reload C1 app → goes straight to child's PIN

---

## PHASE 4 — Child Daily Flow (C1)

### Home screen
- [ ] See wallet balance, savings balance, philanthropy balance
- [ ] See projected pay widget (shows estimated this-period pay)
- [ ] Header shows name + credit score chip
- [ ] Tap ★ credit chip → credit score popup opens → dismiss

### Chores
- [ ] Tap Chores tab → see assigned mandatory + bonus chores
- [ ] Mark mandatory chore 1 as done → status = pending
- [ ] Mark mandatory chore 2 as done → status = pending
- [ ] Mark bonus chore as done → status = pending

### Rewards
- [ ] Tap Goals tab → see philanthropy balance
- [ ] Go back to Home → tap Rewards (if visible on home)
- [ ] Request a reward → confirmation shown

---

## PHASE 5 — Parent Approvals (P1)

### Approve chores
- [ ] Parent dashboard → Approve tab → see pending chore logs
- [ ] Approve mandatory chore 1 → disappears from pending
- [ ] Approve mandatory chore 2 → disappears from pending
- [ ] Reject bonus chore → disappears (or mark approved)
- [ ] Pending badge count on nav updates correctly

### Approve rewards
- [ ] Approve tab → see reward request
- [ ] Approve reward → child's spending balance decreases

---

## PHASE 6 — Payslip Flow (P1)

### Run payslip
- [ ] Parent dashboard → child card shows "Run Payslip" button (if on/after payday)
- [ ] Tap Run Payslip → draft payslip created
- [ ] Child ledger shows payslip with "⏳ Pending settlement" badge
- [ ] Parent dashboard shows yellow overdue banner (if past period end)

### Settle payslip
- [ ] Tap "Settle Pay" → PayslipCard sheet opens
- [ ] Review earnings: base salary, chore completion %, adjusted salary
- [ ] Review deductions: tax, rent
- [ ] Review net pay and allocations
- [ ] Tap "Approve & Pay" → success
- [ ] Child balances update (wallet, savings, philanthropy)
- [ ] "Pending settlement" badge gone from child ledger
- [ ] Transaction history in ledger shows salary, tax, rent, savings entries

---

## PHASE 7 — Child Post-Payslip (C1)

### Balances
- [ ] Home → wallet shows increased balance after settlement
- [ ] Savings card shows updated balance
- [ ] Philanthropy card shows updated balance

### Sparklines
- [ ] Wallet card has sparkline (shows balance history)
- [ ] Spent card has sparkline
- [ ] Savings card has sparkline
- [ ] Philanthropy card sparkline shows cumulative donations (starts flat — nothing donated yet)

### Ledger
- [ ] Ledger tab → payslip period appears collapsed
- [ ] Tap to expand → see individual transactions (salary, tax, rent, interest)

### Savings
- [ ] Savings tab → shows balance + interest rate
- [ ] Net worth chart visible

---

## PHASE 8 — Philanthropy & Goals (C1 + P1)

- [ ] C1: Goals tab → philanthropy balance shown
- [ ] C1: Tap Donate → enter charity name + amount → submit request
- [ ] P1: Approve tab → see donation request → approve
- [ ] C1: philanthropy balance decreases
- [ ] C1: philanthropysparkline starts rising (cumulative donation increased)

### Sub-goals
- [ ] P1: Child Detail → add a sub-goal (name + target amount)
- [ ] C1: Goals tab → sub-goal appears with progress bar
- [ ] C1: Request withdrawal → P1 approves → destination balance increases

---

## PHASE 9 — Tax Fund (P1 + C1)

- [ ] P1: More → Tax Fund → see balance (from payslip tax deductions)
- [ ] P1: Set a goal (label + amount) → thermometer appears
- [ ] C1: Family Fund tab → see tax balance + thermometer + own contribution bar
- [ ] C1: Suggest a goal → enter description + amount → submit
- [ ] P1: Tax Fund → see child's suggestion → approve
- [ ] Goal updates on both parent Tax Fund and child Family Fund

---

## PHASE 10 — Advanced Features

### Utilities
- [ ] P1: More → Utility Logger → add a one-off charge for child
- [ ] Run next payslip → charge appears in deductions on payslip

### Recurring utilities
- [ ] P1: Economic Controls → Advanced → set Recurring Utilities = some amount
- [ ] Next payslip shows "Utilities (recurring)" row in deductions

### Loans
- [ ] P1: More → Loans → give child a loan
- [ ] C1: Home → loan chip appears
- [ ] Next payslip → loan interest + repayment shown in deductions
- [ ] C1: Tap loan chip → early repayment sheet → make partial repayment
- [ ] Outstanding balance reduces

### Credit score
- [ ] After a few approved chores and a settled payslip, credit score changes
- [ ] Parent dashboard chip colour reflects score band
- [ ] C1: ★ chip shows updated score

---

## PHASE 11 — P2 Experience

- [ ] P2 logs in → reaches parent dashboard
- [ ] P2 can see child's chores, approve/reject
- [ ] P2 can run/settle payslip
- [ ] P2 can access Economic Controls, Tax Fund, Members
- [ ] Changes made by P2 reflected on P1 in real-time (Realtime sync)

---

## PHASE 12 — Edge Cases

- [ ] Enter wrong PIN → "Wrong PIN" error shown, cleared on retry
- [ ] Try to settle same payslip twice → error handled gracefully
- [ ] Child tries to donate more than philanthropy balance → blocked with error
- [ ] Invite code entered twice → "Code already used" error
- [ ] Expired invite code → "Code expired" error
- [ ] Economic Controls: loan rate auto-raises if set below savings rate

---

## SIGN-OFF

- [ ] All balances make mathematical sense (salary − deductions = net; net splits into allocations correctly)
- [ ] No console errors on any device
- [ ] App works offline / on poor connection (data loads from cache)
- [ ] Realtime: chore approved on P1, badge updates on P2 without refresh
