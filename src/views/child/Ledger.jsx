import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFamily, useCurrency, usePeriod } from '../../context/FamilyContext'
import { getPayslips, getTransactionsForPeriod } from '../../db/operations'
import PayslipCard from '../../components/PayslipCard'
import { displayDate } from '../../utils/dates'
import { ChevronDown, ChevronUp } from 'lucide-react'

// ── Transaction type metadata (shared with History) ───────────────────────────
const TYPE_META = {
  salary:       { label: 'Salary',            emoji: '💼', color: 'var(--positive)' },
  bonus:        { label: 'Bonus',             emoji: '⚡', color: 'var(--positive)' },
  parent_bonus: { label: 'Bonus from parent', emoji: '🎁', color: 'var(--positive)' },
  loan_credit:  { label: 'Loan received',     emoji: '🤝', color: 'var(--positive)' },
  interest:     { label: 'Interest',          emoji: '📈', color: 'var(--positive)' },
  deposit:      { label: 'Deposit',           emoji: '🏦', color: 'var(--positive)' },
  tax:          { label: 'Tax',               emoji: '🏛',  color: 'var(--negative)' },
  rent:         { label: 'Rent',              emoji: '🏠', color: 'var(--negative)' },
  utility:      { label: 'Utility',           emoji: '💡', color: 'var(--negative)' },
  reward:       { label: 'Reward',            emoji: '🛍', color: 'var(--negative)' },
  loan_repay:   { label: 'Loan repayment',    emoji: '🔄', color: 'var(--negative)' },
  loan_cleared: { label: 'Loan cleared',      emoji: '🎉', color: 'var(--positive)' },
  loan_interest:{ label: 'Loan interest',     emoji: '📉', color: 'var(--negative)' },
  withdrawal:   { label: 'Withdrawal',        emoji: '💸', color: 'var(--negative)' },
}

// ── Transaction list for a period ─────────────────────────────────────────────
function PeriodTransactions({ memberId, periodStart, periodEnd }) {
  const fmt = useCurrency()
  const [txs,     setTxs]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTransactionsForPeriod(memberId, periodStart, periodEnd).then(data => {
      setTxs(data)
      setLoading(false)
    })
  }, [memberId, periodStart, periodEnd])

  if (loading) return (
    <p className="text-xs font-mono text-center py-3" style={{ color: 'var(--text-dim)' }}>
      Loading transactions...
    </p>
  )
  if (!txs?.length) return (
    <p className="text-xs font-mono text-center py-3" style={{ color: 'var(--text-dim)' }}>
      No transactions for this period
    </p>
  )

  return (
    <div className="flex flex-col gap-1.5 mt-3">
      <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>
        TRANSACTIONS
      </p>
      {txs.map(tx => {
        const meta = TYPE_META[tx.type] ?? { label: tx.type, emoji: '•', color: 'var(--text-muted)' }
        return (
          <div key={tx.id} className="flex items-center gap-3 px-3 py-2 rounded-xl"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
            <span className="text-base shrink-0">{meta.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                {tx.description}
              </p>
              <p className="text-xs font-mono" style={{ color: 'var(--text-dim)', fontSize: 10 }}>
                {meta.label} · {displayDate(tx.date)}
              </p>
            </div>
            <span className="text-xs font-mono font-semibold shrink-0" style={{ color: meta.color }}>
              {tx.amount > 0 ? '+' : ''}{fmt(tx.amount)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Payslip period label ──────────────────────────────────────────────────────
function periodId(periodEnd) {
  // e.g. "APR-18" — used as a short reference for parent-child discussion
  const d = new Date(periodEnd + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase().replace(' ', '-')
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Ledger() {
  const { currentMember }         = useAuth()
  const { family, reloadCount }   = useFamily()
  const fmt                       = useCurrency()
  const { label: periodLabel }    = usePeriod()
  const [payslips, setPayslips]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState(null)

  useEffect(() => {
    if (!currentMember) return
    getPayslips(currentMember.id).then(ps => {
      const sorted = [...ps].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
      setPayslips(sorted)
      setLoading(false)
    })
  }, [currentMember, reloadCount])

  const latest   = payslips[0]
  const archived = payslips.slice(1)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Loading...</p>
      </div>
    )
  }

  if (!latest) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>LEDGER</p>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-8 text-center">
          <span className="text-5xl">📒</span>
          <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>No payslips yet</p>
          <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
            Your ledger will appear here after your first payday
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>LEDGER</p>
        <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
          {periodLabel === 'month' ? 'Month' : 'Week'} ending {displayDate(latest.periodEnd)}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">

        {/* ── Latest period ── */}
        <div className="flex flex-col gap-2">
          {/* Draft badge */}
          {latest.status === 'draft' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
              <span className="text-xs font-mono" style={{ color: 'var(--warning)' }}>
                ⏳ Pending settlement — your parent hasn't released this payment yet
              </span>
            </div>
          )}

          <PayslipCard payslip={latest} member={currentMember} />

          {/* Transactions for latest period (only if settled) */}
          {latest.status === 'settled' && (
            <PeriodTransactions
              memberId={currentMember.id}
              periodStart={latest.periodStart}
              periodEnd={latest.periodEnd}
            />
          )}
        </div>

        {/* ── Archive ── */}
        {archived.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>
              ARCHIVE ({archived.length})
            </p>
            {archived.map(p => (
              <div key={p.id}>
                {/* Collapsed row */}
                <button
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                  style={{
                    background: 'var(--bg-surface)',
                    border: `1px solid ${expanded === p.id ? 'var(--border-bright)' : 'var(--border)'}`,
                  }}>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        {displayDate(p.periodStart)} – {displayDate(p.periodEnd)}
                      </p>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--bg-raised)', color: 'var(--text-dim)', fontSize: 9 }}>
                        {periodId(p.periodEnd)}
                      </span>
                      {p.status === 'draft' && (
                        <span className="text-xs font-mono" style={{ color: 'var(--warning)', fontSize: 9 }}>
                          ⏳
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-mono font-bold mt-0.5" style={{ color: 'var(--positive)' }}>
                      {fmt(p.net)} net
                    </p>
                  </div>
                  {expanded === p.id
                    ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} />
                    : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />
                  }
                </button>

                {/* Expanded */}
                {expanded === p.id && (
                  <div className="mt-2 flex flex-col gap-2">
                    <PayslipCard payslip={p} member={currentMember} />
                    {p.status === 'settled' && (
                      <PeriodTransactions
                        memberId={currentMember.id}
                        periodStart={p.periodStart}
                        periodEnd={p.periodEnd}
                      />
                    )}
                    {p.status === 'draft' && (
                      <p className="text-xs font-mono text-center py-2" style={{ color: 'var(--text-dim)' }}>
                        Transactions will appear after settlement
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
