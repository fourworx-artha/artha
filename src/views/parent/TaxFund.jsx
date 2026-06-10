import { useState, useEffect } from 'react'
import { Landmark, ArrowUpRight, Target, Vote, Check, X } from 'lucide-react'
import { useFamily, useCurrency } from '../../context/FamilyContext'
import { updateTaxFund, updateFamilyConfig, getPendingTaxGoalVotes, approveTaxGoalVote, resolveMemberRequest } from '../../db/operations'
import { roundRupees } from '../../utils/currency'
import { displayDateFull, today } from '../../utils/dates'
import { getFamilyId } from '../../utils/family'

function Thermometer({ balance, goal }) {
  if (!goal || goal <= 0) return null
  const pct = Math.min(1, balance / goal)
  const H = 120, W = 32, barH = Math.round(pct * (H - 16)), radius = W / 2

  const color = pct >= 1 ? '#4ade80' : pct >= 0.6 ? '#fbbf24' : '#60a5fa'

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={W + 20} height={H + 24} viewBox={`0 0 ${W + 20} ${H + 24}`}>
        {/* Goal marker */}
        <line x1={4} y1={8} x2={W + 16} y2={8}
          stroke="var(--border-bright)" strokeWidth="1.5" strokeDasharray="3,2" />
        <text x={W + 18} y={11} textAnchor="end"
          fontSize="7" fontFamily="monospace" fill="var(--text-dim)">GOAL</text>

        {/* Tube background */}
        <rect x={10} y={8} width={W} height={H} rx={radius}
          fill="var(--bg-raised)" stroke="var(--border)" strokeWidth="1" />

        {/* Fill */}
        {barH > 0 && (
          <rect x={10} y={8 + (H - barH)} width={W} height={barH}
            rx={barH >= H ? radius : `0 0 ${radius} ${radius}`}
            fill={color} opacity="0.75" />
        )}

        {/* Pct label */}
        <text x={10 + W / 2} y={8 + H / 2 + 4} textAnchor="middle"
          fontSize="9" fontFamily="monospace" fontWeight="bold" fill="var(--text-primary)">
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <p style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-dim)', letterSpacing: '1px' }}>
        {pct >= 1 ? 'GOAL REACHED!' : `${Math.round(pct * 100)}% of goal`}
      </p>
    </div>
  )
}

const SPEND_REASONS = [
  'Family treat',
  'Pizza night',
  'Movie outing',
  'Board game',
  'Custom',
]

