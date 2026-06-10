import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useFamily, useCurrency } from '../../context/FamilyContext'
import { getFamilyId } from '../../utils/family'
import { displayDateFull } from '../../utils/dates'
import { ChevronLeft, Landmark, Target, Vote } from 'lucide-react'
import {
  getTaxTransactions,
  getPendingTaxGoalVotes,
  addTaxGoalVote,
  cancelMyTaxGoalVote,
} from '../../db/operations'

// ── Thermometer (copy of parent version, read-only) ──────────────────────────
function Thermometer({ balance, goal }) {
  if (!goal || goal <= 0) return null
  const pct   = Math.min(1, balance / goal)
  const H = 100, W = 28, barH = Math.round(pct * (H - 12)), radius = W / 2
  const color = pct >= 1 ? '#4ade80' : pct >= 0.6 ? '#fbbf24' : '#60a5fa'
  return (
    <svg width={W + 16} height={H + 20} viewBox={`0 0 ${W + 16} ${H + 20}`}>
      <line x1={2} y1={6} x2={W + 14} y2={6}
        stroke="var(--border-bright)" strokeWidth="1.5" strokeDasharray="3,2" />
      <rect x={8} y={6} width={W} height={H} rx={radius}
        fill="var(--bg-raised)" stroke="var(--border)" strokeWidth="1" />
      {barH > 0 && (
        <rect x={8} y={6 + (H - barH)} width={W} height={barH}
          rx={barH >= H ? radius : `0 0 ${radius} ${radius}`}
          fill={color} opacity="0.75" />
      )}
      <text x={8 + W / 2} y={6 + H / 2 + 4} textAnchor="middle"
        fontSize="8" fontFamily="monospace" fontWeight="bold" fill="var(--text-primary)">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}

// ── Mini contribution bar chart ───────────────────────────────────────────────
function ContributionBars({ txs }) {
  if (!txs.length) return null
  const vals   = txs.map(t => Math.abs(t.amount))
  const maxVal = Math.max(...vals) || 1
  const W = 280, H = 48, barW = Math.max(4, Math.min(20, Math.floor((W - 4) / vals.length) - 2))

  // colour: brighter = higher contribution relative to own max
  const color = (v) => {
    const pct = v / maxVal
    if (pct >= 0.85) return '#4ade80'
    if (pct >= 0.6)  return '#86efac'
    if (pct >= 0.35) return '#fbbf24'
    return '#60a5fa'
  }

  const spacing = vals.length <= 12 ? (W / vals.length) : barW + 2

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
        {vals.map((v, i) => {
          const bh  = Math.max(3, Math.round((v / maxVal) * (H - 4)))
          const x   = i * spacing + (spacing - barW) / 2
          return (
            <rect key={i}
              x={x.toFixed(1)} y={(H - bh).toFixed(1)}
              width={barW} height={bh}
              rx={2} fill={color(v)} opacity="0.85" />
          )
        })}
      </svg>
      <div className="flex justify-between mt-0.5">
        <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'var(--text-dim)' }}>
          {txs[0]?.date?.slice(0, 7)}
        </span>
        <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'var(--text-dim)' }}>
          {txs[txs.length - 1]?.date?.slice(0, 7)}
        </span>
      </div>
      <div className="flex gap-3 flex-wrap mt-1">
        {[
          { label: 'HIGH',   color: '#4ade80' },
          { label: 'MEDIUM', color: '#fbbf24' },
          { label: 'LOW',    color: '#60a5fa' },
        ].map(z => (
          <div key={z.label} className="flex items-center gap-1">
            <div style={{ width: 8, height: 8, borderRadius: 1, background: z.color }} />
            <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'var(--text-dim)' }}>{z.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function FamilyFund() {
  const navigate         = useNavigate()
  const { currentMember } = useAuth()
  const { family }       = useFamily()
  const fmt              = useCurrency()

  const [taxTxs,       setTaxTxs]       = useState([])
  const [myVote,       setMyVote]       = useState(null)   // pending vote from this child
  const [goalDesc,     setGoalDesc]     = useState('')
  const [goalAmount,   setGoalAmount]   = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [voteError,    setVoteError]    = useState('')
  const [cancelling,   setCancelling]   = useState(false)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    if (!currentMember) return
    Promise.all([
      getTaxTransactions(currentMember.id),
      getPendingTaxGoalVotes(getFamilyId()),
    ]).then(([txs, votes]) => {
      setTaxTxs(txs)
      setMyVote(votes.find(v => v.memberId === currentMember.id) ?? null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [currentMember?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const balance  = family?.taxFundBalance ?? 0
  const history  = [...(family?.taxFundHistory ?? [])].reverse()
  const config   = family?.config ?? {}
  const goal     = config.taxFundGoal ?? 0
  const goalLabel = config.taxFundGoalLabel ?? ''

  const totalContrib = taxTxs.reduce((s, t) => s + Math.abs(t.amount), 0)

  const handleVote = async () => {
    const amt = parseFloat(goalAmount)
    if (!goalDesc.trim())        { setVoteError('Enter a goal description'); return }
    if (!amt || amt <= 0)        { setVoteError('Enter a target amount'); return }
    setSubmitting(true)
    setVoteError('')
    try {
      await addTaxGoalVote(currentMember.id, getFamilyId(), goalDesc.trim(), amt)
      const votes = await getPendingTaxGoalVotes(getFamilyId())
      setMyVote(votes.find(v => v.memberId === currentMember.id) ?? null)
      setGoalDesc('')
      setGoalAmount('')
    } catch (e) {
      setVoteError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await cancelMyTaxGoalVote(currentMember.id)
      setMyVote(null)
    } catch { /* ignore */ }
    finally { setCancelling(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => navigate('/child/home')}
          className="flex items-center gap-1 mb-3 -ml-1"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
          <ChevronLeft size={16} />
          <span className="text-xs font-mono">Home</span>
        </button>
        <div className="flex items-center gap-2">
          <Landmark size={18} style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            Family Fund
          </h2>
        </div>
        <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Everyone contributes. Everyone benefits.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">

        {/* Balance + thermometer */}
        <div className="flex items-center gap-4 p-4 rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {goal > 0 && <Thermometer balance={balance} goal={goal} />}
          <div className="flex-1">
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>TOTAL BALANCE</p>
            <p className="text-3xl font-mono font-bold mt-0.5" style={{ color: 'var(--positive)' }}>
              {fmt(balance)}
            </p>
            {goal > 0 && (
              <div className="mt-2">
                <div className="flex items-center gap-1">
                  <Target size={11} style={{ color: 'var(--accent-blue)' }} />
                  <p className="text-xs font-mono" style={{ color: 'var(--accent-blue)' }}>
                    Goal: {goalLabel || fmt(goal)}
                  </p>
                </div>
                {goalLabel && (
                  <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                    Target: {fmt(goal)} · {fmt(Math.max(0, goal - balance))} to go
                  </p>
                )}
              </div>
            )}
            {goal <= 0 && (
              <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-dim)' }}>
                No goal set yet — suggest one below!
              </p>
            )}
          </div>
        </div>

        {/* Your contributions */}
        <div className="p-4 rounded-xl flex flex-col gap-3"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>YOUR CONTRIBUTIONS</p>
          {loading ? (
            <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>Loading...</p>
          ) : taxTxs.length === 0 ? (
            <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
              No tax deductions yet — your first payslip will show up here
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono font-bold" style={{ color: '#4ade80' }}>
                  {fmt(totalContrib)}
                </span>
                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  across {taxTxs.length} payslip{taxTxs.length !== 1 ? 's' : ''}
                </span>
              </div>
              <ContributionBars txs={taxTxs} />
              <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                Each bar = one payslip · height = amount · colour = relative size
              </p>
            </>
          )}
        </div>

        {/* Vote for next goal */}
        <div className="p-4 rounded-xl flex flex-col gap-3"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Vote size={14} style={{ color: 'var(--accent-blue)' }} />
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SUGGEST NEXT GOAL</p>
          </div>

          {myVote ? (
            <div className="flex flex-col gap-2">
              <div className="p-3 rounded-xl"
                style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)' }}>
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>YOUR SUGGESTION</p>
                <p className="text-sm font-mono font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
                  {myVote.description}
                </p>
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--accent-blue)' }}>
                  Target: {fmt(myVote.amount)}
                </p>
                <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-dim)' }}>
                  ⏳ Waiting for parent to approve
                </p>
              </div>
              <button onClick={handleCancel} disabled={cancelling}
                className="text-xs font-mono py-2 rounded-xl active:scale-95"
                style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                {cancelling ? 'Cancelling...' : 'Cancel my suggestion'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                What should the family save up for?
              </p>
              <input
                className="w-full px-3 py-2 rounded-xl text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                placeholder="e.g. Family trip to Goa"
                value={goalDesc}
                onChange={e => setGoalDesc(e.target.value)}
              />
              <input
                type="number"
                className="w-full px-3 py-2 rounded-xl text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                placeholder="Target amount"
                value={goalAmount}
                onChange={e => setGoalAmount(e.target.value)}
              />
              {voteError && (
                <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{voteError}</p>
              )}
              <button onClick={handleVote} disabled={submitting}
                className="w-full py-2.5 rounded-xl text-sm font-mono font-semibold active:scale-95"
                style={{ background: 'rgba(96,165,250,0.15)', color: 'var(--accent-blue)', border: '1px solid rgba(96,165,250,0.3)' }}>
                {submitting ? 'Submitting...' : 'Submit Suggestion'}
              </button>
            </div>
          )}
        </div>

        {/* Fund spend history */}
        {history.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>FUND HISTORY</p>
            {history.filter(e => e.type === 'debit').map(entry => (
              <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <span className="text-base shrink-0">🎉</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                    {entry.description}
                  </p>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                    {displayDateFull(entry.date)}
                  </p>
                </div>
                <span className="text-sm font-mono font-semibold shrink-0"
                  style={{ color: 'var(--positive)' }}>
                  {fmt(entry.amount)}
                </span>
              </div>
            ))}
            {history.filter(e => e.type === 'debit').length === 0 && (
              <p className="text-xs font-mono px-1" style={{ color: 'var(--text-dim)' }}>
                No family spends yet — the fund is growing!
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
