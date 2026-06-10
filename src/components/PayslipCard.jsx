import { displayDateFull } from '../utils/dates'
import { useCurrency } from '../context/FamilyContext'
import { stageHasFeature } from '../utils/stages'

// ── Terminal primitives ───────────────────────────────────────────────────────

const DIVIDER = '─'.repeat(36)

function Row({ label, value, dim, bold, positive, negative, indent, color }) {
  return (
    <div className="flex items-baseline justify-between" style={{ paddingLeft: indent ? '1rem' : 0 }}>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '12px',
        color: dim ? 'var(--text-dim)' : 'var(--text-muted)',
        flex: 1,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: bold ? '14px' : '12px',
        fontWeight: bold ? 700 : 400,
        color: positive ? 'var(--positive)'
             : negative ? 'var(--negative)'
             : color    ? color
             : bold     ? 'var(--text-primary)'
             : 'var(--text-muted)',
        minWidth: '70px',
        textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  )
}

function Divider({ char = '─' }) {
  return (
    <div style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '11px',
      color: 'var(--text-dim)',
      letterSpacing: '0',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
    }}>
      {char.repeat(40)}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '10px',
      letterSpacing: '0.12em',
      color: 'var(--text-muted)',
    }}>
      {children}
    </span>
  )
}

/** Terminal-style progress bar: [████████░░░░] 82% */
function TermBar({ value, max = 1, width = 16 }) {
  const ratio  = Math.min(Math.max(value / max, 0), 1)
  const filled = Math.round(ratio * width)
  const empty  = width - filled
  const pct    = Math.round(ratio * 100)
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '11px',
      color: pct >= 80 ? 'var(--positive)' : pct >= 50 ? 'var(--warning)' : 'var(--negative)',
    }}>
      {'█'.repeat(filled)}
      <span style={{ color: 'var(--text-dim)', opacity: 0.5 }}>{'░'.repeat(empty)}</span>
      {' '}{pct}%
    </span>
  )
}

// ── Main PayslipCard ──────────────────────────────────────────────────────────