export default function TaxFund() {
  const { family, children, reload } = useFamily()
  const fmt = useCurrency()
  const memberMap = Object.fromEntries((children ?? []).map(c => [c.id, c]))

  const [amount,       setAmount]       = useState('')
  const [reason,       setReason]       = useState('')
  const [customReason, setCustomReason] = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [goalInput,    setGoalInput]    = useState('')
  const [goalLabel,    setGoalLabel]    = useState('')
  const [editingGoal,  setEditingGoal]  = useState(false)
  const [savingGoal,   setSavingGoal]   = useState(false)
  const [deletingGoal, setDeletingGoal] = useState(false)
  const [votes,        setVotes]        = useState([])
  const [actingVote,   setActingVote]   = useState(null)

  const balance   = family?.taxFundBalance ?? 0
  const history   = [...(family?.taxFundHistory ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  const config    = family?.config ?? {}
  const goal      = config.taxFundGoal ?? 0
  const goalName  = config.taxFundGoalLabel ?? ''

  // Load pending child votes
  useEffect(() => {
    getPendingTaxGoalVotes(getFamilyId()).then(setVotes).catch(() => {})
  }, [])

  const handleSaveGoal = async () => {
    const g = roundRupees(Number(goalInput))
    if (isNaN(g) || g < 0) return
    setSavingGoal(true)
    await updateFamilyConfig(getFamilyId(), { ...config, taxFundGoal: g, taxFundGoalLabel: goalLabel.trim() })
    await reload()
    setEditingGoal(false)
    setSavingGoal(false)
  }

  const handleDeleteGoal = async () => {
    setDeletingGoal(true)
    const { taxFundGoal: _g, taxFundGoalLabel: _l, ...rest } = config
    await updateFamilyConfig(getFamilyId(), rest)
    await reload()
    setDeletingGoal(false)
  }

  const handleApproveVote = async (vote) => {
    setActingVote(vote.id)
    try {
      await approveTaxGoalVote(vote.id, getFamilyId(), vote.description, vote.amount, config)
      await reload()
      setVotes([])
    } catch (e) { alert(e.message) }
    finally { setActingVote(null) }
  }

  const handleDenyVote = async (vote) => {
    setActingVote(vote.id)
    await resolveMemberRequest(vote.id, 'denied')
    setVotes(prev => prev.filter(v => v.id !== vote.id))
    setActingVote(null)
  }

  const effectiveReason = reason === 'Custom' ? customReason : reason

  const handleSpend = async () => {
    const amt = roundRupees(Number(amount))
    if (!amt || amt <= 0)   { setError('Enter a valid amount'); return }
    if (amt > balance)      { setError('Not enough in tax fund'); return }
    if (!effectiveReason)   { setError('Enter a reason'); return }

    setSaving(true)
    setError('')
    const entry = {
      id: crypto.randomUUID(),
      memberId: null,
      amount: amt,
      type: 'debit',
      description: effectiveReason,
      date: today(),
    }
    await updateTaxFund(
      getFamilyId(),
      balance - amt,
      [...(family.taxFundHistory ?? []), entry]
    )
    await reload()
    setAmount('')
    setReason('')
    setCustomReason('')
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PARENT</p>
        <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
          Family Tax Fund
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
        {/* Balance + thermometer */}
        <div className="flex items-center gap-4 p-4 rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {/* Thermometer */}
          {goal > 0 && <Thermometer balance={balance} goal={goal} />}

          {/* Balance info */}
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Landmark size={18} style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>TOTAL BALANCE</p>
            </div>
            <p className="text-3xl font-mono font-bold" style={{ color: 'var(--positive)' }}>
              {fmt(balance)}
            </p>
            <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
              Collected from family taxes
            </p>

            {/* Goal display + edit */}
            {!editingGoal && goal > 0 && (
              <div className="mt-1">
                <p className="text-xs font-mono" style={{ color: 'var(--accent-blue)' }}>
                  🎯 {goalName || fmt(goal)}
                </p>
                {goalName && (
                  <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                    Target {fmt(goal)} · {fmt(Math.max(0, goal - balance))} to go
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Target size={12} style={{ color: 'var(--text-dim)' }} />
              {editingGoal ? (
                <div className="flex flex-col gap-1.5 flex-1">
                  <input
                    className="w-full rounded px-2 py-1 text-xs font-mono outline-none"
                    style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    placeholder="Goal label (e.g. Family trip to Goa)"
                    value={goalLabel}
                    onChange={e => setGoalLabel(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <input
                      type="number" min={0}
                      value={goalInput}
                      onChange={e => setGoalInput(e.target.value)}
                      placeholder="Target amount"
                      className="flex-1 rounded px-2 py-1 text-xs font-mono outline-none"
                      style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                    <button onClick={handleSaveGoal} disabled={savingGoal}
                      className="text-xs font-mono px-2 py-1 rounded"
                      style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--positive)' }}>
                      Save
                    </button>
                    <button onClick={() => setEditingGoal(false)}
                      className="text-xs font-mono px-2 py-1 rounded"
                      style={{ color: 'var(--text-dim)' }}>
                      ×
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setGoalInput(goal > 0 ? String(goal) : ''); setGoalLabel(goalName); setEditingGoal(true) }}
                    className="text-xs font-mono"
                    style={{ color: 'var(--text-dim)' }}>
                    {goal > 0 ? 'Edit goal →' : 'Set a goal →'}
                  </button>
                  {goal > 0 && (
                    <button
                      onClick={handleDeleteGoal}
                      disabled={deletingGoal}
                      className="text-xs font-mono"
                      style={{ color: 'var(--negative)' }}>
                      {deletingGoal ? '...' : 'Delete goal'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Spend form */}
        <div className="flex flex-col gap-3 p-4 rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SPEND FROM FUND</p>

          <div className="flex flex-wrap gap-2">
            {SPEND_REASONS.map(r => (
              <button key={r} onClick={() => setReason(r)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all"
                style={{
                  background: reason === r ? 'var(--accent-blue)' : 'var(--bg-raised)',
                  border: `1px solid ${reason === r ? 'var(--accent-blue)' : 'var(--border)'}`,
                  color: reason === r ? '#fff' : 'var(--text-muted)',
                }}>
                {r}
              </button>
            ))}
          </div>

          {reason === 'Custom' && (
            <input value={customReason} onChange={e => setCustomReason(e.target.value)}
              placeholder="What's it for?"
              className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          )}

          <input type="number" min={1} max={balance}
            value={amount} onChange={e => setAmount(e.target.value)}
            placeholder={`Amount (max ${fmt(balance)})`}
            className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />

          {error && <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{error}</p>}

          <button
            disabled={saving || !amount || !effectiveReason || balance <= 0}
            onClick={handleSpend}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
            style={{
              background: (!amount || !effectiveReason || balance <= 0) ? 'var(--bg-raised)' : 'rgba(74,222,128,0.15)',
              border: `1px solid ${(!amount || !effectiveReason || balance <= 0) ? 'var(--border)' : 'rgba(74,222,128,0.3)'}`,
              color: (!amount || !effectiveReason || balance <= 0) ? 'var(--text-dim)' : 'var(--positive)',
            }}>
            <ArrowUpRight size={16} />
            {saving ? 'Processing...' : `Spend ${amount ? fmt(Number(amount)) : '—'}`}
          </button>
        </div>

        {/* Child goal suggestions */}
        {votes.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <Vote size={13} style={{ color: 'var(--accent-blue)' }} />
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                GOAL SUGGESTIONS ({votes.length})
              </p>
            </div>
            {votes.map(vote => {
              const isActing = actingVote === vote.id
              return (
                <div key={vote.id} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--bg-surface)', border: '1px solid rgba(96,165,250,0.25)', opacity: isActing ? 0.5 : 1 }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {vote.description}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono font-semibold" style={{ color: 'var(--accent-blue)' }}>
                        {fmt(vote.amount)}
                      </span>
                      <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                        {memberMap[vote.memberId]
                          ? `${memberMap[vote.memberId].avatar} ${memberMap[vote.memberId].name}`
                          : 'from child'}
                      </span>
                    </div>
                  </div>
                  <button disabled={isActing} onClick={() => handleDenyVote(vote)}
                    className="p-2 rounded-lg active:scale-95"
                    style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--negative)' }}>
                    <X size={16} />
                  </button>
                  <button disabled={isActing} onClick={() => handleApproveVote(vote)}
                    className="p-2 rounded-lg active:scale-95"
                    style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--positive)' }}>
                    <Check size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>HISTORY</p>
            {history.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <span className="text-lg shrink-0">{entry.type === 'credit' ? '📥' : '📤'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                    {entry.description}
                  </p>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {displayDateFull(entry.date)}
                  </p>
                </div>
                <span className="text-sm font-mono font-semibold shrink-0"
                  style={{ color: entry.type === 'credit' ? 'var(--positive)' : 'var(--negative)' }}>
                  {entry.type === 'credit' ? '+' : '−'}{fmt(entry.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
