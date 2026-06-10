import { parseISO, getDay } from 'date-fns'
import {
  getMember, getFamily, getChores,
  getChoreLogsForPeriod, getUtilityCharges,
  addPayslip, rpcSettlePayslip, getPayslip,
  getPayslipForPeriod, getLatestPayslip,
  getSettledPayslipCounts, applyStagePatches,
} from '../db/operations'
import { deriveStage, stageRank } from '../utils/stages'
import { roundRupees } from '../utils/currency'
import { currentPeriodStart, currentPeriodEnd, daysAgo } from '../utils/dates'
import { calculateWeeklyInterest } from './interest'
import { calculateStreak } from './chores'
import { getFamilyId } from '../utils/family'

// ── Engine defaults (W6 base layer) ───────────────────────────────────────────
// Config resolution order: ENGINE_DEFAULTS → family.config → member.config.
// Numeric keys default to 0 so a config missing the stage-gated keys (e.g. the
// W5 Starter onboarding config) can never produce NaN allocations.
// streakBonusEnabled defaults false (Starter intent); migrateStageConfig
// backfills member.config for pre-W6 families, and stage patches set it true
// at Investor for everyone else.
export const ENGINE_DEFAULTS = {
  autoSavePercent:     0,
  interestRate:        0,
  philanthropyPercent: 0,
  streakBonusEnabled:  false,
}

// ── Pure calculation ──────────────────────────────────────────────────────────

/**
 * Calculate a payslip without touching the DB.
 * Returns the full payslip data structure.
 */
