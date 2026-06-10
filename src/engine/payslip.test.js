import { describe, it, expect } from 'vitest'
import { calculatePayslip } from './payslip'

// ── Minimal fixtures ──────────────────────────────────────────────────────────

function member(overrides = {}) {
  return {
    id: 'test-member',
    baseSalary: 100,
    creditScore: 500,
    accounts: {
      spending: 200,
      savings: 500,
      philanthropy: 50,
      subGoals: [],
      loan: null,
    },
    config: {},
    ...overrides,
  }
}

function config(overrides = {}) {
  return {
    taxRate: 0.10,
    rentAmount: 20,
    utilitiesAmount: 0,
    interestRate: 0.02,
    loanInterestRate: 0.05,
    autoSavePercent: 0.20,
    philanthropyPercent: 0.03,
    streakBonusEnabled: true,
    ...overrides,
  }
}

function baseArgs(overrides = {}) {
  return {
    member: member(),
    familyConfig: config(),
    allChores: [],
    choreLogs: [],
    utilityCharges: [],
    periodStart: '2026-06-02',
    periodEnd:   '2026-06-08',
    streakDays: 0,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('calculatePayslip — zero-case hardening', () => {

  it('zero chore logs: no crash, all values finite, net ≥ 0', () => {
    const result = calculatePayslip(baseArgs())
    expect(isFinite(result.gross)).toBe(true)
    expect(isFinite(result.net)).toBe(true)
    expect(result.net).toBeGreaterThanOrEqual(0)
    expect(isFinite(result.balancesAfter.spending)).toBe(true)
    expect(isFinite(result.balancesAfter.savings)).toBe(true)
    expect(isFinite(result.balancesAfter.philanthropy)).toBe(true)
  })

  it('zero chore logs with mandatory chores assigned: completion 1.0 (no active dates = no penalty)', () => {
    const chores = [{
      id: 'c1', type: 'mandatory', isActive: true,
      assignedTo: ['test-member'], recurrence: 'daily', value: 0,
    }]
    const result = calculatePayslip(baseArgs({ allChores: chores, choreLogs: [] }))
    expect(result.earnings.mandatoryCompletionPercent).toBe(1)
    expect(result.earnings.adjustedSalary).toBe(100)
  })

  it('autoSavePercent: 0 → no savings allocation, 100% of net to spending', () => {
    const result = calculatePayslip(baseArgs({ familyConfig: config({ autoSavePercent: 0, philanthropyPercent: 0 }) }))
    expect(result.allocations.savings).toBe(0)
    expect(result.allocations.philanthropy).toBe(0)
    expect(result.allocations.spending).toBe(result.net)
  })

  it('philanthropyPercent: 0 → no philanthropy allocation', () => {
    const result = calculatePayslip(baseArgs({ familyConfig: config({ philanthropyPercent: 0 }) }))
    expect(result.allocations.philanthropy).toBe(0)
  })

  it('interestRate: 0 → no interest earned, no NaN', () => {
    const result = calculatePayslip(baseArgs({ familyConfig: config({ interestRate: 0 }) }))
    expect(result.interestEarned).toBe(0)
    expect(isNaN(result.interestEarned)).toBe(false)
    expect(isNaN(result.balancesAfter.savings)).toBe(false)
  })

  it('interestRate: 0 with zero savings balance → no NaN', () => {
    const m = member({ accounts: { spending: 0, savings: 0, philanthropy: 0, subGoals: [], loan: null } })
    const result = calculatePayslip(baseArgs({ member: m, familyConfig: config({ interestRate: 0 }) }))
    expect(isNaN(result.interestEarned)).toBe(false)
    expect(isNaN(result.balancesAfter.savings)).toBe(false)
  })

  it('net cannot go negative even when deductions exceed gross', () => {
    const highRent = config({ taxRate: 0.5, rentAmount: 999, utilitiesAmount: 999 })
    const result = calculatePayslip(baseArgs({ familyConfig: highRent }))
    expect(result.net).toBeGreaterThanOrEqual(0)
    expect(result.allocations.spending).toBeGreaterThanOrEqual(0)
  })

  it('streakBonusEnabled: false → streak bonus is 0 regardless of streak days', () => {
    const result = calculatePayslip(baseArgs({
      familyConfig: config({ streakBonusEnabled: false }),
      streakDays: 30,
    }))
    expect(result.earnings.streakBonus).toBe(0)
    expect(result.earnings.streakBonusPct).toBe(0)
  })

  it('streakBonusEnabled: true → streak bonus applies', () => {
    const result = calculatePayslip(baseArgs({
      familyConfig: config({ streakBonusEnabled: true }),
      streakDays: 7,
    }))
    expect(result.earnings.streakBonus).toBeGreaterThan(0)
    expect(result.earnings.streakBonusPct).toBe(0.10)
  })

  it('streakBonusEnabled absent → defaults to enabled (backwards compat)', () => {
    const cfg = config()
    delete cfg.streakBonusEnabled
    const result = calculatePayslip(baseArgs({ familyConfig: cfg, streakDays: 7 }))
    expect(result.earnings.streakBonus).toBeGreaterThan(0)
  })

  it('sub-goals with interestRate: 0 → no NaN in subGoals balances', () => {
    const m = member({
      accounts: {
        spending: 100, savings: 200, philanthropy: 0,
        subGoals: [{ id: 'sg1', label: 'Bike', target: 500, balance: 100 }],
        loan: null,
      },
    })
    const result = calculatePayslip(baseArgs({ member: m, familyConfig: config({ interestRate: 0 }) }))
    expect(isNaN(result.balancesAfter.subGoals[0].balance)).toBe(false)
    expect(result.balancesAfter.subGoals[0].balance).toBe(100)
  })

  it('loan fully repaid in this period → loanOutstandingAfter is 0, loan in balancesAfter is null', () => {
    const m = member({
      accounts: {
        spending: 1000, savings: 0, philanthropy: 0, subGoals: [],
        loan: { outstanding: 50, weeklyRepayment: 100, interestFree: false },
      },
    })
    const result = calculatePayslip(baseArgs({ member: m }))
    expect(result.loanOutstandingAfter).toBe(0)
    expect(result.balancesAfter.loan).toBeNull()
  })

})