export default function PayslipCard({ payslip, member, familyName }) {
  const fmtCurr = useCurrency()
  const fmt = (n) => {
    if (n == null) return fmtCurr(0, { forceDecimals: true })
    return (n < 0 ? '−' : '') + fmtCurr(Math.abs(n), { forceDecimals: true })
  }
  if (!payslip) return null
  const { earnings, deductions, gross, totalDeductions, net, allocations, interestEarned, subGoalInterestEarned } = payslip

  // W6: the payslip is the curriculum — rows for features above the stage it
  // was earned at are REMOVED, not dimmed. Pre-W6 payslips (stage null) render
  // everything. A Starter payslip shows exactly salary → tax → rent → net → spending.
  const stage = payslip.stage ?? 'economist'
  const has = (feature) => stageHasFeature(stage, feature)

  return (
    <div style={{
      background: 'var(--bg-base)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '20px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      {/* Header */}
      <div>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dim)' }}>
          ARTHA PAYROLL SYSTEM
        </div>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
          {member?.name ?? '—'}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {displayDateFull(payslip.periodStart)} – {displayDateFull(payslip.periodEnd)}
        </div>
      </div>

      <Divider />

      {/* Vacation banner */}
      {earnings.onVacation && (
        <div style={{
          background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)',
          borderRadius: '10px', padding: '8px 12px', textAlign: 'center',
          fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#60a5fa',
        }}>
          ✈️ {earnings.paidLeave ? 'Paid Leave — full salary, chores optional' : 'Unpaid Leave — no salary, no penalties'}
        </div>
      )}

      {/* Earnings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SectionLabel>EARNINGS</SectionLabel>
        <Row label="Base Salary"      value={fmt(earnings.baseSalary)} />
        <div className="flex items-center justify-between">
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: '12px', color: 'var(--text-muted)' }}>
            Chore Completion
          </span>
          <TermBar value={earnings.mandatoryCompletionPercent} max={1} width={14} />
        </div>
        <Row label="Adjusted Salary"  value={fmt(earnings.adjustedSalary)} positive={earnings.adjustedSalary > 0} />
        {has('streaks') && earnings.streakBonus > 0 && (
          <Row
            label={`🔥 Streak bonus (${earnings.streakDays}d · +${+(earnings.streakBonusPct * 100).toFixed(2)}%)`}
            value={fmt(earnings.streakBonus)} positive indent />
        )}
        {(earnings.bonusChoreItems ?? []).length > 0 && (
          <>
            <SectionLabel>BONUS CHORES</SectionLabel>
            {earnings.bonusChoreItems.map((b, i) => (
              <Row key={i} label={`⚡ ${b.title}`} value={fmt(b.value)} positive indent />
            ))}
            {(payslip.bonusPotential ?? 0) > 0 && (
              <div style={{ paddingLeft: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--text-dim)' }}>
                  {fmt(earnings.bonusChoreEarnings)} of {fmt(payslip.bonusPotential)} potential ({Math.round(earnings.bonusChoreEarnings / payslip.bonusPotential * 100)}%)
                </span>
              </div>
            )}
          </>
        )}
        <Divider char="·" />
        <Row label="GROSS" value={fmt(gross)} bold positive={gross > 0} />
      </div>

      <Divider />

      {/* Deductions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SectionLabel>DEDUCTIONS</SectionLabel>
        <Row label={`Tax (${+(((deductions.taxRate ?? deductions.tax / (gross || 1)) * 100)).toFixed(2)}%)`} value={fmt(-deductions.tax)} negative={deductions.tax > 0} />
        <Row label="Rent"             value={fmt(-deductions.rent)} negative={deductions.rent > 0} />
        {(deductions.recurringUtilities ?? 0) > 0 && (
          <Row label="Utilities (recurring)" value={fmt(-deductions.recurringUtilities)} negative />
        )}
        {deductions.utilities?.map((u, i) => (
          <Row key={i} label={u.reason} value={fmt(-u.amount)} negative indent />
        ))}
        {has('loans') && deductions.loanRepayment > 0 && (
          <Row label="Loan Repayment" value={fmt(-deductions.loanRepayment)} negative />
        )}
        {has('interest') && (deductions.interestTax ?? 0) > 0 && (
          <Row label={`Interest tax (${+(((deductions.taxRate ?? 0)) * 100).toFixed(2)}%)`} value={fmt(-deductions.interestTax)} negative />
        )}
        <Divider char="·" />
        <Row label="TOTAL DEDUCTIONS" value={fmt(-totalDeductions)} bold negative={totalDeductions > 0} />
      </div>

      <Divider />

      {/* Net pay */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{
            fontFamily: 'JetBrains Mono', fontSize: '11px', letterSpacing: '0.12em', color: 'var(--text-muted)',
          }}>
            NET PAY
          </span>
          <span style={{
            fontFamily: 'JetBrains Mono', fontSize: '24px', fontWeight: 700,
            color: net > 0 ? 'var(--positive)' : 'var(--negative)',
          }}>
            {fmt(net)}
          </span>
        </div>
      </div>

      <Divider />

      {/* Allocations */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SectionLabel>ALLOCATIONS</SectionLabel>
        {has('savings') && (
          <Row label={`→ Savings (${+((allocations.savingsRate ?? allocations.savings / (net || 1)) * 100).toFixed(2)}%)`} value={fmt(allocations.savings)} positive={allocations.savings > 0} />
        )}
        {has('philanthropy') && allocations.philanthropy > 0 && (
          <Row label={`→ Philanthropy (${+((allocations.philanthropyRate ?? allocations.philanthropy / (net || 1)) * 100).toFixed(2)}%)`} value={fmt(allocations.philanthropy)} color='#D4A017' />
        )}
        <Row label="→ Spending Wallet" value={fmt(allocations.spending)} positive={allocations.spending > 0} />
        {has('interest') && (
          <Row label="+ Interest on savings" value={fmt(interestEarned ?? 0)} positive={interestEarned > 0} dim={!interestEarned} />
        )}
        {has('subGoals') && (
          <Row label="+ Interest on goals"   value={fmt(subGoalInterestEarned ?? 0)} positive={subGoalInterestEarned > 0} dim={!subGoalInterestEarned} />
        )}
        {has('loans') && (
          <Row label="− Loan interest accrued" value={fmt(-(deductions.loanInterest ?? 0))} negative={deductions.loanInterest > 0} dim={!deductions.loanInterest} />
        )}
      </div>

      {/* Footer */}
      <Divider />
      <div style={{ fontFamily: 'JetBrains Mono', fontSize: '10px', color: 'var(--text-dim)', textAlign: 'center' }}>
        Generated {new Date(payslip.createdAt).toLocaleDateString()}
      </div>
    </div>
  )
}
