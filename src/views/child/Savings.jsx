import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuth } from '../../context/AuthContext'
import { useFamily, useCurrency } from '../../context/FamilyContext'
import { getPayslips, addMemberRequest, transferSavingsToWallet } from '../../db/operations'
import { shortDate, today } from '../../utils/dates'
import { projectSavingsGrowth } from '../../engine/interest'
import { X } from 'lucide-react'
import { getFamilyId } from '../../utils/family'

const CustomTooltip = ({ active, payload }) => {
  const fmt = useCurrency()
  if (!active || !payload?.length) return null
  return (
    <div className="px-2 py-1.5 rounded text-xs font-mono"
      style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
      {fmt(payload[0].value)}
    </div>
  )
}

// ── Savings withdrawal sheet ──────────────────────────────────────────────────
const WITHDRAW_DESTS = [
  { id: 'wallet', label: 'Spending Wallet', hint: 'Instant — no approval needed', instant: true  },
  { id: 'cash',   label: 'Physical Cash',   hint: 'Parent hands you cash',        instant: false },
  { id: 'bank',   label: 'Bank Transfer',   hint: 'Transferred to your bank',     instant: false },
]

function SavingsWithdrawSheet({ savings, memberId, onClose, onDone, fmt }) {
  const [dest,    setDest]    = useState('wallet')
  const [amount,  setAmount]  = useState('')
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState('')

  const max       = savings
  const parsed    = Math.min(Number(amount) || 0, max)
  const isInstant = WITHDRAW_DESTS.find(d => d.id === dest)?.instant ?? false

  const handleSubmit = async () => {
    if (!parsed || parsed <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError('')
    try {
      if (isInstant) {
        await transferSavingsToWallet(memberId, parsed)
        onDone?.()
      } else {
        await addMemberRequest({
          id: crypto.randomUUID(),
          familyId: getFamilyId(),
          memberId,
          type: 'savings_withdrawal',
          amount: parsed,
          description: `Savings withdrawal — ${dest === 'bank' ? 'bank transfer' : 'physical cash'}${note.trim() ? ': ' + note.trim() : ''}`,
          metadata: { destination: dest, note: note.trim() },
          requestedAt: Date.now(),
        })
      }
      setDone(true)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const doneEmoji   = isInstant ? '✅' : '📤'
  const doneTitle   = isInstant ? 'Moved to wallet!' : 'Request sent!'
  const doneSubtitle = isInstant
    ? `${fmt(parsed)} is now in your spending wallet.`
    : 'Your parent will approve the cash or bank transfer.'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-2xl flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            Withdraw from Savings
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 px-4">
            <span className="text-5xl">{doneEmoji}</span>
            <p className="text-sm font-mono font-semibold" style={{ color: 'var(--positive)' }}>{doneTitle}</p>
            <p className="text-xs font-mono text-center" style={{ color: 'var(--text-muted)' }}>{doneSubtitle}</p>
            <button onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-mono font-semibold mt-2"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              Close
            </button>
          </div>
        ) : (
          <div className="px-4 py-4 flex flex-col gap-4">
            {/* Balance */}
            <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-raised)' }}>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SAVINGS BALANCE</p>
              <p className="text-base font-mono font-bold mt-0.5" style={{ color: '#60a5fa' }}>{fmt(max)}</p>
            </div>

            {/* Destination */}
            <div className="flex flex-col gap-2">
              {WITHDRAW_DESTS.map(opt => (
                <button key={opt.id} onClick={() => setDest(opt.id)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
                  style={{
                    background: dest === opt.id ? 'rgba(96,165,250,0.1)' : 'var(--bg-raised)',
                    border: `1px solid ${dest === opt.id ? 'rgba(96,165,250,0.35)' : 'var(--border)'}`,
                  }}>
                  <div className="flex flex-col items-start">
                    <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600,
                      color: dest === opt.id ? '#60a5fa' : 'var(--text-primary)' }}>
                      {opt.label}
                    </span>
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-dim)' }}>
                      {opt.hint}
                    </span>
                  </div>
                  {dest === opt.id && (
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: opt.instant ? 'var(--positive)' : 'var(--warning)' }}>
                      {opt.instant ? 'INSTANT' : 'NEEDS APPROVAL'}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Amount */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 flex-wrap">
                {[50, 100, 250, 500].filter(v => v <= max).map(v => (
                  <button key={v} onClick={() => setAmount(String(v))}
                    className="flex-1 py-2 rounded-lg text-xs font-mono font-semibold transition-all"
                    style={{
                      background: amount === String(v) ? 'rgba(96,165,250,0.12)' : 'var(--bg-raised)',
                      border: `1px solid ${amount === String(v) ? 'rgba(96,165,250,0.3)' : 'var(--border)'}`,
                      color: amount === String(v) ? '#60a5fa' : 'var(--text-muted)',
                    }}>{fmt(v)}</button>
                ))}
              </div>
              <input type="number" min={1} max={max} value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Custom amount"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Note (only for approval flows) */}
            {!isInstant && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>NOTE (optional)</label>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Buying a gift"
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
            )}

            {parsed > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  {isInstant ? 'Savings after transfer' : 'Savings after approval'}
                </span>
                <span className="text-xs font-mono font-semibold" style={{ color: '#60a5fa' }}>
                  {fmt(max - parsed)} remaining
                </span>
              </div>
            )}

            {error && <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{error}</p>}

            <button onClick={handleSubmit} disabled={saving || !parsed}
              className="w-full py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
              style={{
                background: saving || !parsed ? 'var(--border)' : 'rgba(96,165,250,0.15)',
                border: '1px solid rgba(96,165,250,0.3)',
                color: saving || !parsed ? 'var(--text-dim)' : '#60a5fa',
              }}>
              {saving ? 'Processing...' : isInstant
                ? `Move ${parsed ? fmt(parsed) : '—'} to wallet`
                : `Request ${parsed ? fmt(parsed) : '—'} withdrawal`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Savings() {
  const { currentMember, refreshMember } = useAuth()
  const { family } = useFamily()
  const fmt = useCurrency()
  const [payslips,      setPayslips]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [showWithdraw,  setShowWithdraw]  = useState(false)

  useEffect(() => {
    if (!currentMember) return
    getPayslips(currentMember.id).then(p => {
      setPayslips(p)
      setLoading(false)
    })
  }, [currentMember])

  const accounts      = currentMember?.accounts ?? {}
  const savings       = accounts.savings ?? 0
  const subGoals      = accounts.subGoals ?? []
  const subGoalTotal  = subGoals.reduce((s, g) => s + (g.balance ?? 0), 0)
  const totalSavings  = savings + subGoalTotal

  const interestRate  = (currentMember?.config?.interestRate ?? family?.config?.interestRate) ?? 0.02
  const autoSave      = family?.config?.autoSavePercent ?? 0.20
  const weeklyDeposit = Math.round((currentMember?.baseSalary ?? 0) * autoSave * 0.7)

  // History chart: total savings (savings account + sub-goals) per payslip
  const settledPayslips = payslips
    .filter(p => p.status === 'settled')
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))

  const historyData = [
    ...settledPayslips.slice(-7).map(p => {
      const b = p.balancesAfter ?? {}
      const goalsTotal = (b.subGoals ?? []).reduce((s, g) => s + (g.balance ?? 0), 0)
      return {
        date: shortDate(p.periodEnd),
        savings: (b.savings ?? 0) + goalsTotal,
      }
    }),
    // Always append the current live balance as the final point
    { date: 'Now', savings: totalSavings },
  ]

  // Projection from totalSavings as base
  const projectionData = projectSavingsGrowth(totalSavings, weeklyDeposit, interestRate, 8)
    .map(p => ({ week: `W+${p.week}`, balance: p.balance }))

  const totalInterestEarned = payslips.reduce((sum, p) => {
    return sum + (p.interestEarned ?? 0) + (p.subGoalInterestEarned ?? 0)
  }, 0)
  const lastPayslip = settledPayslips[settledPayslips.length - 1]
  const lastInterest = (lastPayslip?.interestEarned ?? 0) + (lastPayslip?.subGoalInterestEarned ?? 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>MY SAVINGS</p>
        <div className="flex items-end justify-between mt-0.5">
          <div>
            <p className="text-3xl font-mono font-bold" style={{ color: 'var(--accent-blue)' }}>
              {fmt(totalSavings)}
            </p>
            {subGoals.length > 0 && (
              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>
                {fmt(savings)} account + {fmt(subGoalTotal)} in {subGoals.length} goal{subGoals.length > 1 ? 's' : ''}
              </p>
            )}
            <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
              {+(interestRate * 100).toFixed(2)}% interest/period · auto-save {+(autoSave * 100).toFixed(2)}% of net pay
            </p>
          </div>
          {savings > 0 && (
            <button onClick={() => setShowWithdraw(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all active:scale-95 shrink-0"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-bright)', color: 'var(--text-muted)' }}>
              Withdraw
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>INTEREST EARNED (total)</p>
            <p className="text-lg font-mono font-bold mt-1" style={{ color: 'var(--positive)' }}>
              {fmt(totalInterestEarned)}
            </p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>LAST PERIOD INTEREST</p>
            <p className="text-lg font-mono font-bold mt-1" style={{ color: 'var(--positive)' }}>
              {fmt(lastInterest)}
            </p>
          </div>
        </div>

        {/* Sub-goals breakdown */}
        {subGoals.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SAVINGS GOALS</p>
            <div className="flex flex-col gap-2">
              {subGoals.map(g => {
                const pct = g.target > 0 ? Math.min(100, Math.round((g.balance / g.target) * 100)) : 0
                return (
                  <div key={g.id} className="p-3 rounded-xl flex flex-col gap-2"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {g.name}
                      </span>
                      <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        {pct}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-base font-mono font-bold" style={{ color: '#818cf8' }}>
                        {fmt(g.balance)}
                      </span>
                      <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                        / {fmt(g.target)} target
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full rounded-full" style={{ height: 4, background: 'var(--bg-raised)' }}>
                      <div className="rounded-full" style={{
                        height: 4,
                        width: `${pct}%`,
                        background: pct >= 100 ? 'var(--positive)' : '#818cf8',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    {pct >= 100 && (
                      <p className="text-xs font-mono" style={{ color: 'var(--positive)' }}>
                        🎉 Goal reached! You can now withdraw.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Main savings account balance (when sub-goals exist, show separately) */}
        {subGoals.length > 0 && (
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SAVINGS ACCOUNT</p>
            <p className="text-lg font-mono font-bold mt-1" style={{ color: '#60a5fa' }}>{fmt(savings)}</p>
            <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>
              Interest earned on this + all sub-goals
            </p>
          </div>
        )}

        {/* Savings history chart */}
        {historyData.length > 1 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SAVINGS HISTORY</p>
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={historyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#4a7fa5" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#4a7fa5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-dim)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-dim)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="savings" stroke="#4a7fa5" strokeWidth={2} fill="url(#savingsGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Projection chart */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>8-PERIOD PROJECTION</p>
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={projectionData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3d7a5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3d7a5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="week" tick={{ fontSize: 9, fill: 'var(--text-dim)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text-dim)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="balance" stroke="#3d7a5e" strokeWidth={2} fill="url(#projGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <p className="text-xs font-mono mt-1 text-center" style={{ color: 'var(--text-dim)' }}>
              Projected: {fmt(projectionData[projectionData.length - 1]?.balance ?? totalSavings)} in 8 periods
            </p>
          </div>
        </div>

        {loading && (
          <p className="text-xs font-mono text-center" style={{ color: 'var(--text-muted)' }}>Loading...</p>
        )}
        {!loading && payslips.length === 0 && (
          <p className="text-xs font-mono text-center py-4" style={{ color: 'var(--text-muted)' }}>
            History appears after your first payslip
          </p>
        )}
      </div>

      {showWithdraw && (
        <SavingsWithdrawSheet
          savings={savings}
          memberId={currentMember.id}
          fmt={fmt}
          onClose={() => setShowWithdraw(false)}
          onDone={refreshMember}
        />
      )}
    </div>
  )
}