export function calculatePayslip({
  member,
  familyConfig,
  allChores,
  choreLogs,
  utilityCharges,
  periodStart,
  periodEnd,
  streakDays = 0,
  openingSavings  = null,   // prev payslip balancesAfter.savings — used for interest (prevents gaming)
  openingSubGoals = null,   // prev payslip balancesAfter.subGoals
}) {
  const config = { ...ENGINE_DEFAULTS, ...familyConfig }

  // ── 1. Mandatory chores completion ─────────────────────────────
  const mandatoryChores = allChores.filter(c =>
    c.type === 'mandatory' &&
    c.isActive &&
    c.assignedTo.includes(member.id)
  )

  // Only evaluate completion for days the child actually logged any chore.
  // This prevents penalising a child for days before they started using the
  // app (e.g. starting on Saturday shouldn't count 6 days of absence).
  const activeDates = [...new Set(choreLogs.map(l => l.date))]

  let totalExpected = 0
  let totalApproved = 0

  for (const chore of mandatoryChores) {
    let expected = 0
    let approved = 0

    for (const date of activeDates) {
      const day = getDay(parseISO(date))
      let due = false
      switch (chore.recurrence) {
        case 'daily':   due = true; break
        case 'weekday': due = day >= 1 && day <= 5; break
        case 'weekend': due = day === 0 || day === 6; break
        case 'weekly':  due = day === 1; break
        case 'custom':  due = true; break
        default:        due = false
      }
      if (due) {
        expected++
        if (choreLogs.some(l => l.choreId === chore.id && l.date === date && l.status === 'approved')) {
          approved++
        }
      }
    }

    // Custom recurrence is capped at daysPerWeek across the period
    if (chore.recurrence === 'custom') {
      expected = Math.min(expected, chore.daysPerWeek ?? 3)
      approved = Math.min(approved, chore.daysPerWeek ?? 3)
    }

    totalExpected += expected
    totalApproved += approved
  }

  const mandatoryCompletionPercent = totalExpected > 0 ? totalApproved / totalExpected : 1
  const adjustedSalary = roundRupees(member.baseSalary * mandatoryCompletionPercent)

  // ── 2. Streak bonus ─────────────────────────────────────────────
  // Consecutive days all mandatory chores approved → bonus on adjusted salary.
  // streakBonusEnabled comes from the merged config (ENGINE_DEFAULTS layer);
  // W6 stage patches will gate it per-child via member.config.
  const streakBonusEnabled = config.streakBonusEnabled !== false
  const streakBonusPct = !streakBonusEnabled ? 0
    : streakDays >= 14 ? 0.15 : streakDays >= 7 ? 0.10 : streakDays >= 3 ? 0.05 : 0
  const streakBonus    = roundRupees(adjustedSalary * streakBonusPct)

  // ── 3. Bonus chore earnings (approved during this period, paid out on settle) ─
  // Bonus chores bypass tax/deductions — credited directly to spending on settle.
  const bonusChoreMap = Object.fromEntries(
    allChores.filter(c => c.type === 'bonus').map(c => [c.id, c])
  )
  const bonusChoreItems = choreLogs
    .filter(l => l.status === 'approved' && bonusChoreMap[l.choreId])
    .map(l => ({ logId: l.id, choreId: l.choreId, title: bonusChoreMap[l.choreId].title, value: bonusChoreMap[l.choreId].value }))
  const bonusChoreEarnings = bonusChoreItems.reduce((s, b) => s + b.value, 0)

  // ── Missed mandatory chores (full period, for credit scoring at settle) ─
  // "Done" = approved OR pending (child submitted; parent delay shouldn't penalise child)
  const pStart = new Date(periodStart + 'T12:00:00')
  const pEnd   = new Date(periodEnd   + 'T12:00:00')
  const periodDays = Math.round((pEnd - pStart) / (1000 * 60 * 60 * 24)) + 1
  let fullPeriodExpected = 0
  let fullPeriodDone     = 0
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(pStart)
    d.setDate(pStart.getDate() + i)
    const day     = d.getDay()
    const dateStr = d.toISOString().split('T')[0]
    for (const chore of mandatoryChores) {
      let due = false
      switch (chore.recurrence) {
        case 'daily':   due = true; break
        case 'weekday': due = day >= 1 && day <= 5; break
        case 'weekend': due = day === 0 || day === 6; break
        case 'weekly':  due = day === 1; break
        case 'custom':  due = true; break
      }
      if (due) {
        fullPeriodExpected++
        if (choreLogs.some(l =>
          l.choreId === chore.id && l.date === dateStr &&
          (l.status === 'approved' || l.status === 'pending')
        )) fullPeriodDone++
      }
    }
  }
  const missedMandatoryCount = Math.max(0, fullPeriodExpected - fullPeriodDone)

  // ── Bonus chore potential: max earnings if child did every bonus chore ─
  const bonusChoresAll = allChores.filter(c => c.type === 'bonus' && c.isActive && c.assignedTo.includes(member.id))
  const bonusPotential = bonusChoresAll.reduce((sum, c) => {
    let freq
    switch (c.recurrence) {
      case 'daily':   freq = periodDays; break
      case 'weekday': freq = Math.round(periodDays * 5 / 7); break
      case 'weekend': freq = Math.round(periodDays * 2 / 7); break
      case 'weekly':  freq = Math.ceil(periodDays / 7); break
      case 'custom':  freq = Math.round((periodDays / 7) * (c.daysPerWeek ?? 1)); break
      default:        freq = 1; break
    }
    return sum + (c.value ?? 0) * freq
  }, 0)

  // ── Vacation overrides ──────────────────────────────────────────────────
  const onVacation = member.config?.vacation?.active ?? false
  const paidLeave  = member.config?.vacation?.paidLeave ?? false
  // Paid leave:   full salary, normal deductions, no chore/bonus effect
  // Unpaid leave: zero salary, zero deductions, interest still accrues
  const effectiveSalary     = onVacation ? (paidLeave ? member.baseSalary : 0) : adjustedSalary
  const effectiveStreak     = onVacation ? 0 : streakBonus
  const effectiveBonus      = onVacation ? 0 : bonusChoreEarnings
  const effectiveMissed     = onVacation ? 0 : missedMandatoryCount
  const effectiveCompletion = onVacation ? (paidLeave ? 1 : mandatoryCompletionPercent) : mandatoryCompletionPercent

  // ── 4. Gross (salary + streak bonus + bonus chore earnings, all taxed) ──
  const gross = effectiveSalary + effectiveStreak + effectiveBonus

  // ── 5. Deductions ───────────────────────────────────────────────
  const tax                = roundRupees(gross * config.taxRate)
  // Rent & utilities waived on unpaid leave (no income, no charges)
  const rent               = onVacation && !paidLeave ? 0 : config.rentAmount
  const recurringUtilities = onVacation && !paidLeave ? 0 : (config.utilitiesAmount ?? 0)
  const utilityItems       = onVacation && !paidLeave ? [] : utilityCharges.map(u => ({ reason: u.reason, amount: u.amount, id: u.id }))
  const totalUtilities     = utilityItems.reduce((sum, u) => sum + u.amount, 0)
  const totalDeductions    = tax + rent + recurringUtilities + totalUtilities

  // ── 5. Net ──────────────────────────────────────────────────────
  const net = Math.max(0, gross - totalDeductions)

  // ── 6. Allocations ──────────────────────────────────────────────
  const savingsAlloc       = roundRupees(net * config.autoSavePercent)
  const philanthropyAlloc  = roundRupees(net * (config.philanthropyPercent ?? 0))
  const spending           = net - savingsAlloc - philanthropyAlloc

  // ── 7. Loan: interest compounds first, then repayment deducts ────
  const loanOutstanding = member.accounts.loan?.outstanding    ?? 0
  const loanWeeklyRepay = member.accounts.loan?.weeklyRepayment ?? 0
  const loanInterestRate = config.loanInterestRate ?? 0.05

  // Interest accrues on the pre-repayment balance — makes it impossible to
  // profitably borrow (loan rate ≥ savings rate is enforced in EconomicControls).
  // Skipped when the loan was explicitly marked interest-free by the parent.
  const loanInterestFree = member.accounts.loan?.interestFree ?? false
  const loanInterest = loanOutstanding > 0 && !loanInterestFree
    ? roundRupees(loanOutstanding * loanInterestRate)
    : 0
  const outstandingWithInterest = loanOutstanding + loanInterest

  // Repay as much as possible: up to the weekly amount, the new outstanding, and available spending
  const loanRepayment = outstandingWithInterest > 0
    ? Math.min(outstandingWithInterest, loanWeeklyRepay, spending)
    : 0
  const spendingAfterLoan  = spending - loanRepayment
  const newLoanOutstanding = Math.max(0, outstandingWithInterest - loanRepayment)

  // ── 8. Interest on savings and sub-goals (philanthropy earns no interest) ─
  // Interest uses the OPENING balance (previous period's closing) to prevent
  // gaming — e.g. moving wallet→savings on Saturday shouldn't earn a full
  // week's interest for just 2 days. Falls back to current balance for the
  // very first payslip (no previous payslip exists).
  const openingSavingsBase  = openingSavings  !== null ? openingSavings  : member.accounts.savings
  const philanthropyBalance = member.accounts.philanthropy ?? 0

  const interestEarned = calculateWeeklyInterest(openingSavingsBase, config.interestRate)

  // Sub-goals: interest on opening balance; applied to current balance (mid-period deposits ok)
  const subGoals            = member.accounts.subGoals ?? []
  const openingSubGoalsBase = openingSubGoals ?? subGoals
  const subGoalsAfter       = subGoals.map(sg => {
    const openingSg  = openingSubGoalsBase.find(og => og.id === sg.id)
    const sgInterest = openingSg ? calculateWeeklyInterest(openingSg.balance, config.interestRate) : 0
    return { ...sg, balance: roundRupees(sg.balance + sgInterest) }
  })
  const subGoalInterestEarned = subGoalsAfter.reduce((sum, sg, i) =>
    sum + sg.balance - subGoals[i].balance, 0
  )

  // ── 9. Interest tax — applied at same rate as salary tax, deducted from savings ─
  const totalInterestEarned = interestEarned + subGoalInterestEarned
  const interestTax     = roundRupees(totalInterestEarned * config.taxRate)

  // ── 10. New balances ─────────────────────────────────────────────
  const newSavings      = member.accounts.savings + savingsAlloc + interestEarned - interestTax
  const newSpending     = member.accounts.spending + spendingAfterLoan
  const newPhilanthropy = philanthropyBalance + philanthropyAlloc   // no interest

  return {
    bonusPotential,
    earnings: {
      baseSalary:                  member.baseSalary,
      mandatoryCompletionPercent:  effectiveCompletion,
      adjustedSalary:              effectiveSalary,
      streakDays:                  onVacation ? 0 : streakDays,
      streakBonusPct:              onVacation ? 0 : streakBonusPct,
      streakBonus:                 effectiveStreak,
      bonusChoreEarnings:          effectiveBonus,
      bonusChoreItems:             onVacation ? [] : bonusChoreItems,
      missedMandatoryCount:        effectiveMissed,
      onVacation,
      paidLeave,
    },
    deductions: {
      tax,
      taxRate:          config.taxRate,
      rent,
      recurringUtilities,
      utilities:        utilityItems,
      totalUtilities,
      loanRepayment,
      loanInterest,
      loanInterestRate,
      interestTax,
      emi: 0,
    },
    gross,
    totalDeductions,
    net,
    allocations: {
      savings:          savingsAlloc,
      savingsRate:      config.autoSavePercent,
      philanthropy:     philanthropyAlloc,
      philanthropyRate: config.philanthropyPercent ?? 0,
      spending:         spendingAfterLoan,
    },
    interestEarned,
    subGoalInterestEarned,
    philanthropyInterestEarned: 0,
    loanOutstandingAfter: newLoanOutstanding,
    balancesAfter: {
      spending:     newSpending,
      savings:      newSavings,
      philanthropy: newPhilanthropy,
      subGoals:     subGoalsAfter,
      // Null when fully paid off so the loan chip disappears from UI
      loan: newLoanOutstanding > 0
        ? { outstanding: newLoanOutstanding, weeklyRepayment: loanWeeklyRepay, interestFree: loanInterestFree }
        : null,
    },
  }
}

