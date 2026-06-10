import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getTransactions } from '../../db/operations'
import { useCurrency } from '../../context/FamilyContext'
import { displayDateFull } from '../../utils/dates'

const TYPE_META = {
  salary:       { label: 'Salary',          emoji: '💼', color: 'var(--positive)' },
  bonus:        { label: 'Bonus',           emoji: '⚡', color: 'var(--positive)' },
  parent_bonus: { label: 'Bonus from parent', emoji: '🎁', color: 'var(--positive)' },
  loan_credit:  { label: 'Loan received',   emoji: '🤝', color: 'var(--positive)' },
  interest:     { label: 'Interest',        emoji: '📈', color: 'var(--positive)' },
  deposit:      { label: 'Deposit',         emoji: '🏦', color: 'var(--positive)' },
  tax:          { label: 'Tax',             emoji: '🏛',  color: 'var(--negative)' },
  rent:         { label: 'Rent',            emoji: '🏠', color: 'var(--negative)' },
  utility:      { label: 'Utility',         emoji: '💡', color: 'var(--negative)' },
  reward:       { label: 'Reward',          emoji: '🛍', color: 'var(--negative)' },
  loan_repay:   { label: 'Loan repayment',  emoji: '🔄', color: 'var(--negative)' },
  withdrawal:   { label: 'Withdrawal',      emoji: '💸', color: 'var(--negative)' },
}

const FILTERS = ['all', 'income', 'deductions']

export default function History() {
  const { currentMember } = useAuth()
  const fmt = useCurrency()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState('all')

  useEffect(() => {
    if (!currentMember) return
    getTransactions(currentMember.id, 100).then(txs => {
      setTransactions(txs)
      setLoading(false)
    })
  }, [currentMember])

  const filtered = transactions.filter(tx => {
    if (filter === 'income')     return tx.amount > 0
    if (filter === 'deductions') return tx.amount < 0
    return true
  })

  // Group by date
  const grouped = filtered.reduce((acc, tx) => {
    if (!acc[tx.date]) acc[tx.date] = []
    acc[tx.date].push(tx)
    return acc
  }, {})
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>TRANSACTION HISTORY</p>
        {/* Filter tabs */}
        <div className="flex gap-2 mt-2">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1 rounded-lg text-xs font-mono capitalize transition-all"
              style={{
                background: filter === f ? 'var(--bg-raised)' : 'transparent',
                border: `1px solid ${filter === f ? 'var(--border-bright)' : 'transparent'}`,
                color: filter === f ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {loading && (
          <p className="text-xs font-mono text-center py-8" style={{ color: 'var(--text-muted)' }}>
            Loading...
          </p>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>No transactions yet</p>
            <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-dim)' }}>They appear after your first payslip</p>
          </div>
        )}

        {dates.map(date => (
          <div key={date} className="flex flex-col gap-1.5">
            <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>
              {displayDateFull(date)}
            </p>
            {grouped[date].map(tx => {
              const meta = TYPE_META[tx.type] ?? { label: tx.type, emoji: '•', color: 'var(--text-muted)' }
              const isPositive = tx.amount > 0
              return (
                <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <span className="text-lg shrink-0">{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                      {tx.description}
                    </p>
                    <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {meta.label}
                    </p>
                  </div>
                  <span className="text-sm font-mono font-semibold shrink-0" style={{ color: meta.color }}>
                    {isPositive ? '+' : ''}{fmt(tx.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
