import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Plus, X, FileText, CheckCircle, ClipboardCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useFamily, useCurrency, usePeriod } from '../../context/FamilyContext'
import { displayDate, today } from '../../utils/dates'
import { runPayslip, settlePayslip } from '../../engine/payslip'
import { getDueChoresForMember, buildLogMap } from '../../engine/chores'
import { getChoreLogsForDate, getChoreLogsForPeriod, giveBonus, giveLoan, getPayslips, getPayslipForPeriod, getOverdueDrafts, parentCompleteChore, parentUndoChore, updateFamilyConfig } from '../../db/operations'
import { getFamilyId } from '../../utils/family'
import PayslipCard from '../../components/PayslipCard'

// ── Parent Chore Sheet ────────────────────────────────────────────────────────
function ParentChoreSheet({ child, chores, onClose, onDone }) {
  const dateStr = today()
  const dueChores = chores.filter(c =>
    c.isActive && c.assignedTo.includes(child.id) &&
    (() => {
      const dow = new Date().getDay()
      switch (c.recurrence) {
        case 'daily':   return true
        case 'weekday': return dow >= 1 && dow <= 5
        case 'weekend': return dow === 0 || dow === 6
        case 'weekly':  return dow === 1
        case 'custom':  return true
        default:        return false
      }
    })()
  )

  const mandatory = dueChores.filter(c => c.type === 'mandatory')
  const bonus     = dueChores.filter(c => c.type === 'bonus')

  const [approved, setApproved] = useState(new Set())
  const [saving,   setSaving]   = useState(null) // choreId being toggled

  // Load already-approved logs for today
  useEffect(() => {
    getChoreLogsForDate(child.id, dateStr).then(logs => {
      const done = new Set(logs.filter(l => l.status === 'approved').map(l => l.choreId))
      setApproved(done)
    })
  }, [child.id, dateStr])

  const toggle = async (chore) => {
    setSaving(chore.id)
    try {
      if (approved.has(chore.id)) {
        await parentUndoChore(chore.id, child.id, dateStr)
        setApproved(prev => { const s = new Set(prev); s.delete(chore.id); return s })
      } else {
        await parentCompleteChore(chore.id, child.id, dateStr)
        setApproved(prev => new Set([...prev, chore.id]))
      }
      onDone?.()
    } finally { setSaving(null) }
  }

  const ChoreRow = ({ chore }) => {
    const done = approved.has(chore.id)
    const busy = saving === chore.id
    return (
      <button
        onClick={() => toggle(chore)}
        disabled={busy}
        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all active:scale-95 text-left"
        style={{
          background: done ? 'rgba(74,222,128,0.08)' : 'var(--bg-raised)',
          border: `1px solid ${done ? 'rgba(74,222,128,0.25)' : 'var(--border)'}`,
          opacity: busy ? 0.6 : 1,
        }}>
        <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: done ? 'var(--positive)' : 'var(--bg-surface)', border: `1px solid ${done ? 'var(--positive)' : 'var(--border-bright)'}` }}>
          {done && <span style={{ fontSize: 10, color: '#000' }}>✓</span>}
        </div>
        <span className="text-xs font-mono flex-1" style={{ color: done ? 'var(--positive)' : 'var(--text-primary)' }}>
          {chore.title}
        </span>
        {chore.value > 0 && (
          <span className="text-xs font-mono" style={{ color: 'var(--warning)' }}>+₹{chore.value}</span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-2xl flex flex-col max-h-[80vh]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            {child.avatar} {child.name}'s Chores — Today
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {dueChores.length === 0 && (
            <p className="text-xs font-mono text-center py-6" style={{ color: 'var(--text-muted)' }}>
              No chores due today.
            </p>
          )}
          {mandatory.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-mono" style={{ color: 'var(--text-dim)', letterSpacing: '0.06em' }}>MANDATORY</p>
              {mandatory.map(c => <ChoreRow key={c.id} chore={c} />)}
            </div>
          )}
          {bonus.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-mono" style={{ color: 'var(--text-dim)', letterSpacing: '0.06em' }}>BONUS</p>
              {bonus.map(c => <ChoreRow key={c.id} chore={c} />)}
            </div>
          )}
        </div>
        <div className="px-4 pb-6 pt-2">
          <button onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-mono font-semibold"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Give Money sheet ──────────────────────────────────────────────────────────
function GiveMoneySheet({ child, onDone, onClose }) {
  const fmt = useCurrency()
  const [tab,          setTab]          = useState('bonus') // 'bonus' | 'loan'
  const [amount,       setAmount]       = useState('')
  const [reason,       setReason]       = useState('')
  const [repay,        setRepay]        = useState('')
  const [tenure,       setTenure]       = useState('')     // weeks to pay off
  const [interestFree, setInterestFree] = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  const onTenureChange = (val) => {
    setTenure(val)
    const t = Number(val)
    const a = Number(amount)
    if (t > 0 && a > 0) setRepay(String(Math.ceil(a / t)))
  }
  const onRepayChange = (val) => {
    setRepay(val)
    const r = Number(val)
    const a = Number(amount)
    if (r > 0 && a > 0) setTenure(String(Math.ceil(a / r)))
  }
  const onAmountChange = (val) => {
    setAmount(val)
    const a = Number(val)
    const t = Number(tenure)
    if (t > 0 && a > 0) setRepay(String(Math.ceil(a / t)))
  }

  const QUICK_AMOUNTS = [10, 20, 50, 100]

  const handleSubmit = async () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (tab === 'loan') {
      const rep = Number(repay)
      if (!rep || rep <= 0) { setError('Enter a weekly repayment amount'); return }
      if (rep > amt) { setError('Repayment can\'t exceed loan amount'); return }
    }
    setSaving(true)
    setError('')
    try {
      if (tab === 'bonus') {
        await giveBonus(child.id, amt, reason.trim() || 'Bonus from parent')
      } else {
        await giveLoan(child.id, amt, Number(repay), interestFree)
      }
      await onDone()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const loanOutstanding = child.accounts?.loan?.outstanding ?? 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-2xl flex flex-col max-h-[80vh]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">{child.avatar}</span>
            <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {child.name}
            </span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {/* Tab toggle */}
          <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'var(--bg-raised)' }}>
            {['bonus', 'loan'].map(t => (
              <button key={t} onClick={() => { setTab(t); setError('') }}
                className="flex-1 py-2 rounded-lg text-xs font-mono font-semibold capitalize transition-all"
                style={{
                  background: tab === t ? 'var(--bg-surface)' : 'transparent',
                  color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: tab === t ? '1px solid var(--border)' : '1px solid transparent',
                }}>
                {t === 'bonus' ? '🎁 Bonus' : '🤝 Loan'}
              </button>
            ))}
          </div>

          {/* Outstanding loan notice */}
          {loanOutstanding > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <span className="text-xs font-mono" style={{ color: 'var(--warning)' }}>
                Outstanding loan: {fmt(loanOutstanding)} · repaying {fmt(child.accounts.loan.weeklyRepayment)}/wk
              </span>
            </div>
          )}

          {/* Quick amounts */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>AMOUNT</label>
            <div className="flex gap-2 mb-2">
              {QUICK_AMOUNTS.map(q => (
                <button key={q} onClick={() => { setAmount(String(q)); onAmountChange(String(q)) }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-mono transition-all"
                  style={{
                    background: amount === String(q) ? 'var(--accent-blue)' : 'var(--bg-raised)',
                    border: `1px solid ${amount === String(q) ? 'var(--accent-blue)' : 'var(--border)'}`,
                    color: amount === String(q) ? '#fff' : 'var(--text-muted)',
                  }}>
                  {fmt(q)}
                </button>
              ))}
            </div>
            <input
              type="number" min={1} value={amount}
              onChange={e => onAmountChange(e.target.value)}
              placeholder="Or enter custom amount"
              className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* Bonus reason */}
          {tab === 'bonus' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>REASON (optional)</label>
              <input
                value={reason} onChange={e => setReason(e.target.value)}
                placeholder="e.g. Great exam result"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          )}

          {/* Loan repayment + EMI */}
          {tab === 'loan' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>TENURE (WEEKS) — auto-calc EMI</label>
                <div className="flex gap-2 mb-1">
                  {[4, 8, 12, 16].map(w => (
                    <button key={w} onClick={() => onTenureChange(String(w))}
                      className="flex-1 py-1.5 rounded-lg text-xs font-mono transition-all"
                      style={{
                        background: tenure === String(w) ? 'rgba(251,191,36,0.2)' : 'var(--bg-raised)',
                        border: `1px solid ${tenure === String(w) ? 'rgba(251,191,36,0.4)' : 'var(--border)'}`,
                        color: tenure === String(w) ? 'var(--warning)' : 'var(--text-muted)',
                      }}>
                      {w}w
                    </button>
                  ))}
                </div>
                <input
                  type="number" min={1} value={tenure}
                  onChange={e => onTenureChange(e.target.value)}
                  placeholder="e.g. 8 weeks"
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>WEEKLY REPAYMENT — or set manually</label>
                <input
                  type="number" min={1} value={repay}
                  onChange={e => onRepayChange(e.target.value)}
                  placeholder="Deducted from each payslip"
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Interest-free toggle */}
              <button
                onClick={() => setInterestFree(v => !v)}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg w-full transition-all"
                style={{
                  background: interestFree ? 'rgba(74,222,128,0.08)' : 'var(--bg-raised)',
                  border: `1px solid ${interestFree ? 'rgba(74,222,128,0.25)' : 'var(--border)'}`,
                }}>
                <div className="text-left">
                  <p className="text-xs font-mono font-semibold" style={{ color: interestFree ? 'var(--positive)' : 'var(--text-primary)' }}>
                    Interest-free loan
                  </p>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {interestFree ? 'No interest will accrue — repayment only' : 'Interest charged each payslip'}
                  </p>
                </div>
                <div
                  className="w-10 h-5 rounded-full transition-all shrink-0"
                  style={{
                    background: interestFree ? 'var(--positive)' : 'var(--border-bright)',
                    position: 'relative',
                  }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                    style={{
                      background: '#fff',
                      left: interestFree ? '22px' : '2px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                  />
                </div>
              </button>

              {amount && repay && Number(repay) > 0 && Number(amount) > 0 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>EMI</span>
                  <span className="text-xs font-mono font-semibold" style={{ color: 'var(--warning)' }}>
                    {fmt(Number(repay))}/wk · paid off in ~{Math.ceil(Number(amount) / Number(repay))} week{Math.ceil(Number(amount) / Number(repay)) > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{error}</p>}

          <button onClick={handleSubmit} disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
            style={{
              background: saving ? 'var(--border)' : tab === 'bonus' ? 'var(--accent-blue)' : 'rgba(251,191,36,0.15)',
              border: tab === 'loan' ? '1px solid rgba(251,191,36,0.3)' : 'none',
              color: saving ? 'var(--text-dim)' : tab === 'bonus' ? '#fff' : 'var(--warning)',
            }}>
            {saving ? 'Processing...' : tab === 'bonus'
              ? `Give ${amount ? fmt(Number(amount)) : '—'} Bonus`
              : `Give ${amount ? fmt(Number(amount)) : '—'} Loan`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Settle Payslip button (run is always automatic) ───────────────────────────
function RunPayslipButton({ child, periodEnd, payday, onDone, onSettled }) {
  const [phase,       setPhase]       = useState('loading') // loading | run | draft | settled
  const [running,     setRunning]     = useState(false)
  const [draftId,     setDraftId]     = useState(null)
  const [error,       setError]       = useState(null)
  const [showPayslip, setShowPayslip] = useState(false)

  // Check for existing payslip on mount
  useEffect(() => {
    getPayslipForPeriod(child.id, periodEnd).then(existing => {
      if (!existing)                     setPhase('run')
      else if (existing.status === 'draft') { setPhase('draft'); setDraftId(existing.id) }
      else                               setPhase('settled')
    })
  }, [child.id, periodEnd])

  const handleSettle = async (payslipId) => {
    setRunning(true)
    setError(null)
    try {
      await settlePayslip(payslipId ?? draftId)
      setPhase('settled')
      setShowPayslip(false)
      await onDone()
      onSettled?.()
    } catch (e) {
      console.error('[Artha] settlePayslip error:', e)
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  if (phase === 'loading') return null
  if (phase === 'run') return null  // auto-run happens in the parent; nothing to show yet
  if (phase === 'settled') return (
    <span className="text-xs font-mono" style={{ color: 'var(--positive)' }}>✓ Settled</span>
  )
  if (error) return (
    <span className="text-xs font-mono" style={{ color: 'var(--negative)' }} title={error}>
      Error: {error.slice(0, 40)}
    </span>
  )
  if (phase === 'draft') return (
    <>
      <button onClick={() => setShowPayslip(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all active:scale-95"
        style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: 'var(--warning)' }}>
        <CheckCircle size={11} />
        Settle Pay
      </button>
      {showPayslip && (
        <PayslipSheet
          child={child}
          onClose={() => setShowPayslip(false)}
          onSettle={handleSettle}
        />
      )}
    </>
  )
  return null
}

// ── Chore completion mini-bars ────────────────────────────────────────────────
function ChoreBar({ done, total, label = 'today' }) {
  if (total === 0) return null
  const pct = Math.round((done / total) * 100)
  const color = pct === 100 ? 'var(--positive)' : pct >= 50 ? 'var(--warning)' : 'var(--negative)'
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono shrink-0" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
        {done}/{total} {label}
      </span>
    </div>
  )
}

// ── Payslip viewer sheet ──────────────────────────────────────────────────────
function PayslipSheet({ child, onClose, onSettle }) {
  const [payslip,  setPayslip]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [settling, setSettling] = useState(false)

  useEffect(() => {
    getPayslips(child.id).then(list => {
      const sorted = [...list].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
      setPayslip(sorted[0] ?? null)
      setLoading(false)
    })
  }, [child.id])

  const handleSettle = async () => {
    if (!payslip) return
    setSettling(true)
    try {
      await onSettle(payslip.id)
      onClose()
    } finally {
      setSettling(false)
    }
  }

  const isDraft = payslip?.status === 'draft'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-2xl flex flex-col max-h-[85vh]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">{child.avatar}</span>
            <div>
              <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                {child.name} — Latest Payslip
              </span>
              {isDraft && (
                <p className="text-xs font-mono" style={{ color: 'var(--warning)' }}>⏳ Pending settlement</p>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {/* Scrollable payslip */}
        <div className="overflow-y-auto px-4 py-4 flex-1">
          {loading && (
            <p className="text-xs font-mono text-center py-8" style={{ color: 'var(--text-muted)' }}>Loading...</p>
          )}
          {!loading && !payslip && (
            <p className="text-xs font-mono text-center py-8" style={{ color: 'var(--text-muted)' }}>No payslip yet</p>
          )}
          {!loading && payslip && (
            <PayslipCard payslip={payslip} member={child} />
          )}
        </div>

        {/* Settle actions — only shown for draft payslips */}
        {isDraft && onSettle && (
          <div className="px-4 py-4 flex flex-col gap-2 shrink-0"
            style={{ borderTop: '1px solid var(--border)' }}>
            {(() => {
              const canSettle = payslip && today() >= payslip.periodEnd
              return (
                <>
                  {!canSettle && (
                    <p className="text-xs font-mono text-center" style={{ color: 'var(--text-muted)' }}>
                      Settlement available from {displayDate(payslip.periodEnd)}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <button onClick={onClose}
                      className="flex-1 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
                      style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      Close
                    </button>
                    <button onClick={handleSettle} disabled={settling || !canSettle}
                      className="flex-2 py-3 px-6 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
                      style={{
                        background: !canSettle ? 'var(--bg-raised)' : settling ? 'var(--border)' : 'rgba(74,222,128,0.15)',
                        border: `1px solid ${!canSettle ? 'var(--border)' : 'rgba(74,222,128,0.35)'}`,
                        color: !canSettle ? 'var(--text-dim)' : settling ? 'var(--text-dim)' : 'var(--positive)',
                        cursor: !canSettle ? 'not-allowed' : 'pointer',
                      }}>
                      {settling ? 'Settling...' : '✓ Approve & Pay'}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ParentDashboard() {
  const { currentMember } = useAuth()
  const { family, children, chores, reload } = useFamily()
  const navigate = useNavigate()
  const fmt = useCurrency()
  const { paydayToday: payday, periodEnd, progressPeriodStart, progressPeriodEnd, label: periodLabel } = usePeriod()

  const [choreStats,     setChoreStats]     = useState({})
  const [periodStats,    setPeriodStats]    = useState({})
  const [givingTo,       setGivingTo]       = useState(null)
  const [choreSheetFor,  setChoreSheetFor]  = useState(null)
  const [viewPayslipFor, setViewPayslipFor] = useState(null)
  const [allRan,               setAllRan]               = useState(false)
  const [currentDrafts,        setCurrentDrafts]        = useState([]) // drafts for this period
  const [overdueDrafts,        setOverdueDrafts]        = useState([]) // drafts from past periods
  const [showAutoSettlePrompt, setShowAutoSettlePrompt] = useState(false)
  const autoRanRef = useRef(false)

  // Auto-run always on payday; auto-settle if family.config.autoSettle is true.
  // First-settle prompt fires when autoSettle is undefined (key not yet set).
  useEffect(() => {
    if (!payday || autoRanRef.current || !children.length || !family) return
    autoRanRef.current = true
    const autoRun = async () => {
      const results = await Promise.allSettled(children.map(c => runPayslip(c.id)))
      if (family.config?.autoSettle) {
        const settled = await Promise.allSettled(
          results.map(r => r.status === 'fulfilled' ? settlePayslip(r.value.id) : Promise.resolve())
        )
        // Check first-settle prompt after auto-settle
        const anySettled = settled.some(r => r.status === 'fulfilled')
        if (anySettled && family.config.autoSettle === undefined) {
          setShowAutoSettlePrompt(true)
        }
      }
      await reload()
      await refreshBanners()
    }
    autoRun()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family, payday, children.length])

  const checkFirstSettlePrompt = () => {
    if (family?.config?.autoSettle === undefined || family?.config?.autoSettle === null) {
      setShowAutoSettlePrompt(true)
    }
  }

  const loadChoreStats = useCallback(async () => {
    if (!children.length || !chores.length) return
    const dateStr = today()
    const stats = {}
    await Promise.all(children.map(async (child) => {
      const dueChores = getDueChoresForMember(chores, child.id)
      if (dueChores.length === 0) { stats[child.id] = { done: 0, total: 0 }; return }
      const logs = await getChoreLogsForDate(child.id, dateStr)
      const logMap = buildLogMap(logs)
      const done = dueChores.filter(c => {
        const log = logMap[c.id]
        return log && (log.status === 'approved' || log.status === 'pending')
      }).length
      stats[child.id] = { done, total: dueChores.length }
    }))
    setChoreStats(stats)
  }, [children, chores])

  useEffect(() => { loadChoreStats() }, [loadChoreStats])

  // Period-wide mandatory chore completion — mirrors payslip engine logic exactly:
  // only counts days the child actually logged something (activeDates), so the
  // numbers shown here match what drove the salary calculation.
  const loadPeriodStats = useCallback(async () => {
    if (!children.length || !chores.length || !family) return
    const pStart = progressPeriodStart
    const pEnd   = progressPeriodEnd

    // All calendar days in the period — denominator shows full workload,
    // not just days the child has logged (that logic is for the payslip engine).
    const allDates = []
    let cur = new Date(pStart + 'T12:00:00')
    const end = new Date(pEnd + 'T12:00:00')
    while (cur <= end) {
      allDates.push(cur.toISOString().slice(0, 10))
      cur = new Date(cur.getTime() + 86400000)
    }

    const stats = {}
    await Promise.all(children.map(async (child) => {
      const mandatory = chores.filter(c =>
        c.type === 'mandatory' && c.isActive && c.assignedTo.includes(child.id)
      )
      if (!mandatory.length) { stats[child.id] = { approved: 0, expected: 0 }; return }
      const logs = await getChoreLogsForPeriod(child.id, pStart, pEnd)

      let totalExpected = 0
      let totalApproved = 0
      for (const chore of mandatory) {
        let exp = 0, app = 0
        for (const date of allDates) {
          const day = new Date(date + 'T12:00:00').getDay()
          let due = false
          switch (chore.recurrence) {
            case 'daily':   due = true; break
            case 'weekday': due = day >= 1 && day <= 5; break
            case 'weekend': due = day === 0 || day === 6; break
            case 'weekly':  due = day === 1; break
            case 'custom':  due = true; break
          }
          if (due) {
            exp++
            if (logs.some(l => l.choreId === chore.id && l.date === date && l.status === 'approved')) app++
          }
        }
        if (chore.recurrence === 'custom') {
          exp = Math.min(exp, chore.daysPerWeek ?? 3)
          app = Math.min(app, chore.daysPerWeek ?? 3)
        }
        totalExpected += exp
        totalApproved += app
      }
      stats[child.id] = { approved: totalApproved, expected: totalExpected }
    }))
    setPeriodStats(stats)
  }, [children, chores, progressPeriodStart, progressPeriodEnd])

  useEffect(() => { loadPeriodStats() }, [loadPeriodStats])

  // Check for draft payslips whose period has ended
  const refreshBanners = useCallback(async () => {
    const childIds = children.map(c => c.id)
    if (!childIds.length) {
      setOverdueDrafts([]); setCurrentDrafts([]); setAllRan(false); return
    }
    const [drafts, payslipChecks] = await Promise.all([
      getOverdueDrafts(childIds, periodEnd),
      Promise.all(children.map(c => getPayslipForPeriod(c.id, periodEnd))),
    ])
    setOverdueDrafts(drafts)
    const currentPs = payslipChecks.filter(Boolean)
    setCurrentDrafts(currentPs.filter(p => p.status === 'draft'))
    setAllRan(payslipChecks.every(p => p !== null))
  }, [children, periodEnd])

  useEffect(() => { refreshBanners() }, [refreshBanners])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PARENT DASHBOARD</p>
          <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            {currentMember?.avatar} {currentMember?.name}
          </h2>
        </div>
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          Period ends {displayDate(periodEnd)}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Payday banner — run payslips */}
        {payday && !allRan && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
            <AlertCircle size={14} style={{ color: 'var(--positive)', flexShrink: 0 }} />
            <p className="text-xs font-mono" style={{ color: 'var(--positive)' }}>
              It's payday! Payslips are being prepared automatically.
            </p>
          </div>
        )}
        {/* Drafted banner — settle payslips */}
        {allRan && currentDrafts.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
            <AlertCircle size={14} style={{ color: 'var(--positive)', flexShrink: 0 }} />
            <p className="text-xs font-mono" style={{ color: 'var(--positive)' }}>
              Payslips drafted ✓ — tap "Settle Pay" for each child below to release funds.
            </p>
          </div>
        )}

        {/* Overdue settlements banner */}
        {overdueDrafts.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
            <AlertCircle size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            <p className="text-xs font-mono" style={{ color: 'var(--warning)' }}>
              {overdueDrafts.length === 1
                ? `${children.find(c => c.id === overdueDrafts[0].memberId)?.name ?? 'A child'} has an unsettled payslip — tap "Settle Pay" to release funds.`
                : `${overdueDrafts.length} unsettled payslips are ready — tap "Settle Pay" for each child.`
              }
            </p>
          </div>
        )}

        {/* Tax Fund */}
        {family && (
          <button onClick={() => navigate('/parent/tax-fund')}
            className="p-4 rounded-xl text-left w-full transition-all active:scale-95"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-mono mb-1" style={{ color: 'var(--text-muted)' }}>FAMILY TAX FUND</p>
            <p className="text-2xl font-mono font-bold" style={{ color: 'var(--positive)' }}>
              {fmt(family.taxFundBalance)}
            </p>
          </button>
        )}

        {/* Children cards */}
        <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>CHILDREN</p>
        {children.map(child => {
          const stats = choreStats[child.id]
          const loanOutstanding = child.accounts?.loan?.outstanding ?? 0
          return (
            <div key={child.id} className="p-4 rounded-xl"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', cursor: 'pointer' }}
              onClick={() => navigate(`/parent/child/${child.id}`)}>
              {/* Name row */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{child.avatar}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {child.name}
                    </p>
                    {(() => {
                      const score = child.creditScore ?? 500
                      const color = score >= 700 ? 'var(--positive)' : score >= 500 ? 'var(--warning)' : 'var(--negative)'
                      const bg    = score >= 700 ? 'rgba(74,222,128,0.1)' : score >= 500 ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)'
                      return (
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded-full"
                          style={{ background: bg, color, border: `1px solid ${bg}` }}>
                          {score}
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {fmt(child.baseSalary)}/{periodLabel}
                  </p>
                </div>
              </div>

              {/* Actions row */}
              <div className="flex items-center gap-2 mb-3" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setChoreSheetFor(child)}
                  className="p-1.5 rounded-lg transition-all active:scale-95"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                  title="Mark chores done">
                  <ClipboardCheck size={14} />
                </button>
                <RunPayslipButton child={child} periodEnd={periodEnd} payday={payday} onDone={async () => { await reload(); await refreshBanners() }} onSettled={checkFirstSettlePrompt} />
                <button
                  onClick={() => setViewPayslipFor(child)}
                  className="p-1.5 rounded-lg transition-all active:scale-95"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                  title="View latest payslip">
                  <FileText size={14} />
                </button>
                <button
                  onClick={() => setGivingTo(child)}
                  className="p-1.5 rounded-lg transition-all active:scale-95"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                  title="Give bonus or loan">
                  <Plus size={14} />
                </button>
              </div>

              {/* Outstanding loan chip */}
              {loanOutstanding > 0 && (
                <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg w-fit"
                  style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--warning)' }}>
                    🤝 Loan: {fmt(loanOutstanding)} outstanding
                  </span>
                </div>
              )}

              {/* Chore bars */}
              {stats && <ChoreBar done={stats.done} total={stats.total} label="today" />}
              {periodStats[child.id] && (
                <ChoreBar
                  done={periodStats[child.id].approved}
                  total={periodStats[child.id].expected}
                  label="this period"
                />
              )}

              {/* Balances */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  { label: 'SPENDING',     value: child.accounts?.spending     ?? 0, color: 'var(--positive)' },
                  { label: 'SAVINGS',      value: child.accounts?.savings      ?? 0, color: 'var(--accent-blue)' },
                  { label: 'PHILANTHROPY', value: child.accounts?.philanthropy ?? 0, color: '#D4A017' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-2 rounded-lg text-center" style={{ background: 'var(--bg-raised)' }}>
                    <p className="text-xs font-mono" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>{label}</p>
                    <p className="text-sm font-mono font-semibold mt-0.5" style={{ color }}>{fmt(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Parent Chore sheet */}
      {choreSheetFor && (
        <ParentChoreSheet
          child={choreSheetFor}
          chores={chores}
          onClose={() => setChoreSheetFor(null)}
          onDone={loadChoreStats}
        />
      )}

      {/* Give Money sheet */}
      {givingTo && (
        <GiveMoneySheet
          child={givingTo}
          onDone={reload}
          onClose={() => setGivingTo(null)}
        />
      )}

      {/* Payslip viewer sheet */}
      {viewPayslipFor && (
        <PayslipSheet
          child={viewPayslipFor}
          onClose={() => setViewPayslipFor(null)}
        />
      )}

      {/* First-settle prompt — shown once to set autoSettle preference */}
      {showAutoSettlePrompt && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-t-2xl flex flex-col px-5 py-6 gap-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex justify-center">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
            </div>
            <div>
              <p className="text-base font-mono font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                🎉 First payslip settled!
              </p>
              <p className="text-sm font-mono" style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                Want future payslips to settle automatically on payday? You can still review them afterwards, and change this anytime in Economic Controls.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={async () => {
                  await updateFamilyConfig(getFamilyId(), { ...family.config, autoSettle: true })
                  setShowAutoSettlePrompt(false)
                  await reload()
                }}
                className="w-full py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
                style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.35)', color: 'var(--positive)' }}>
                Yes, automate ✓
              </button>
              <button
                onClick={async () => {
                  await updateFamilyConfig(getFamilyId(), { ...family.config, autoSettle: false })
                  setShowAutoSettlePrompt(false)
                  await reload()
                }}
                className="w-full py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                No, I'll settle manually
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