// ── Run payslip (commits to DB) ───────────────────────────────────────────────

/**
 * Generate and save a payslip for a member.
 * Uses the current pay period unless overridden.
 * Throws if a payslip for this period already exists.
 */
export async function runPayslip(memberId, overridePeriod = null) {
  // Load family first so we can derive the correct period from config
  const family = await getFamily(getFamilyId())
  if (!family) throw new Error('Family not found')

  const periodStart = overridePeriod?.start ?? currentPeriodStart(family.config)
  const periodEnd   = overridePeriod?.end   ?? currentPeriodEnd(family.config)

  // ── Load data (60 days of chore logs for streak calculation) ────
  const [member, allChores, choreLogs, utilityCharges, streakLogs, settledCounts] = await Promise.all([
    getMember(memberId),
    getChores(getFamilyId()),
    getChoreLogsForPeriod(memberId, periodStart, periodEnd),
    getUtilityCharges(memberId, periodStart, periodEnd),
    getChoreLogsForPeriod(memberId, daysAgo(60), periodEnd),
    getSettledPayslipCounts([memberId]),
  ])

  if (!member) throw new Error(`Member ${memberId} not found`)

  // ── Effective config: family defaults + per-child overrides ──────
  const effectiveConfig = member.config
    ? { ...family.config, ...member.config }
    : family.config

  // ── Calculate streak ────────────────────────────────────────────
  const mandatoryChores = allChores.filter(c =>
    c.type === 'mandatory' && c.isActive && c.assignedTo.includes(memberId)
  )
  const streakDays = calculateStreak(streakLogs, mandatoryChores)

  // ── Guard: already processed? ───────────────────────────────────
  const existing = await getPayslipForPeriod(memberId, periodEnd)
  if (existing) throw new Error(`Payslip already exists for period ending ${periodEnd}`)

  // ── Load previous settled payslip for opening-balance interest calc ─
  const prevPayslip    = await getLatestPayslip(memberId).catch(() => null)
  const openingSavings  = prevPayslip?.status === 'settled' ? (prevPayslip.balancesAfter?.savings  ?? null) : null
  const openingSubGoals = prevPayslip?.status === 'settled' ? (prevPayslip.balancesAfter?.subGoals ?? null) : null

  // ── Calculate ───────────────────────────────────────────────────
  const loanWeeklyRepay = member.accounts.loan?.weeklyRepayment ?? 0

  const calc = calculatePayslip({
    member,
    familyConfig: effectiveConfig,
    allChores,
    choreLogs,
    utilityCharges,
    periodStart,
    periodEnd,
    streakDays,
    openingSavings,
    openingSubGoals,
  })

  // ── Pre-compute transactions for atomic RPC settlement ──────────
  const pendingTransactions = [
    calc.earnings.adjustedSalary > 0 && {
      type: 'salary',
      amount: calc.earnings.adjustedSalary,
      description: `Salary — ${Math.round(calc.earnings.mandatoryCompletionPercent * 100)}% chore completion${calc.earnings.streakDays >= 3 ? ` · ${calc.earnings.streakDays}d streak` : ''}`,
      relatedId: null,
    },
    calc.earnings.streakBonus > 0 && {
      type: 'bonus',
      amount: calc.earnings.streakBonus,
      description: `Streak bonus (${calc.earnings.streakDays} days · +${Math.round(calc.earnings.streakBonusPct * 100)}%)`,
      relatedId: null,
    },
    ...(calc.earnings.bonusChoreItems ?? []).map(b => ({
      type: 'bonus',
      amount: b.value,
      description: `Bonus chore: ${b.title}`,
      relatedId: null,
    })),
    calc.deductions.tax > 0 && {
      type: 'tax',
      amount: -calc.deductions.tax,
      description: `Tax (${+(calc.deductions.taxRate * 100).toFixed(2)}%)`,
      relatedId: null,
    },
    (calc.deductions.interestTax ?? 0) > 0 && {
      type: 'tax',
      amount: -calc.deductions.interestTax,
      description: `Interest tax (${+(calc.deductions.taxRate * 100).toFixed(2)}%)`,
      relatedId: null,
    },
    calc.deductions.rent > 0 && {
      type: 'rent',
      amount: -calc.deductions.rent,
      description: 'Weekly rent',
      relatedId: null,
    },
    (calc.deductions.recurringUtilities ?? 0) > 0 && {
      type: 'utility',
      amount: -(calc.deductions.recurringUtilities),
      description: 'Recurring utilities',
      relatedId: null,
    },
    ...(calc.deductions.utilities ?? []).map(u => ({
      type: 'utility',
      amount: -u.amount,
      description: u.reason,
      relatedId: null,
    })),
    calc.interestEarned > 0 && {
      type: 'interest',
      amount: calc.interestEarned,
      description: `Savings interest (${+(effectiveConfig.interestRate * 100).toFixed(2)}%/wk)`,
      relatedId: null,
    },
    (calc.allocations?.philanthropy ?? 0) > 0 && {
      type: 'deposit',
      amount: calc.allocations.philanthropy,
      description: 'Philanthropy allocation',
      relatedId: null,
    },
    calc.deductions.loanInterest > 0 && {
      type: 'loan_interest',
      amount: calc.deductions.loanInterest,
      description: `Loan interest (${+(calc.deductions.loanInterestRate * 100).toFixed(2)}%/period)`,
      relatedId: null,
    },
    calc.deductions.loanRepayment > 0 && calc.loanOutstandingAfter > 0 && {
      type: 'loan_repay',
      amount: -calc.deductions.loanRepayment,
      description: `Loan repayment (${calc.loanOutstandingAfter} remaining)`,
      relatedId: null,
    },
    calc.deductions.loanRepayment > 0 && calc.loanOutstandingAfter === 0 && {
      type: 'loan_cleared',
      amount: -calc.deductions.loanRepayment,
      description: 'Final loan repayment — loan fully cleared!',
      relatedId: null,
    },
  ].filter(Boolean)

  // ── Pre-compute credit delta for atomic RPC settlement ───────────
  let creditDelta = 0
  if (!calc.earnings.onVacation) {
    const pct    = calc.earnings.mandatoryCompletionPercent
    const missed = calc.earnings.missedMandatoryCount ?? 0
    if (pct >= 1.0)     creditDelta += 10
    else if (pct < 0.5) creditDelta -= 30
    else                creditDelta -= missed * 2
  }
  if (calc.deductions.loanRepayment > 0) {
    if (calc.loanOutstandingAfter === 0)                             creditDelta += 5
    else if (calc.deductions.loanRepayment < loanWeeklyRepay)        creditDelta -= 10
  }

  // ── Save as draft (no balance updates yet) ──────────────────────
  // W6: stamp the stage the payslip is earned at, so historical payslips
  // always render with the rows that were unlocked at the time.
  const stage = deriveStage(settledCounts[memberId] ?? 0, family.config?.stageOverride)

  const payslipId = crypto.randomUUID()
  await addPayslip({
    id: payslipId,
    memberId,
    periodStart,
    periodEnd,
    ...calc,
    creditScore: member.creditScore ?? 500,
    createdAt: new Date().toISOString(),
    status: 'draft',
    pendingTransactions,
    creditDelta,
    stage,
  })

  return { ...calc, id: payslipId, status: 'draft', stage }
}

// ── Settle payslip (commits balance updates to DB) ────────────────────────────

/**
 * Settle a draft payslip atomically via Postgres RPC.
 * All six writes (accounts, tax fund, transactions, credit score, payslip status)
 * execute in a single transaction. Throws if payslip not found or already settled.
 *
 * W6: after the RPC succeeds, detect stage advancement (derived stage before vs
 * after this settle) and apply the new stage's config patch to the child.
 * Advancement work runs OUTSIDE the transaction and must never fail the settle.
 * Returns { settled, stageAdvanced } — stageAdvanced is null when no threshold
 * was crossed (W9 celebrations/alerts hook in here).
 */
export async function settlePayslip(payslipId) {
  const payslip = await getPayslip(payslipId).catch(() => null)
  const settled = await rpcSettlePayslip(payslipId)

  let stageAdvanced = null
  try {
    if (payslip?.memberId) {
      const [member, family, counts] = await Promise.all([
        getMember(payslip.memberId),
        getFamily(getFamilyId()),
        getSettledPayslipCounts([payslip.memberId]),
      ])
      const override = family?.config?.stageOverride ?? null
      const count    = counts[payslip.memberId] ?? 0   // includes the settle above
      const before   = deriveStage(count - 1, override)
      const after    = deriveStage(count, override)
      if (member && stageRank(after) > stageRank(before)) {
        await applyStagePatches(member, after)
        stageAdvanced = { memberId: member.id, from: before, to: after }
      }
    }
  } catch (e) {
    console.warn('[Artha] stage advancement after settle failed:', e)
  }
  return { settled, stageAdvanced }
}
